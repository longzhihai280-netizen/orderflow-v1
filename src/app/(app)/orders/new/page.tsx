import { NewOrderForm } from "@/components/new-order-form";

export default function NewOrderPage() {
  return (
    <div className="narrow-page">
      <div className="page-heading"><div><p className="eyebrow">Create a new workflow</p><h1>Send Order</h1><p className="muted">Preserve the customer&apos;s original text and images exactly as received.</p></div></div>
      <NewOrderForm />
    </div>
  );
}
