"use client";

import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { FileSection } from "@/types/domain";

export async function uploadOrderFile(orderId: string, section: FileSection, file: File, replacedFileId?: string) {
  const metadata = {
    section,
    originalFilename: file.name,
    mimeType: file.type,
    size: file.size,
    replacedFileId: replacedFileId || null
  };
  const signed = await api<{ path: string; token: string }>(`/api/orders/${orderId}/files/upload-url`, {
    method: "POST",
    body: JSON.stringify(metadata)
  });
  const supabase = createClient();
  const { error } = await supabase.storage.from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "order-files").uploadToSignedUrl(signed.path, signed.token, file, {
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  return api(`/api/orders/${orderId}/files/complete`, {
    method: "POST",
    body: JSON.stringify({ ...metadata, storagePath: signed.path })
  });
}

export async function uploadOriginalDraft(file: File) {
  const metadata = { originalFilename: file.name, mimeType: file.type, size: file.size };
  const signed = await api<{ path: string; token: string }>("/api/orders/original-upload-url", {
    method: "POST",
    body: JSON.stringify(metadata)
  });
  const supabase = createClient();
  const { error } = await supabase.storage.from(process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET || "order-files").uploadToSignedUrl(signed.path, signed.token, file, {
    contentType: file.type,
    upsert: false
  });
  if (error) throw error;
  return { ...metadata, storagePath: signed.path };
}
