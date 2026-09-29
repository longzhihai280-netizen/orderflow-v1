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

  it("stays complete while each section still has at least one active file and reopens when one becomes empty", () => {
    const readyFromCount = (count: number) => count > 0;
    expect(deriveWorkflowStatus({ accepted: true, pickingReady: readyFromCount(2), invoiceReady: readyFromCount(3), ticketReady: readyFromCount(1) })).toBe("COMPLETED");
    expect(deriveWorkflowStatus({ accepted: true, pickingReady: readyFromCount(1), invoiceReady: readyFromCount(0), ticketReady: readyFromCount(2) })).toBe("IN_PROGRESS");
  });

  it("identifies outstanding work", () => {
    expect(missingSections({ picking_ready: true, invoice_ready: false, ticket_ready: false })).toEqual(["Invoice", "Ticket"]);
  });
});
