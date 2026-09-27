"use client";

import { api } from "@/lib/api";
import type { Profile, Role } from "@/types/domain";
import { useCallback, useEffect, useState } from "react";

export function UserManagement() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { const data = await api<{ users: Profile[] }>("/api/admin/users"); setUsers(data.users); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load users."); } finally { setLoading(false); } }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial admin data load.
    void load();
  }, [load]);

  async function update(user: Profile, updates: Record<string, unknown>) {
    try { await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify(updates) }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the account."); }
  }

  return <div className="admin-grid">
    <section className="panel content-panel"><div className="section-title-row"><h2>Users</h2><button className="button primary" onClick={() => setShowForm((value) => !value)}>{showForm ? "Close" : "+ Add Employee"}</button></div>{error && <div className="alert error">{error}</div>}{loading ? <div className="empty-state">Loading users…</div> : <div className="user-table-wrap"><table className="user-table"><thead><tr><th>Employee</th><th>Role</th><th>Permissions</th><th>Status</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><b>{user.display_name}</b><span>@{user.username}</span><small>{user.email}</small></td><td><select value={user.role} onChange={(e) => void update(user, { role: e.target.value as Role })}><option>EMPLOYEE</option><option>ADMIN</option></select></td><td><label><input type="checkbox" checked={user.can_change_priority} onChange={(e) => void update(user, { canChangePriority: e.target.checked })} disabled={user.role === "ADMIN"} /> Priority</label><label><input type="checkbox" checked={user.can_change_aux_status} onChange={(e) => void update(user, { canChangeAuxStatus: e.target.checked })} disabled={user.role === "ADMIN"} /> Auxiliary</label></td><td><button className={`status-toggle ${user.active ? "active" : "disabled"}`} onClick={() => void update(user, { active: !user.active })}>{user.active ? "Active" : "Disabled"}</button></td></tr>)}</tbody></table></div>}</section>
    {showForm && <CreateUserForm onCreated={async () => { setShowForm(false); await load(); }} />}
  </div>;
}

function CreateUserForm({ onCreated }: { onCreated: () => Promise<void> }) {
  const [form, setForm] = useState({ email: "", password: "", username: "", displayName: "", role: "EMPLOYEE" as Role });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try { await api("/api/admin/users", { method: "POST", body: JSON.stringify(form) }); await onCreated(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create the account."); } finally { setLoading(false); }
  }
  return <form className="panel content-panel stack-lg create-user" onSubmit={submit}><div><p className="eyebrow">New account</p><h2>Add Employee</h2></div>{error && <div className="alert error">{error}</div>}<label className="field"><span>Display Name</span><input required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label><label className="field"><span>Username</span><input required pattern="[a-z0-9][a-z0-9._-]{1,39}" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} /></label><label className="field"><span>Email</span><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label className="field"><span>Temporary Password</span><input type="password" minLength={12} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><small>At least 12 characters. Share it securely.</small></label><label className="field"><span>Role</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}><option>EMPLOYEE</option><option>ADMIN</option></select></label><button className="button primary" disabled={loading}>{loading ? "Creating…" : "Create Account"}</button></form>;
}
