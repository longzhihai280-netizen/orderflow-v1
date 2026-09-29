import { z } from "zod";
import type { FileSection } from "@/types/domain";

export const createOrderSchema = z
  .object({
    customerName: z.string().trim().min(1).max(160),
    originalText: z.string().trim().max(20000).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
    originalFiles: z.array(z.object({
      originalFilename: z.string().trim().min(1).max(255),
      storagePath: z.string().min(1).max(500),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      size: z.number().int().positive()
    })).max(8).default([])
  })
  .refine((value) => Boolean(value.originalText) || value.originalFiles.length > 0, {
    message: "Add order text or at least one order image."
  });

export const uploadRequestSchema = z.object({
  section: z.enum(["ORIGINAL", "PICKING", "INVOICE", "TICKET"]),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(120),
  size: z.number().int().positive(),
  replacedFileId: z.string().uuid().nullable().optional()
});

export const imageUploadSchema = z.object({
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive()
});

const storedImageSchema = imageUploadSchema.extend({ storagePath: z.string().min(1).max(500) });

export const createAdditionSchema = z
  .object({
    text: z.string().trim().max(20000).nullable().optional(),
    files: z.array(storedImageSchema).max(8).default([])
  })
  .refine((value) => Boolean(value.text) || value.files.length > 0, { message: "Add text or at least one image." });

export const createChatMessageSchema = z
  .object({
    text: z.string().trim().max(10000).nullable().optional(),
    orderId: z.string().uuid().nullable().optional(),
    attachments: z.array(storedImageSchema).max(8).default([])
  })
  .refine((value) => Boolean(value.text) || Boolean(value.orderId) || value.attachments.length > 0, {
    message: "Add a message, image or order."
  });

const allowedBySection: Record<FileSection, Set<string>> = {
  ORIGINAL: new Set(["image/jpeg", "image/png", "image/webp"]),
  PICKING: new Set(["image/jpeg", "image/png", "image/webp"]),
  INVOICE: new Set(["application/pdf"]),
  TICKET: new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"])
};

export function maxUploadBytes(): number {
  const configured = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
  return Number.isFinite(configured) && configured > 0 ? configured : 10 * 1024 * 1024;
}

export function validateUpload(section: FileSection, mimeType: string, size: number): string | null {
  if (!allowedBySection[section].has(mimeType)) {
    return `${section === "INVOICE" ? "Invoice" : section.toLowerCase()} file type is not allowed.`;
  }
  if (size > maxUploadBytes()) {
    return `File exceeds the ${Math.round(maxUploadBytes() / 1024 / 1024)} MB limit.`;
  }
  return null;
}

export function safeExtension(mimeType: string): string {
  return ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf"
  } as Record<string, string>)[mimeType] || "bin";
}
