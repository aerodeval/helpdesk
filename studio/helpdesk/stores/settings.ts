import { ref, computed } from 'vue'
import { call, toast, FileUploadHandler } from 'frappe-ui'

// Shared state + actions for the portal settings modal, used by every page
// script via `useSettingsModal()`. Backed by helpdesk.api.organization.

const MANAGER_ROLE = 'HD Customer Manager'
const MEMBER_ROLE = 'HD Customer'

// One instance for the whole app. Every page script spreads this alongside
// KbSettings.vue's own call, so per-call state would give each of them a private
// copy — a load in one would leave the other showing stale settings.
const store = createSettingsStore()

export function useSettingsModal() {
  return store
}

function createSettingsStore() {
  const settingsOpen = ref(false)
  const settingsTab = ref('profile') // 'profile' | 'members' | 'organization'
  const settingsData = ref(null)
  const settingsBusy = ref(false)

  // A contact can belong to several organizations, so the modal lists them and
  // drills into one at a time. `selectedOrg` null means the list is showing.
  const selectedOrg = ref(null)
  const orgDetail = ref(null)

  const settingsUser = computed(() => settingsData.value?.user || {})
  const organizations = computed(() => settingsData.value?.organizations || [])
  const settingsOrg = computed(() => orgDetail.value)
  const isOrgManager = computed(() => Boolean(orgDetail.value?.is_manager))
  const isAgentUser = computed(() => Boolean(settingsData.value?.is_agent))
  const orgMembers = computed(() => orgDetail.value?.members || [])

  // Form state, seeded from the server payload on every load
  const profileFirstName = ref('')
  const profileLastName = ref('')
  const orgName = ref('')
  const orgEmail = ref('')
  const orgEmailEditing = ref(false)
  const inviteOpen = ref(false)
  const inviteEmail = ref('')
  const inviteRole = ref('Member') // 'Member' | 'Manager'

  // Destructive actions route through one dialog rather than window.confirm, the
  // way the agent portal's ConfirmDialog does.
  const confirmAction = ref(null)

  function askConfirm(options) {
    confirmAction.value = options
  }

  function cancelConfirm() {
    confirmAction.value = null
  }

  function acceptConfirm() {
    const pending = confirmAction.value
    confirmAction.value = null
    return pending?.action?.()
  }

  async function loadSettings() {
    try {
      settingsData.value = await call('helpdesk.api.organization.get_settings')
      profileFirstName.value = settingsUser.value.first_name || ''
      profileLastName.value = settingsUser.value.last_name || ''
      if (selectedOrg.value) await loadOrganization(selectedOrg.value)
    } catch (error) {
      console.error(error)
      toast.error('Could not load settings')
    }
  }

  // --- Organizations: list -> detail ---

  async function loadOrganization(name) {
    try {
      orgDetail.value = await call('helpdesk.api.organization.get_organization', {
        customer: name,
      })
      orgName.value = orgDetail.value.customer_name || ''
      orgEmail.value = orgDetail.value.email || ''
    } catch (error) {
      console.error(error)
      toast.error(serverMessage(error) || 'Could not open organization')
      closeOrganization()
    }
  }

  function openOrganization(name) {
    selectedOrg.value = name
    orgDetail.value = null
    orgEmailEditing.value = false
    inviteOpen.value = false
    return loadOrganization(name)
  }

  function closeOrganization() {
    selectedOrg.value = null
    orgDetail.value = null
  }

  function openSettings(tab) {
    settingsTab.value = tab || 'profile'
    settingsOpen.value = true
    orgEmailEditing.value = false
    inviteOpen.value = false
    closeOrganization()
    loadSettings()
  }

  function closeSettings() {
    settingsOpen.value = false
  }

  async function run(action, successMessage) {
    if (settingsBusy.value) return
    settingsBusy.value = true
    try {
      await action()
      if (successMessage) toast.success(successMessage)
      await loadSettings()
    } catch (error) {
      console.error(error)
      toast.error(serverMessage(error) || 'Something went wrong')
    } finally {
      settingsBusy.value = false
    }
  }

  function serverMessage(error) {
    return error?.messages?.[0] || error?.message
  }

  // --- Profile ---

  function saveProfile() {
    return run(
      () => call('helpdesk.api.organization.update_profile', {
        first_name: profileFirstName.value,
        last_name: profileLastName.value,
      }),
      'Profile updated'
    )
  }

  function pickImage(onUploaded) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files && input.files[0]
      if (!file) return
      try {
        const uploaded = await new FileUploadHandler().upload(file, { private: false, optimize: true })
        await onUploaded(uploaded.file_url)
      } catch (error) {
        console.error(error)
        toast.error('Could not upload image')
      }
    }
    input.click()
  }

  function uploadProfileImage() {
    pickImage((fileUrl) =>
      run(() => call('helpdesk.api.organization.update_profile', { image: fileUrl }), 'Photo updated')
    )
  }

  function removeProfileImage() {
    return run(() => call('helpdesk.api.organization.update_profile', { image: '' }), 'Photo removed')
  }

  // --- Manage organization ---

  function sendInvite() {
    const email = inviteEmail.value.trim()
    if (!email) {
      toast.error('Please enter an email address')
      return
    }
    return run(async () => {
      const result = await call('frappe.core.api.user_invitation.invite_by_email', {
        emails: email,
        roles: [inviteRole.value === 'Manager' ? MANAGER_ROLE : MEMBER_ROLE],
        redirect_to_path: '/helpdesk',
        app_name: 'helpdesk',
        customer: selectedOrg.value,
      })
      if (result.invited_emails?.length) {
        toast.success('Invitation sent')
        inviteEmail.value = ''
        inviteOpen.value = false
      } else if (result.pending_invite_emails?.length) {
        toast.error('An invitation for this email is already pending')
      } else if (result.accepted_invite_emails?.length) {
        toast.error('This person has already joined')
      } else if (result.disabled_user_emails?.length) {
        toast.error('This user account is disabled')
      }
    })
  }

  function setMemberRole(member, roleLabel) {
    if (member.is_owner || member.pending) return
    const isManager = roleLabel === 'Manager'
    if (isManager === Boolean(member.is_manager)) return
    return run(
      () => call('helpdesk.api.organization.update_member_role', {
        customer: selectedOrg.value,
        contact: member.contact,
        is_manager: isManager,
      }),
      'Role updated'
    )
  }

  function removeMember(member) {
    if (member.is_owner) return
    if (member.pending) return cancelInvitation(member)
    askConfirm({
      title: 'Remove member',
      message: `${member.full_name} will lose access to this organization's tickets.`,
      label: 'Remove',
      action: () =>
        run(
          () => call('helpdesk.api.organization.remove_member', {
            customer: selectedOrg.value,
            contact: member.contact,
          }),
          'Member removed'
        ),
    })
  }

  function cancelInvitation(member) {
    askConfirm({
      title: 'Cancel invitation',
      message: `The invitation sent to ${member.email} will no longer be usable.`,
      label: 'Cancel invitation',
      action: () =>
        run(
          () => call('helpdesk.api.organization.cancel_invitation', {
            customer: selectedOrg.value,
            invitation: member.invitation,
          }),
          'Invitation cancelled'
        ),
    })
  }

  // --- Organization settings ---

  function saveOrganization() {
    const name = orgName.value.trim()
    if (!name) {
      toast.error('Please enter an organization name')
      return
    }
    return run(
      async () => {
        // Renaming returns the new docname, which is also the drill-in key.
        const renamed = await call('helpdesk.api.organization.update_organization', {
          customer: selectedOrg.value,
          customer_name: name,
        })
        selectedOrg.value = renamed
      },
      'Organization updated'
    )
  }

  function saveOrgEmail() {
    return run(async () => {
      await call('helpdesk.api.organization.update_organization', {
        customer: selectedOrg.value,
        email: orgEmail.value.trim(),
      })
      orgEmailEditing.value = false
    }, 'Admin email updated')
  }

  function uploadOrgImage() {
    pickImage((fileUrl) =>
      run(() => call('helpdesk.api.organization.update_organization', {
        customer: selectedOrg.value,
        image: fileUrl,
      }), 'Logo updated')
    )
  }

  function removeOrgImage() {
    return run(() => call('helpdesk.api.organization.update_organization', {
      customer: selectedOrg.value,
      image: '',
    }), 'Logo removed')
  }

  function deleteOrganization() {
    const org = settingsOrg.value
    if (!org) return
    askConfirm({
      title: 'Delete organization',
      message: `${org.customer_name} and all associated data will be removed. This cannot be undone.`,
      label: 'Delete',
      action: () =>
        run(async () => {
          await call('helpdesk.api.organization.delete_organization', {
            customer: selectedOrg.value,
          })
          closeOrganization()
        }, 'Organization deleted'),
    })
  }

  return {
    settingsOpen,
    settingsTab,
    settingsBusy,
    settingsUser,
    organizations,
    selectedOrg,
    settingsOrg,
    isOrgManager,
    isAgentUser,
    orgMembers,
    profileFirstName,
    profileLastName,
    orgName,
    orgEmail,
    orgEmailEditing,
    inviteOpen,
    inviteEmail,
    inviteRole,
    openSettings,
    closeSettings,
    openOrganization,
    closeOrganization,
    confirmAction,
    cancelConfirm,
    acceptConfirm,
    saveProfile,
    uploadProfileImage,
    removeProfileImage,
    sendInvite,
    setMemberRole,
    removeMember,
    cancelInvitation,
    saveOrganization,
    saveOrgEmail,
    uploadOrgImage,
    removeOrgImage,
    deleteOrganization,
  }
}
