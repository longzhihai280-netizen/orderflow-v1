import Link from "next/link";

export default function NotFound() {
  return <main className="login-page"><section className="login-card"><p className="eyebrow">404</p><h1>Page not found</h1><p className="muted">The page you requested does not exist.</p><Link className="button primary" href="/orders">Back to Orders</Link></section></main>;
}
