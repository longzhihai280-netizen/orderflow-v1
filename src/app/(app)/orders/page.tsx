import { OrdersDashboard } from "@/components/orders-dashboard";
import { Suspense } from "react";

export default function OrdersPage() {
  return <Suspense fallback={<div className="loading-card">Loading orders…</div>}><OrdersDashboard /></Suspense>;
}
