"use client";

import { api } from "@/lib/api";
import { uploadOriginalDraft } from "@/lib/uploads";
import type { Priority } from "@/types/domain";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewOrderForm() {
  const router = useRouter();
  const [customerName, setCustomerName] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("NORMAL");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!originalText.trim() && files.length === 0) return setError("Add order text or at least one order image.");
    setLoading(true);
    try {
      const originalFiles = [];
      for (const file of files) originalFiles.push(await uploadOriginalDraft(file));
      const { order } = await api<{ order: { id: string } }>("/api/orders", {
        method: "POST",
        body: JSON.stringify({ customerName, originalText: originalText || null, notes: notes || null, priority, originalFiles })
      });
      router.push(`/orders/${order.id}`);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the order.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="panel form-panel stack-lg" onSubmit={submit}>
      {error && <div className="alert error">{error}</div>}
      <div className="form-grid two">
        <label className="field"><span>Customer / Store Name <b>*</b></span><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={160} required placeholder="ABC Store" /></label>
        <label className="field"><span>Priority</span><select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option>NORMAL</option><option>HIGH</option><option>URGENT</option></select></label>
      </div>
      <label className="field"><span>Original Order Text</span><textarea rows={8} value={originalText} onChange={(e) => setOriginalText(e.target.value)} maxLength={20000} placeholder={"Iget Bar Plus 4.0 x 10\nVuse Berry x 5"} /></label>
      <label className="field"><span>Original Order Images</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} /><small>JPG, PNG or WEBP. Up to 10 MB each.</small></label>
      {files.length > 0 && <ul className="file-list compact">{files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name} <span>{(file.size / 1024 / 1024).toFixed(1)} MB</span></li>)}</ul>}
      <label className="field"><span>Order Notes</span><textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} placeholder="Internal note, kept separately from the original order" /></label>
      <div className="form-actions"><button className="button primary" disabled={loading}>{loading ? "Creating order…" : "Send Order"}</button><button className="button secondary" type="button" onClick={() => router.back()} disabled={loading}>Cancel</button></div>
    </form>
  );
}
