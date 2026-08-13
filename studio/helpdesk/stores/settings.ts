import { ref, computed, reactive, watch } from 'vue'
import { call, toast, FileUploadHandler, useTheme } from 'frappe-ui'
import { usePreferences } from '@app/stores/preferences'
import { useSession } from '@app/stores/session'

// Shared state + actions for the portal settings dialog, used by every page script
// via `useSettingsModal(context)`. The dialog itself is the `kb_settings` studio
// component, which binds to whatever the host page's script returns — so every page
// carrying it returns this store. Backed by helpdesk.api.organization.

const MANAGER_ROLE = 'HD Customer Manager'
const MEMBER_ROLE = 'HD Customer'
const HASH_ROOT = 'settings'

// One instance for the whole app: per-call state would give each page a private copy,
// so a load on one would leave the others showing stale settings.
const store = createSettingsStore()

// Every page script imports this module, so calling it here applies the saved theme on
// load rather than only once the settings dialog renders the picker.
const { currentTheme, setTheme } = useTheme()

// Writable so the theme Select can bind to it two-way; frappe-ui persists the choice.
const theme = computed({
  get: () => currentTheme.value,
  set: setTheme,
})

// Every page script goes through here, so the session store rides along rather than
// being wired into each one: the topbar it feeds is on every page too.
export function useSettingsModal(context) {
  if (context) store.bindRouter(context.router)
  return { ...store, ...usePreferences(), ...useSession(context), theme }
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
  const inviteEmails = ref([])
  const inviteRole = ref('Member') // 'Member' | 'Manager'
  const passwordOpen = ref(false)
  const currentPassword = ref('')
  const newPassword = ref('')

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
      // By docname, not email: they differ for Administrator, and keying by email
      // loaded a different User doc — so language and timezone never took effect.
      usePreferences().loadPreferences(settingsUser.value.name)
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
    inviteOpen.value = false
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

  // The dialog lives in the URL hash (#settings/<tab>[/<organization>[/invite]]) so it
  // layers over the page underneath and survives a refresh; the topbar menu opens it by
  // pushing that hash. Every screen the dialog can show gets its own segment, which is
  // what makes the device back button step back through them one at a time instead of
  // dismissing the whole dialog. Bound once per app, through `afterEach` rather than a
  // watcher on the route, because a page script's `route` is a snapshot taken when the
  // script ran.
  let routerBound = false

  function bindRouter(router) {
    if (routerBound || !router) return
    routerBound = true
    applyHash(currentRoute(router).hash)
    router.afterEach((to) => applyHash(to.hash))
    watch([settingsOpen, settingsTab, selectedOrg, inviteOpen], () => pushHash(router))
  }

  // The router reaches a page script through a reactive proxy, which unwraps refs — so
  // `currentRoute` is the route itself there, and the ref only outside that proxy.
  function currentRoute(router) {
    return router.currentRoute?.value || router.currentRoute || {}
  }

  function applyHash(hash) {
    const [root, tab, ...rest] = readHash(hash).replace(/^#/, '').split('/')
    if (root !== HASH_ROOT) return closeSettings()
    if (settingsOpen.value) settingsTab.value = tab || 'profile'
    else openSettings(tab)
    const invite = rest[rest.length - 1] === 'invite'
    if (invite) rest.pop()
    // An organization is named by whatever is left, slashes and all.
    applyOrganizationHash(rest.join('/'), invite)
  }

  function applyOrganizationHash(org, invite) {
    if (!org) return closeOrganization()
    if (org !== selectedOrg.value) openOrganization(org)
    inviteOpen.value = invite
  }

  function settingsHash() {
    if (!settingsOpen.value) return ''
    const parts = [HASH_ROOT, settingsTab.value]
    if (selectedOrg.value) parts.push(selectedOrg.value)
    if (selectedOrg.value && inviteOpen.value) parts.push('invite')
    return `#${parts.join('/')}`
  }

  // Organization names carry spaces, which the router escapes on the way into the URL
  // and hands back escaped after a popstate — so every hash is read decoded, and the
  // ones we build stay unescaped and let the router do that job once.
  function readHash(hash) {
    try {
      return decodeURIComponent(String(hash || ''))
    } catch (error) {
      return String(hash || '')
    }
  }

  function pushHash(router) {
    const hash = settingsHash()
    const current = currentRoute(router)
    if (readHash(current.hash) === hash) return
    // Leaving a screen the way we came in unwinds history rather than growing it —
    // pushing the parent again would leave the device back button pointing forward,
    // into the very screen just closed.
    const previous = previousHash(router)
    if (previous !== null && readHash(previous) === hash) return router.back()
    router.push({ query: current.query, hash })
  }

  // vue-router keeps the entry behind this one in history state, as a full path —
  // query and all — so only the part before the query names the page.
  function previousHash(router) {
    const previous = router.options?.history?.state?.back
    if (typeof previous !== 'string') return null
    const index = previous.indexOf('#')
    const [location, hash] = index === -1 ? [previous, ''] : [previous.slice(0, index), previous.slice(index)]
    return location.split('?')[0] === currentRoute(router).path ? hash : null
  }

  /** `landed` is for actions that email as part of the same request: the notice is
   *  sent synchronously, so a mail failure fails the whole request even though the
   *  change is already saved. It re-checks the reloaded data and returns the wording
   *  for that case, or nothing if the action really did fail. */
  async function run(action, successMessage, landed) {
    if (settingsBusy.value) return
    settingsBusy.value = true
    try {
      await action()
      if (successMessage) toast.success(successMessage)
      await loadSettings()
    } catch (error) {
      console.error(error)
      await loadSettings()
      const partial = landed?.()
      if (partial) toast.warning(partial)
      else toast.error(serverMessage(error) || 'Something went wrong')
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

  // The portal stores first and last name separately; the dialog edits one field, so it
  // splits on the first space and everything after it is the last name.
  function renameProfile(value) {
    const [first, ...rest] = value.split(/\s+/)
    profileFirstName.value = first
    profileLastName.value = rest.join(' ')
    return saveProfile()
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

  // --- Password ---

  function openPasswordChange() {
    currentPassword.value = ''
    newPassword.value = ''
    passwordOpen.value = true
  }

  function changePassword() {
    if (!currentPassword.value || !newPassword.value) {
      toast.error('Please fill in both passwords')
      return
    }
    return run(async () => {
      await call('frappe.core.doctype.user.user.update_password', {
        old_password: currentPassword.value,
        new_password: newPassword.value,
      })
      passwordOpen.value = false
    }, 'Password updated')
  }

  // --- Manage organization ---

  // Inviting is its own screen inside the organization panel, the same way the
  // organization list drills into a detail — not a dialog on top of it.
  function openInvite() {
    inviteEmails.value = []
    inviteRole.value = 'Member'
    inviteOpen.value = true
  }

  function closeInvite() {
    inviteOpen.value = false
  }

  function sendInvite() {
    const emails = inviteEmails.value.map((email) => email.trim()).filter(Boolean)
    if (!emails.length) {
      toast.error('Please enter an email address')
      return
    }
    return run(async () => {
      const result = await call('frappe.core.api.user_invitation.invite_by_email', {
        emails: emails.join(','),
        roles: [inviteRole.value === 'Manager' ? MANAGER_ROLE : MEMBER_ROLE],
        redirect_to_path: '/helpdesk',
        app_name: 'helpdesk',
        customer: selectedOrg.value,
      })
      if (result.invited_emails?.length) {
        toast.success(result.invited_emails.length > 1 ? 'Invitations sent' : 'Invitation sent')
        inviteEmails.value = []
        inviteOpen.value = false
      } else if (result.pending_invite_emails?.length) {
        toast.error('An invitation for this email is already pending')
      } else if (result.accepted_invite_emails?.length) {
        toast.error('This person has already joined')
      } else if (result.disabled_user_emails?.length) {
        toast.error('This user account is disabled')
      }
    }, null, () => {
      if (!emails.every(isPendingMember)) return null
      inviteEmails.value = []
      inviteOpen.value = false
      return emails.length > 1
        ? 'Invitations created, but the emails could not be sent'
        : 'Invitation created, but the email could not be sent'
    })
  }

  function isPendingMember(email) {
    return orgMembers.value.some((member) => member.email === email && member.pending)
  }

  // People are shown as a tree, one level per role: the owner at the root, managers
  // beneath them, everyone else beneath each manager. Helpdesk records no reporting
  // line, but any manager can act on any member, so a manager carries the whole list
  // rather than an invented share of it.
  const memberTree = computed(() => {
    const owner = orgMembers.value.find((member) => member.is_owner)
    if (!owner) return orgMembers.value.map((member) => toTreeNode(member))
    const managers = orgMembers.value.filter(isManagingMember)
    const members = orgMembers.value.filter(
      (member) => !member.is_owner && !isManagingMember(member)
    )
    const root = toTreeNode(owner)
    root.children = managers.length
      ? managers.map((manager) => toManagerNode(manager, members))
      : members.map((member) => toTreeNode(member))
    return [root]
  })

  // A pending invite manages nobody yet, so it stays at the members level.
  function isManagingMember(member) {
    return Boolean(member.is_manager) && !member.is_owner && !member.pending
  }

  function toManagerNode(manager, members) {
    const node = toTreeNode(manager)
    node.children = members.map((member) => toTreeNode(member, node.key))
    return node
  }

  // reactive: Tree collapses a node by writing `expanded` onto it, and a plain copy
  // would take the write without re-rendering. Repeated members get their own copy,
  // keyed by the manager they hang under, because the tree keys its rows globally.
  function toTreeNode(member, parentKey) {
    const key = member.email || member.contact || member.invitation
    return reactive({
      ...member,
      key: parentKey ? `${parentKey}/${key}` : key,
      label: member.full_name,
    })
  }

  function roleLabel(member) {
    if (member.is_owner) return 'Owner'
    return member.is_manager ? 'Manager' : 'Member'
  }

  // Role and removal share one menu, and it only offers what changes something: the role
  // the member does not hold, and — for a pending invite, which holds none yet — the
  // cancellation on its own.
  function memberOptions(member) {
    if (member.pending) {
      return [
        { label: 'Cancel invitation', icon: 'x-circle', onClick: () => cancelInvitation(member) },
      ]
    }
    const role = member.is_manager
      ? { label: 'Make member', icon: 'user', onClick: () => setMemberRole(member, 'Member') }
      : { label: 'Make manager', icon: 'shield', onClick: () => setMemberRole(member, 'Manager') }
    return [
      role,
      { label: 'Remove from organization', icon: 'user-minus', onClick: () => removeMember(member) },
    ]
  }

  function setMemberRole(member, role) {
    if (member.is_owner || member.pending) return
    const isManager = role === 'Manager'
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
          'Invitation cancelled',
          () =>
            orgMembers.value.every((row) => row.invitation !== member.invitation) &&
            'Invitation cancelled, but the notice could not be emailed'
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

  function renameOrganization(value) {
    orgName.value = value
    return saveOrganization()
  }

  // A Run Script handler calls functions rather than assigning to a binding, so the
  // fields the dialog toggles get one of these.
  function editOrgEmail() {
    orgEmailEditing.value = true
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

  return {
    settingsOpen,
    settingsTab,
    settingsBusy,
    settingsUser,
    organizations,
    // Pages that show organizations outside the dialog have to ask for them.
    loadSettings,
    selectedOrg,
    settingsOrg,
    isOrgManager,
    isAgentUser,
    orgMembers,
    memberTree,
    profileFirstName,
    profileLastName,
    orgName,
    orgEmail,
    orgEmailEditing,
    inviteOpen,
    inviteEmails,
    inviteRole,
    passwordOpen,
    currentPassword,
    newPassword,
    openPasswordChange,
    changePassword,
    bindRouter,
    openSettings,
    closeSettings,
    openOrganization,
    closeOrganization,
    confirmAction,
    cancelConfirm,
    acceptConfirm,
    saveProfile,
    renameProfile,
    uploadProfileImage,
    removeProfileImage,
    openInvite,
    closeInvite,
    sendInvite,
    setMemberRole,
    removeMember,
    cancelInvitation,
    roleLabel,
    memberOptions,
    saveOrganization,
    renameOrganization,
    editOrgEmail,
    saveOrgEmail,
    uploadOrgImage,
    removeOrgImage,
  }
}
