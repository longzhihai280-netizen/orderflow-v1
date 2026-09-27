"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ nextPath, initialError }: { nextPath: string; initialError?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(initialError || "");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      const profile = await fetch("/api/profile", { cache: "no-store" });
      if (!profile.ok) {
        await supabase.auth.signOut();
        throw new Error("This account is disabled or is not configured.");
      }
      router.replace(nextPath.startsWith("/") ? nextPath : "/orders");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack-lg">
      {error && <div className="alert error">{error}</div>}
      <label className="field">
        <span>Email</span>
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <button className="button primary wide" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
