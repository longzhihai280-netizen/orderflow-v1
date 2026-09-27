import { describe, expect, it } from "vitest";
import { createOrderSchema, validateUpload } from "./validation";

describe("order and file validation", () => {
  it("requires text or an image", () => {
    expect(createOrderSchema.safeParse({ customerName: "ABC", originalText: "", originalFiles: [] }).success).toBe(false);
    expect(createOrderSchema.safeParse({ customerName: "ABC", originalText: "Vuse x 5", originalFiles: [] }).success).toBe(true);
  });

  it("enforces section-specific MIME types", () => {
    expect(validateUpload("INVOICE", "application/pdf", 1000)).toBeNull();
    expect(validateUpload("INVOICE", "image/png", 1000)).toMatch(/not allowed/);
    expect(validateUpload("TICKET", "image/webp", 1000)).toBeNull();
  });
});
