import {
  P as e,
  d as t,
  f as n,
  h as r,
  n as i,
  t as a,
  u as o,
} from "./studioRenderer-Dce1CqVj.js";
function s() {
  let e = Number(t(`maxFileSize`));
  return Number.isFinite(e) && e > 0 ? e : null;
}
function c(e) {
  if (e >= 1024 * 1024) {
    let t = e / 1024 / 1024;
    return `${Number.isInteger(t) ? t : t.toFixed(1)} MB`;
  }
  return e >= 1024 ? `${Math.round(e / 1024)} KB` : `${e} B`;
}
function l(e) {
  if (!e) return null;
  let t = s();
  return !t || e.size <= t
    ? null
    : `This file is ${c(e.size)}; the limit is ${c(t)}.`;
}
function u(e) {
  if (!(e != null && e._server_messages)) return [];
  try {
    return JSON.parse(e._server_messages)
      .map((e) => {
        try {
          return JSON.parse(e).message;
        } catch (t) {
          return e;
        }
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}
function d(e) {
  let t = u(e);
  if (t.length)
    return t.join(`
`);
  if (e != null && e.message) return e.message;
  if (e != null && e._error_message) return e._error_message;
  if ((e == null ? void 0 : e.exc_type) === `MaxFileSizeReachedError`) {
    let e = s();
    return e
      ? `File size exceeded the maximum allowed size of ${c(e)}.`
      : `File size exceeds the maximum allowed limit.`;
  }
  return `Error Uploading File`;
}
var f = class {
    constructor() {
      o(this, `listeners`, void 0),
        o(this, `failed`, void 0),
        (this.listeners = {}),
        (this.failed = !1);
    }
    on(e, t) {
      (this.listeners[e] = this.listeners[e] || []), this.listeners[e].push(t);
    }
    trigger(e, t) {
      (this.listeners[e] || []).forEach((e) => {
        e.call(this, t);
      });
    }
    upload(e, t) {
      return new Promise((n, r) => {
        let i = l(e);
        if (i) {
          r(Error(i));
          return;
        }
        let a = new XMLHttpRequest();
        a.upload.addEventListener(`loadstart`, () => {
          this.trigger(`start`);
        }),
          a.upload.addEventListener(`progress`, (e) => {
            e.lengthComputable &&
              this.trigger(`progress`, { uploaded: e.loaded, total: e.total });
          }),
          a.addEventListener(`error`, () => {
            this.trigger(`error`), r();
          }),
          (a.onreadystatechange = () => {
            if (a.readyState == XMLHttpRequest.DONE)
              if (a.status === 200) {
                let e = null;
                try {
                  e = JSON.parse(a.responseText);
                } catch (t) {
                  e = a.responseText;
                }
                let t = e.message || e;
                this.trigger(`finish`), n(t);
              } else {
                this.failed = !0;
                let e = {};
                if (a.status === 413 || a.status === 0)
                  e = {
                    message:
                      s() == null
                        ? `File size exceeds the maximum allowed limit`
                        : `File size exceeded the maximum allowed size of ${c(
                            s()
                          )}.`,
                    httpStatus: 413,
                  };
                else
                  try {
                    e = JSON.parse(a.responseText);
                  } catch (e) {}
                e && e.exc && console.error(JSON.parse(e.exc)[0]),
                  this.trigger(`error`, e),
                  r(Error(d(e)));
              }
          });
        let o = t.upload_endpoint || `/api/method/upload_file`;
        a.open(`POST`, o, !0),
          a.setRequestHeader(`Accept`, `application/json`),
          window.csrf_token &&
            window.csrf_token !== `{{ csrf_token }}` &&
            a.setRequestHeader(`X-Frappe-CSRF-Token`, window.csrf_token);
        let u = new FormData();
        e && u.append(`file`, e, e.name),
          u.append(`is_private`, t.private ? `1` : `0`),
          u.append(`folder`, t.folder || `Home`),
          t.file_url && u.append(`file_url`, t.file_url),
          t.doctype && u.append(`doctype`, t.doctype),
          t.docname && u.append(`docname`, t.docname),
          t.fieldname && u.append(`fieldname`, t.fieldname),
          t.method && u.append(`method`, t.method),
          t.type && u.append(`type`, t.type),
          t.optimize &&
            (u.append(`optimize`, `1`),
            t.max_width && u.append(`max_width`, t.max_width.toString()),
            t.max_height && u.append(`max_height`, t.max_height.toString())),
          a.send(u);
      });
    }
  },
  p = `HD Customer Manager`,
  m = `HD Customer`;
function h() {
  let t = e(!1),
    o = e(`profile`),
    s = e(null),
    c = e(!1),
    l = r(() => {
      var e;
      return ((e = s.value) == null ? void 0 : e.user) || {};
    }),
    u = r(() => {
      var e;
      return ((e = s.value) == null ? void 0 : e.organization) || null;
    }),
    d = r(() => {
      var e;
      return !!((e = s.value) != null && e.is_manager && u.value);
    }),
    h = r(() => {
      var e;
      return !!((e = s.value) != null && e.is_agent);
    }),
    g = r(() => {
      var e;
      return ((e = s.value) == null ? void 0 : e.members) || [];
    }),
    _ = e(``),
    v = e(``),
    y = e(``),
    b = e(``),
    x = e(!1),
    S = e(!1),
    C = e(``),
    w = e(`Member`);
  function T() {
    return E.apply(this, arguments);
  }
  function E() {
    return (
      (E = n(function* () {
        try {
          var e, t;
          (s.value = yield a(`helpdesk.api.organization.get_settings`)),
            (_.value = l.value.first_name || ``),
            (v.value = l.value.last_name || ``),
            (y.value =
              ((e = u.value) == null ? void 0 : e.customer_name) || ``),
            (b.value = ((t = u.value) == null ? void 0 : t.email) || ``);
        } catch (e) {
          console.error(e), i.error(`Could not load settings`);
        }
      })),
      E.apply(this, arguments)
    );
  }
  function D(e) {
    (o.value = e || `profile`),
      (t.value = !0),
      (x.value = !1),
      (S.value = !1),
      T();
  }
  function O() {
    t.value = !1;
  }
  function k(e, t) {
    return A.apply(this, arguments);
  }
  function A() {
    return (
      (A = n(function* (e, t) {
        if (!c.value) {
          c.value = !0;
          try {
            yield e(), t && i.success(t), yield T();
          } catch (e) {
            console.error(e), i.error(j(e) || `Something went wrong`);
          } finally {
            c.value = !1;
          }
        }
      })),
      A.apply(this, arguments)
    );
  }
  function j(e) {
    var t;
    return (
      (e == null || (t = e.messages) == null ? void 0 : t[0]) ||
      (e == null ? void 0 : e.message)
    );
  }
  function M() {
    return k(
      () =>
        a(`helpdesk.api.organization.update_profile`, {
          first_name: _.value,
          last_name: v.value,
        }),
      `Profile updated`
    );
  }
  function N(e) {
    let t = document.createElement(`input`);
    (t.type = `file`),
      (t.accept = `image/*`),
      (t.onchange = n(function* () {
        let n = t.files && t.files[0];
        if (n)
          try {
            yield e(
              (yield new f().upload(n, { private: !1, optimize: !0 })).file_url
            );
          } catch (e) {
            console.error(e), i.error(`Could not upload image`);
          }
      })),
      t.click();
  }
  function P() {
    N((e) =>
      k(
        () => a(`helpdesk.api.organization.update_profile`, { image: e }),
        `Photo updated`
      )
    );
  }
  function F() {
    return k(
      () => a(`helpdesk.api.organization.update_profile`, { image: `` }),
      `Photo removed`
    );
  }
  function I() {
    let e = C.value.trim();
    if (!e) {
      i.error(`Please enter an email address`);
      return;
    }
    return k(
      n(function* () {
        var t, n, r, o;
        let s = yield a(`frappe.core.api.user_invitation.invite_by_email`, {
          emails: e,
          roles: [w.value === `Manager` ? p : m],
          redirect_to_path: `/helpdesk`,
          app_name: `helpdesk`,
          customer: u.value.name,
        });
        (t = s.invited_emails) != null && t.length
          ? (i.success(`Invitation sent`), (C.value = ``), (S.value = !1))
          : (n = s.pending_invite_emails) != null && n.length
          ? i.error(`An invitation for this email is already pending`)
          : (r = s.accepted_invite_emails) != null && r.length
          ? i.error(`This person has already joined`)
          : (o = s.disabled_user_emails) != null &&
            o.length &&
            i.error(`This user account is disabled`);
      })
    );
  }
  function L(e, t) {
    if (e.is_owner || e.pending) return;
    let n = t === `Manager`;
    if (n !== !!e.is_manager)
      return k(
        () =>
          a(`helpdesk.api.organization.update_member_role`, {
            contact: e.contact,
            is_manager: n,
          }),
        `Role updated`
      );
  }
  function R(e) {
    if (e.is_owner) return;
    let t = e.pending ? `invitation for ` + e.email : e.full_name;
    if (window.confirm(`Remove ` + t + `?`))
      return e.pending
        ? k(
            () =>
              a(`helpdesk.api.organization.cancel_invitation`, {
                invitation: e.invitation,
              }),
            `Invitation cancelled`
          )
        : k(
            () =>
              a(`helpdesk.api.organization.remove_member`, {
                contact: e.contact,
              }),
            `Member removed`
          );
  }
  function z() {
    let e = y.value.trim();
    if (!e) {
      i.error(`Please enter an organization name`);
      return;
    }
    return k(
      () =>
        a(`helpdesk.api.organization.update_organization`, {
          customer_name: e,
        }),
      `Organization updated`
    );
  }
  function B() {
    return k(
      n(function* () {
        yield a(`helpdesk.api.organization.update_organization`, {
          email: b.value.trim(),
        }),
          (x.value = !1);
      }),
      `Admin email updated`
    );
  }
  function V() {
    N((e) =>
      k(
        () => a(`helpdesk.api.organization.update_organization`, { image: e }),
        `Logo updated`
      )
    );
  }
  function H() {
    return k(
      () => a(`helpdesk.api.organization.update_organization`, { image: `` }),
      `Logo removed`
    );
  }
  function U() {
    let e = u.value;
    if (
      e &&
      window.confirm(
        `Permanently delete ` +
          e.customer_name +
          ` and all associated data? This cannot be undone.`
      )
    )
      return k(
        n(function* () {
          yield a(`helpdesk.api.organization.delete_organization`),
            (t.value = !1),
            (window.location.href = `/kb`);
        })
      );
  }
  return {
    settingsOpen: t,
    settingsTab: o,
    settingsBusy: c,
    settingsUser: l,
    settingsOrg: u,
    isOrgManager: d,
    isAgentUser: h,
    orgMembers: g,
    profileFirstName: _,
    profileLastName: v,
    orgName: y,
    orgEmail: b,
    orgEmailEditing: x,
    inviteOpen: S,
    inviteEmail: C,
    inviteRole: w,
    openSettings: D,
    closeSettings: O,
    saveProfile: M,
    uploadProfileImage: P,
    removeProfileImage: F,
    sendInvite: I,
    setMemberRole: L,
    removeMember: R,
    saveOrganization: z,
    saveOrgEmail: B,
    uploadOrgImage: V,
    removeOrgImage: H,
    deleteOrganization: U,
  };
}
export { h as t };
//# sourceMappingURL=settings-MvlymeDD.js.map
