import { ref, computed } from 'vue'
import { call, toast, FileUploadHandler } from 'frappe-ui'

// Shared state + actions for the portal settings modal, used by every page
// script via `useSettingsModal()`. Backed by helpdesk.api.organization.

const MANAGER_ROLE = 'HD Customer Manager'
const MEMBER_ROLE = 'HD Customer'

export function useSettingsModal() {
  const settingsOpen = ref(false)
  const settingsTab = ref('profile') // 'profile' | 'members' | 'organization'
  const settingsData = ref(null)
  const settingsBusy = ref(false)

  const settingsUser = computed(() => settingsData.value?.user || {})
  const settingsOrg = computed(() => settingsData.value?.organization || null)
  const isOrgManager = computed(() => Boolean(settingsData.value?.is_manager && settingsOrg.value))
  const isAgentUser = computed(() => Boolean(settingsData.value?.is_agent))
  const orgMembers = computed(() => settingsData.value?.members || [])

  // Form state, seeded from the server payload on every load
  const profileFirstName = ref('')
  const profileLastName = ref('')
  const orgName = ref('')
  const orgEmail = ref('')
  const orgEmailEditing = ref(false)
  const inviteOpen = ref(false)
  const inviteEmail = ref('')
  const inviteRole = ref('Member') // 'Member' | 'Manager'

  async function loadSettings() {
    try {
      settingsData.value = await call('helpdesk.api.organization.get_settings')
      profileFirstName.value = settingsUser.value.first_name || ''
      profileLastName.value = settingsUser.value.last_name || ''
      orgName.value = settingsOrg.value?.customer_name || ''
      orgEmail.value = settingsOrg.value?.email || ''
    } catch (error) {
      console.error(error)
      toast.error('Could not load settings')
    }
  }

  function openSettings(tab) {
    settingsTab.value = tab || 'profile'
    settingsOpen.value = true
    orgEmailEditing.value = false
    inviteOpen.value = false
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
        customer: settingsOrg.value.name,
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
        contact: member.contact,
        is_manager: isManager,
      }),
      'Role updated'
    )
  }

  function removeMember(member) {
    if (member.is_owner) return
    const label = member.pending ? 'invitation for ' + member.email : member.full_name
    if (!window.confirm('Remove ' + label + '?')) return
    if (member.pending) {
      return run(
        () => call('helpdesk.api.organization.cancel_invitation', { invitation: member.invitation }),
        'Invitation cancelled'
      )
    }
    return run(
      () => call('helpdesk.api.organization.remove_member', { contact: member.contact }),
      'Member removed'
    )
  }

  // --- Organization settings ---

  function saveOrganization() {
    const name = orgName.value.trim()
    if (!name) {
      toast.error('Please enter an organization name')
      return
    }
    return run(
      () => call('helpdesk.api.organization.update_organization', { customer_name: name }),
      'Organization updated'
    )
  }

  function saveOrgEmail() {
    return run(async () => {
      await call('helpdesk.api.organization.update_organization', { email: orgEmail.value.trim() })
      orgEmailEditing.value = false
    }, 'Admin email updated')
  }

  function uploadOrgImage() {
    pickImage((fileUrl) =>
      run(() => call('helpdesk.api.organization.update_organization', { image: fileUrl }), 'Logo updated')
    )
  }

  function removeOrgImage() {
    return run(() => call('helpdesk.api.organization.update_organization', { image: '' }), 'Logo removed')
  }

  function deleteOrganization() {
    const org = settingsOrg.value
    if (!org) return
    if (!window.confirm('Permanently delete ' + org.customer_name + ' and all associated data? This cannot be undone.')) return
    return run(async () => {
      await call('helpdesk.api.organization.delete_organization')
      settingsOpen.value = false
      window.location.href = '/kb'
    })
  }

  return {
    settingsOpen,
    settingsTab,
    settingsBusy,
    settingsUser,
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
    saveProfile,
    uploadProfileImage,
    removeProfileImage,
    sendInvite,
    setMemberRole,
    removeMember,
    saveOrganization,
    saveOrgEmail,
    uploadOrgImage,
    removeOrgImage,
    deleteOrganization,
  }
}
