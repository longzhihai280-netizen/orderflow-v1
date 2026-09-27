import { LoginForm } from "@/components/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">OF</div>
        <p className="eyebrow">Wholesale operations</p>
        <h1>Welcome to OrderFlow</h1>
        <p className="muted">Sign in with your employee account to manage today&apos;s orders.</p>
        <LoginForm nextPath={typeof params.next === "string" ? params.next : "/orders"} initialError={params.error === "disabled" ? "This account is disabled." : undefined} />
      </section>
    </main>
  );
}
