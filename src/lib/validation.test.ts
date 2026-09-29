import { describe, expect, it } from "vitest";
import { createAdditionSchema, createChatMessageSchema, createOrderSchema, validateUpload } from "./validation";

describe("order and file validation", () => {
  it("requires text or an image", () => {
    expect(createOrderSchema.safeParse({ customerName: "ABC", originalText: "", originalFiles: [] }).success).toBe(false);
    expect(createOrderSchema.safeParse({ customerName: "ABC", originalText: "Vuse x 5", originalFiles: [] }).success).toBe(true);
  });

  it("accepts multiple original order images", () => {
    const images = ["one", "two", "three"].map((name) => ({ originalFilename: `${name}.jpg`, storagePath: `pending/${name}.jpg`, mimeType: "image/jpeg", size: 1000 }));
    expect(createOrderSchema.safeParse({ customerName: "ABC", originalText: "Extra items", originalFiles: images }).success).toBe(true);
  });

  it("enforces section-specific MIME types", () => {
    expect(validateUpload("INVOICE", "application/pdf", 1000)).toBeNull();
    expect(validateUpload("INVOICE", "image/png", 1000)).toMatch(/not allowed/);
    expect(validateUpload("TICKET", "image/webp", 1000)).toBeNull();
  });

  it("supports repeated additions with text and multiple images", () => {
    const files = [1, 2].map((number) => ({ originalFilename: `${number}.png`, storagePath: `orders/id/additions/${number}.png`, mimeType: "image/png", size: 1200 }));
    expect(createAdditionSchema.safeParse({ text: "Add two cartons", files }).success).toBe(true);
    expect(createAdditionSchema.safeParse({ text: null, files }).success).toBe(true);
    expect(createAdditionSchema.safeParse({ text: "", files: [] }).success).toBe(false);
  });

  it("supports chat text, images and structured order shares", () => {
    const image = { originalFilename: "chat.webp", storagePath: "chat/user/chat.webp", mimeType: "image/webp", size: 900 };
    expect(createChatMessageSchema.safeParse({ text: "Ready", attachments: [] }).success).toBe(true);
    expect(createChatMessageSchema.safeParse({ attachments: [image] }).success).toBe(true);
    expect(createChatMessageSchema.safeParse({ orderId: "147b5e10-fd4f-48fe-b9c9-b17e97432a71", attachments: [] }).success).toBe(true);
  });
});
