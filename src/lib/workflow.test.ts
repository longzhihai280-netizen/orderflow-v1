import { describe, expect, it } from "vitest";
import { deriveWorkflowStatus, missingSections } from "./workflow";

describe("workflow status", () => {
  it("keeps new orders unassigned", () => {
    expect(deriveWorkflowStatus({ accepted: false, pickingReady: true, invoiceReady: true, ticketReady: true })).toBe("UNASSIGNED");
  });

  it("completes only when all required sections are ready", () => {
    expect(deriveWorkflowStatus({ accepted: true, pickingReady: true, invoiceReady: true, ticketReady: true })).toBe("COMPLETED");
    expect(deriveWorkflowStatus({ accepted: true, pickingReady: true, invoiceReady: true, ticketReady: false })).toBe("IN_PROGRESS");
  });

  it("identifies outstanding work", () => {
    expect(missingSections({ picking_ready: true, invoice_ready: false, ticket_ready: false })).toEqual(["Invoice", "Ticket"]);
  });
});
