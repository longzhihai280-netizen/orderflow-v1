import type { AuxiliaryStatus, Priority, WorkflowStatus } from "@/types/domain";

export const PRIORITIES: Priority[] = ["NORMAL", "HIGH", "URGENT"];
export const AUXILIARY_STATUSES: AuxiliaryStatus[] = [
  "NONE",
  "PENDING_CONFIRMATION",
  "OUT_OF_STOCK"
];

export function deriveWorkflowStatus(input: {
  accepted: boolean;
  pickingReady: boolean;
  invoiceReady: boolean;
  ticketReady: boolean;
}): WorkflowStatus {
  if (!input.accepted) return "UNASSIGNED";
  return input.pickingReady && input.invoiceReady && input.ticketReady
    ? "COMPLETED"
    : "IN_PROGRESS";
}

export function missingSections(order: {
  picking_ready: boolean;
  invoice_ready: boolean;
  ticket_ready: boolean;
}): string[] {
  return [
    !order.picking_ready && "Picking",
    !order.invoice_ready && "Invoice",
    !order.ticket_ready && "Ticket"
  ].filter(Boolean) as string[];
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
