"use client";

import { api } from "@/lib/api";
import type { Profile } from "@/types/domain";
import { useEffect, useState } from "react";
import { StatusBadge } from "./status-badge";

export function AccountPanel() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<{ profile: Profile }>("/api/profile").then((data) => setProfile(data.profile)).catch((reason) => setError(reason.message)); }, []);
  if (error) return <div className="alert error">{error}</div>;
  if (!profile) return <div className="loading-card">Loading account…</div>;
  return <section className="panel content-panel"><div className="profile-header"><div className="avatar">{profile.display_name.slice(0, 2).toUpperCase()}</div><div><h2>{profile.display_name}</h2><p className="muted">@{profile.username}</p></div><StatusBadge value={profile.role} kind="aux" /></div><dl className="detail-list account-details"><div><dt>Email</dt><dd>{profile.email || "Not set"}</dd></div><div><dt>Role</dt><dd>{profile.role}</dd></div><div><dt>Account status</dt><dd>{profile.active ? "Active" : "Disabled"}</dd></div><div><dt>Change priority</dt><dd>{profile.role === "ADMIN" || profile.can_change_priority ? "Allowed" : "Not allowed"}</dd></div><div><dt>Change auxiliary status</dt><dd>{profile.role === "ADMIN" || profile.can_change_aux_status ? "Allowed" : "Not allowed"}</dd></div></dl><p className="muted account-note">Contact an administrator to change your account details or reset your password.</p></section>;
}
