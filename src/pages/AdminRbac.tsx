import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, KeyRound, Loader2, Lock, Plus, RefreshCw, ShieldCheck, UserRound } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { ACTION_LABELS, PERMISSION_GROUPS, type Permission } from "@/admin/rbac";
import { invalidateAdminMe } from "@/state/session";
import { cn } from "@/utils/cn";

/* =====================================================================
   Staff & roles.

   Everything on this screen is backed by a real endpoint. Nothing is
   optimistic: after each write the list is re-read from the server, and a
   refused write shows the server's own message (a role without
   `staff:manage` cannot even open this screen).
   ===================================================================== */

interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  protected: boolean;
}

interface StaffRow {
  id: string;
  name: string;
  subject: string;
  role_id: string;
  role_name: string;
  active: boolean;
  has_passcode: boolean;
}

const fa = (n: number) => n.toLocaleString("fa-IR");

function Head({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <header className="ad-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action && <div className="ad-head-actions">{action}</div>}
    </header>
  );
}

function PermissionMatrix({
  value,
  onChange,
  disabled,
}: {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  disabled?: boolean;
}) {
  const toggle = (permission: Permission) => {
    const has = value.includes(permission);
    onChange(has ? value.filter((p) => p !== permission) : [...value, permission]);
  };
  return (
    <div className="ad-rbac-matrix">
      {PERMISSION_GROUPS.map((group) => (
        <fieldset key={group.module} className="ad-rbac-group" disabled={disabled}>
          <legend>{group.label}</legend>
          {group.actions.map((action) => {
            const actionKey = action.split(":")[1];
            return (
              <label key={action} className={cn("ad-rbac-perm", value.includes(action) && "is-on")}>
                <input
                  type="checkbox"
                  checked={value.includes(action)}
                  onChange={() => toggle(action)}
                  disabled={disabled}
                />
                <span>{ACTION_LABELS[actionKey] ?? actionKey}</span>
                <code dir="ltl" className="latin-track">{action}</code>
              </label>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

export function StaffPanel() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // role editor
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPerms, setDraftPerms] = useState<Permission[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // new role
  const [newOpen, setNewOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPerms, setNewPerms] = useState<Permission[]>(["dashboard:view"]);

  // new staff
  const [staffName, setStaffName] = useState("");
  const [staffSubject, setStaffSubject] = useState("");
  const [staffPass, setStaffPass] = useState("");
  const [staffRole, setStaffRole] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [staffRes, roleRes] = await Promise.all([
        api.get<{ staff: StaffRow[]; roles: Role[] }>("/api/admin/staff"),
        api.get<{ roles: Role[] }>("/api/admin/roles"),
      ]);
      setStaff(staffRes.staff);
      setRoles(roleRes.roles);
      setStaffRole((current) => current || roleRes.roles.find((r) => !r.protected)?.id || roleRes.roles[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 403 ? "نقش شما اجازهٔ مدیریت کارکنان را ندارد." : err instanceof Error ? err.message : "خطا در خواندن فهرست.");
      setStaff(null);
      setRoles(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (role: Role) => {
    setEditing(role.id);
    setDraftName(role.name);
    setDraftPerms(role.permissions);
    setFormError(null);
    setNote(null);
  };

  const saveRole = async () => {
    if (!editing) return;
    setBusy(`role:${editing}`);
    setFormError(null);
    try {
      const res = await api.put<{ roles: Role[] }>(`/api/admin/roles/${editing}`, {
        name: draftName,
        permissions: draftPerms,
      });
      setRoles(res.roles);
      setEditing(null);
      setNote("نقش ذخیره شد؛ اعمال آن روی نشست‌های باز از درخواست بعدی همان کاربر.");
      invalidateAdminMe();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "ذخیره نشد.");
    } finally {
      setBusy(null);
    }
  };

  const createRole = async () => {
    setBusy("role:new");
    setFormError(null);
    try {
      const res = await api.post<{ roles: Role[] }>("/api/admin/roles", {
        id: newId.trim(),
        name: newName.trim(),
        description: newDesc.trim(),
        permissions: newPerms,
      });
      setRoles(res.roles);
      setNewOpen(false);
      setNewId("");
      setNewName("");
      setNewDesc("");
      setNewPerms(["dashboard:view"]);
      setNote("نقش ساخته شد.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "ساخته نشد.");
    } finally {
      setBusy(null);
    }
  };

  const removeRole = async (role: Role) => {
    if (!window.confirm(`نقش «${role.name}» حذف شود؟`)) return;
    setBusy(`del:${role.id}`);
    setFormError(null);
    try {
      const res = await api.del<{ roles: Role[] }>(`/api/admin/roles/${role.id}`);
      setRoles(res.roles);
      setNote("نقش حذف شد.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "حذف نشد.");
    } finally {
      setBusy(null);
    }
  };

  const createStaff = async () => {
    setBusy("staff:new");
    setFormError(null);
    try {
      const res = await api.post<{ staff: StaffRow[] }>("/api/admin/staff", {
        name: staffName.trim(),
        subject: staffSubject.trim().toLowerCase(),
        passcode: staffPass,
        roleId: staffRole,
      });
      setStaff(res.staff);
      setStaffName("");
      setStaffSubject("");
      setStaffPass("");
      setNote("کارمند اضافه شد؛ می‌تواند با همین رمز وارد پنل شود.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "اضافه نشد.");
    } finally {
      setBusy(null);
    }
  };

  const patchStaff = async (row: StaffRow, patch: { roleId?: string; active?: boolean }) => {
    setBusy(`staff:${row.id}`);
    setFormError(null);
    try {
      const res = await api.patch<{ staff: StaffRow[] }>(`/api/admin/staff/${row.id}`, patch);
      setStaff(res.staff);
      setNote("تغییر ذخیره شد.");
      invalidateAdminMe();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "ذخیره نشد.");
    } finally {
      setBusy(null);
    }
  };

  const roleCount = useMemo(
    () => Object.fromEntries((staff ?? []).map((s) => [s.role_id, true])) as Record<string, boolean>,
    [staff],
  );

  if (error) {
    return (
      <div className="ad-panel-adm">
        <Head title="کارکنان و نقش‌ها" />
        <div className="ad-empty ad-empty-error" role="alert">
          <AlertTriangle width={18} height={18} />
          <p>{error}</p>
          <button type="button" className="ad-btn" onClick={() => void load()}>
            <RefreshCw width={14} height={14} /> تلاش دوباره
          </button>
        </div>
      </div>
    );
  }

  if (!roles || !staff) {
    return (
      <div className="ad-panel-adm">
        <Head title="کارکنان و نقش‌ها" />
        <div className="ad-empty" aria-busy="true">
          <Loader2 width={18} height={18} className="ad-spin" />
          <p>در حال خواندن نقش‌ها…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ad-panel-adm">
      <Head
        title="کارکنان و نقش‌ها"
        sub="هر نقش فقط صفحه‌هایی را می‌بیند که مجوز آن را دارد؛ سرور هر نوشتن را دوباره بررسی می‌کند."
        action={
          <button type="button" className="ad-btn" onClick={() => void load()}>
            <RefreshCw width={14} height={14} /> بازخوانی
          </button>
        }
      />

      {note && <p className="ad-note">{note}</p>}
      {formError && (
        <p className="ad-form-err" role="alert">
          {formError}
        </p>
      )}

      <section className="ad-card">
        <header className="ad-card-head">
          <h3>
            <ShieldCheck width={15} height={15} /> نقش‌ها ({fa(roles.length)})
          </h3>
          <button type="button" className="ad-btn is-primary is-sm" onClick={() => { setNewOpen((v) => !v); setFormError(null); }}>
            <Plus width={14} height={14} /> نقش تازه
          </button>
        </header>

        {newOpen && (
          <div className="ad-card-body ad-rbac-new">
            <div className="ad-form-grid">
              <label className="ad-field">
                <span className="ad-field-label">شناسهٔ لاتین</span>
                <input className="ad-input latin-track" dir="ltr" value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="warehouse" />
              </label>
              <label className="ad-field">
                <span className="ad-field-label">نام نمایشی</span>
                <input className="ad-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="انباردار" />
              </label>
              <label className="ad-field">
                <span className="ad-field-label">توضیح (اختیاری)</span>
                <input className="ad-input" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="مسئول شمارش و جابه‌جایی موجودی" />
              </label>
            </div>
            <PermissionMatrix value={newPerms} onChange={setNewPerms} />
            <div className="ad-actions">
              <button type="button" className="ad-btn is-primary" disabled={busy === "role:new"} onClick={() => void createRole()}>
                {busy === "role:new" ? <Loader2 width={14} height={14} className="ad-spin" /> : <Check width={14} height={14} />} ساخت نقش
              </button>
              <button type="button" className="ad-btn" onClick={() => setNewOpen(false)}>انصراف</button>
            </div>
          </div>
        )}

        <div className="ad-rbac-roles">
          {roles.map((role) => (
            <article key={role.id} className={cn("ad-rbac-role", editing === role.id && "is-editing")}>
              <header>
                <div>
                  <h4>
                    {role.protected && <Lock width={12} height={12} aria-label="محافظت‌شده" />} {role.name}
                  </h4>
                  <code className="latin-track" dir="ltr">{role.id}</code>
                </div>
                <span className="ad-chip is-on">{fa(role.permissions.length)} مجوز</span>
              </header>
              {role.description && <p className="ad-rbac-desc">{role.description}</p>}

              {editing === role.id ? (
                <>
                  <label className="ad-field">
                    <span className="ad-field-label">نام نمایشی</span>
                    <input className="ad-input" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                  </label>
                  <PermissionMatrix value={draftPerms} onChange={setDraftPerms} />
                  <div className="ad-actions">
                    <button type="button" className="ad-btn is-primary is-sm" disabled={busy === `role:${role.id}`} onClick={() => void saveRole()}>
                      {busy === `role:${role.id}` ? <Loader2 width={13} height={13} className="ad-spin" /> : <Check width={13} height={13} />} ذخیره
                    </button>
                    <button type="button" className="ad-btn is-sm" onClick={() => setEditing(null)}>انصراف</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="ad-rbac-tags">
                    {role.permissions.slice(0, 6).map((p) => (
                      <span key={p} className="ad-rbac-tag latin-track" dir="ltr">{p}</span>
                    ))}
                    {role.permissions.length > 6 && <span className="ad-rbac-tag">+{fa(role.permissions.length - 6)}</span>}
                  </div>
                  <div className="ad-actions">
                    <button
                      type="button"
                      className="ad-btn is-sm"
                      disabled={role.protected}
                      title={role.protected ? "نقش مالک قابل تغییر نیست" : undefined}
                      onClick={() => startEdit(role)}
                    >
                      ویرایش مجوزها
                    </button>
                    <button
                      type="button"
                      className="ad-btn is-sm is-danger"
                      disabled={role.protected || roleCount[role.id] || busy === `del:${role.id}`}
                      title={roleCount[role.id] ? "این نقش به کارمند اختصاص دارد" : undefined}
                      onClick={() => void removeRole(role)}
                    >
                      حذف
                    </button>
                  </div>
                </>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="ad-card">
        <header className="ad-card-head">
          <h3>
            <UserRound width={15} height={15} /> کارکنان ({fa(staff.length)})
          </h3>
        </header>

        {staff.length === 0 ? (
          <div className="ad-empty">
            <p>هنوز کارمندی ثبت نشده؛ فقط مالک با رمز فروشگاه وارد می‌شود.</p>
          </div>
        ) : (
          <div className="ad-rbac-staff">
            <div className="ad-rbac-row ad-rbac-row-head" aria-hidden>
              <span>نام</span>
              <span>شناسهٔ ورود</span>
              <span>نقش</span>
              <span>وضعیت</span>
            </div>
            {staff.map((row) => (
              <div key={row.id} className={cn("ad-rbac-row", !row.active && "is-off")}>
                <span className="ad-rbac-name">{row.name}</span>
                <code className="latin-track" dir="ltr">{row.subject}</code>
                <select
                  className="ad-input is-compact"
                  value={row.role_id}
                  disabled={busy === `staff:${row.id}`}
                  onChange={(e) => void patchStaff(row, { roleId: e.target.value })}
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>{role.name}</option>
                  ))}
                </select>
                <label className="ad-rbac-toggle">
                  <input
                    type="checkbox"
                    checked={row.active}
                    disabled={busy === `staff:${row.id}`}
                    onChange={(e) => void patchStaff(row, { active: e.target.checked })}
                  />
                  <span>{row.active ? "فعال" : "غیرفعال"}</span>
                </label>
              </div>
            ))}
          </div>
        )}

        <div className="ad-card-body ad-rbac-add">
          <h4>
            <KeyRound width={14} height={14} /> کارمند تازه
          </h4>
          <div className="ad-form-grid">
            <label className="ad-field">
              <span className="ad-field-label">نام</span>
              <input className="ad-input" value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="سینا مرادی" />
            </label>
            <label className="ad-field">
              <span className="ad-field-label">شناسهٔ ورود</span>
              <input className="ad-input latin-track" dir="ltr" value={staffSubject} onChange={(e) => setStaffSubject(e.target.value)} placeholder="sina" />
            </label>
            <label className="ad-field">
              <span className="ad-field-label">رمز ورود (حداقل ۶ نویسه)</span>
              <input className="ad-input latin-track" dir="ltr" type="password" value={staffPass} onChange={(e) => setStaffPass(e.target.value)} autoComplete="new-password" />
            </label>
            <label className="ad-field">
              <span className="ad-field-label">نقش</span>
              <select className="ad-input" value={staffRole} onChange={(e) => setStaffRole(e.target.value)}>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="ad-actions">
            <button
              type="button"
              className="ad-btn is-primary"
              disabled={busy === "staff:new" || !staffName.trim() || !staffSubject.trim() || staffPass.length < 6 || !staffRole}
              onClick={() => void createStaff()}
            >
              {busy === "staff:new" ? <Loader2 width={14} height={14} className="ad-spin" /> : <Plus width={14} height={14} />} افزودن کارمند
            </button>
          </div>
          <p className="ad-rbac-hint">
            رمز هر کارمند مستقل است؛ با همان رمز در همین صفحهٔ ورود وارد می‌شود و فقط مجوزهای نقش خودش را می‌بیند. رمز فروشگاه همیشه مالک است.
          </p>
        </div>
      </section>
    </div>
  );
}
