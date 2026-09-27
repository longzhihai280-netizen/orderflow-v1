"use client";

import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/domain";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  { href: "/orders", label: "Orders" },
  { href: "/orders/new", label: "Send Order" },
  { href: "/orders?focus=search", label: "Search" },
  { href: "/account", label: "Account" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api<{ profile: Profile }>("/api/profile")
      .then(({ profile: current }) => setProfile(current))
      .catch(async () => {
        await createClient().auth.signOut();
        router.replace("/login?error=disabled");
      });
  }, [router]);

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-frame">
      <header className="topbar">
        <Link href="/orders" className="brand"><span className="brand-mark small">OF</span><span>OrderFlow</span></Link>
        <button className="menu-button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>☰ <span>Menu</span></button>
        <nav className={menuOpen ? "nav open" : "nav"}>
          {nav.map((item) => <Link key={item.label} className={path === item.href.split("?")[0] ? "active" : ""} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}
          {profile?.role === "ADMIN" && <Link href="/admin/users" className={path.startsWith("/admin") ? "active" : ""} onClick={() => setMenuOpen(false)}>Users</Link>}
        </nav>
        <div className="account-chip"><span>{profile?.display_name || "Loading…"}</span><button onClick={logout}>Sign out</button></div>
      </header>
      <main className="page-shell">{children}</main>
    </div>
  );
}
