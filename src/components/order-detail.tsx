"use client";

/* eslint-disable @next/next/no-img-element -- Private signed Storage URLs are short-lived and cannot use a fixed Next Image host. */

import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/time";
import { uploadAdditionDraft, uploadOrderFile } from "@/lib/uploads";
import { AUXILIARY_STATUSES, humanize, missingSections, PRIORITIES } from "@/lib/workflow";
import type { FileSection, OrderDetailResponse, OrderFile, Profile } from "@/types/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OrderProgress } from "./order-progress";
import { StatusBadge } from "./status-badge";
import { ImagePicker } from "./image-picker";

export function OrderDetail({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [data, setData] = useState<OrderDetailResponse | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const detail = await api<OrderDetailResponse>(`/api/orders/${orderId}`);
      setData(detail);
      setProfile(detail.profile);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load the order.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial order data load.
    void load();
  }, [load]);
  useRealtimeRefresh(() => void load(), orderId);

  async function mutate(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError("");
    try { await action(); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Action failed."); } finally { setBusy(""); }
  }

  if (loading) return <div className="loading-card">Loading order…</div>;
  if (!data) return <div className="narrow-page"><div className="alert error">{error || "Order not found."}</div><Link href="/orders" className="button secondary">Back to Orders</Link></div>;
  const { order, files, additions, activity } = data;
  const filesFor = (section: FileSection) => files.filter((file) => file.section_type === section && !file.addition_id);
  const additionFiles = (additionId: string) => files.filter((file) => file.addition_id === additionId);

  return (
    <div className="order-detail-page">
      <div className="breadcrumb"><Link href="/orders">← Orders</Link><span>/</span><span>#{order.daily_order_number}</span></div>
      {error && <div className="alert error">{error}</div>}
      <section className="order-hero panel">
        <div className="order-title"><div><p className="eyebrow">Order #{order.daily_order_number}</p><h1>{order.customer_name}</h1><p className="muted">Created {formatDateTime(order.created_at)} by {order.created_by_display_name}</p></div><div className="hero-badges"><StatusBadge value={order.priority} kind="priority" /><StatusBadge value={order.workflow_status} />{order.auxiliary_status !== "NONE" && <StatusBadge value={order.auxiliary_status} kind="aux" />}</div></div>
        <div className="hero-grid">
          <div><span className="label">Accepted by</span><strong>{order.accepted_by_display_name || "Not accepted"}</strong>{order.accepted_at && <small>{formatDateTime(order.accepted_at)}</small>}</div>
          <label className="field compact-field"><span>Priority</span><select value={order.priority} disabled={busy !== "" || !(profile?.role === "ADMIN" || profile?.can_change_priority)} onChange={(e) => mutate("priority", () => api(`/api/orders/${orderId}/priority`, { method: "PATCH", body: JSON.stringify({ priority: e.target.value }) }))}>{PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="field compact-field"><span>Auxiliary Status</span><select value={order.auxiliary_status} disabled={busy !== "" || !(profile?.role === "ADMIN" || profile?.can_change_aux_status)} onChange={(e) => mutate("aux", () => api(`/api/orders/${orderId}/auxiliary-status`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }))}>{AUXILIARY_STATUSES.map((value) => <option key={value}>{value}</option>)}</select></label>
        </div>
        <div className="hero-actions">
          {order.workflow_status === "UNASSIGNED" && <button className="button primary" disabled={busy !== ""} onClick={() => mutate("accept", () => api(`/api/orders/${orderId}/accept`, { method: "POST" }))}>{busy === "accept" ? "Accepting…" : "Accept Order"}</button>}
          <button className="button secondary" disabled={busy !== ""} onClick={() => void mutate("share", async () => { await api(`/api/orders/${orderId}/share-to-chat`, { method: "POST" }); router.push("/chat"); })}>{busy === "share" ? "Sharing…" : "Share to Chat"}</button>
        </div>
      </section>

      <div className="detail-columns">
        <div className="detail-main stack-lg">
          <section className="panel content-panel">
            <div className="section-title-row"><div><p className="eyebrow">Read-only record</p><h2>Original Order</h2></div><span>Preserved after submission</span></div>
            {order.original_text ? <pre className="original-text">{order.original_text}</pre> : <p className="muted">No original text was supplied.</p>}
            {filesFor("ORIGINAL").length > 0 && <div className="original-images">{filesFor("ORIGINAL").map((file) => <FileViewer key={file.id} orderId={orderId} file={file} defaultOpen />)}</div>}
            {order.notes && <div className="notes-block"><h3>Order Notes</h3><p>{order.notes}</p></div>}
          </section>

          <section className="panel content-panel additions-panel">
            <div className="section-title-row"><div><p className="eyebrow">Preserved supplements</p><h2>Order Additions</h2></div><span>{additions.length}</span></div>
            {additions.length === 0 ? <p className="muted">No items have been added to this order.</p> : <ol className="addition-list">{additions.map((addition) => <li key={addition.id}>
              <div className="addition-meta"><strong>Added by {addition.creator_display_name}</strong><time>{formatDateTime(addition.created_at)}</time></div>
              {addition.addition_text && <pre className="original-text">{addition.addition_text}</pre>}
              {additionFiles(addition.id).length > 0 && <div className="original-images">{additionFiles(addition.id).map((file) => <FileViewer key={file.id} orderId={orderId} file={file} defaultOpen />)}</div>}
            </li>)}</ol>}
            <AddToOrderForm orderId={orderId} busy={busy} onMutate={mutate} />
          </section>

          <section className="panel content-panel">
            <div className="section-title-row"><div><p className="eyebrow">Required processing</p><h2>Progress</h2></div><StatusBadge value={order.workflow_status} /></div>
            <OrderProgress picking={order.picking_ready} invoice={order.invoice_ready} ticket={order.ticket_ready} />
            {missingSections(order).length > 0 && order.accepted_by && <p className="waiting-for"><b>Waiting for:</b> {missingSections(order).join(", ")}</p>}
            {order.accepted_by ? <div className="processing-list">
              <ProcessingSection key={`picking-${order.updated_at}`} title="Picking" section="PICKING" orderId={orderId} files={filesFor("PICKING")} text={order.picking_text} onMutate={mutate} busy={busy} />
              <ProcessingSection key={`invoice-${order.updated_at}`} title="Invoice" section="INVOICE" orderId={orderId} files={filesFor("INVOICE")} onMutate={mutate} busy={busy} />
              <ProcessingSection key={`ticket-${order.updated_at}`} title="Ticket" section="TICKET" orderId={orderId} files={filesFor("TICKET")} onMutate={mutate} busy={busy} />
            </div> : <div className="empty-state inline"><b>Accept this order to begin processing.</b><span>Picking, Invoice and Ticket will appear here.</span></div>}
          </section>
        </div>

        <aside className="detail-side stack-lg">
          <section className="panel content-panel activity-panel"><div className="section-title-row"><h2>Activity Log</h2><span>{activity.length}</span></div>{activity.length === 0 ? <p className="muted">No activity recorded.</p> : <ol className="timeline">{activity.map((item) => <li key={item.id}><span className="timeline-dot" /><div><strong>{humanize(item.action_type)}</strong><p>{item.actor_display_name ? `by ${item.actor_display_name}` : "System action"}</p><time>{formatDateTime(item.created_at)}</time></div></li>)}</ol>}</section>
          {profile?.role === "ADMIN" && <section className="panel danger-zone"><h2>Admin</h2><p>Delete this order from lists and statistics while retaining its audit history.</p><button className="button danger" disabled={busy !== ""} onClick={() => { const reason = window.prompt("Reason for deleting this order (optional):"); if (reason !== null && window.confirm("Delete this order? This will archive it and preserve the audit record.")) void mutate("delete", async () => { await api(`/api/orders/${orderId}`, { method: "DELETE", body: JSON.stringify({ reason }) }); router.replace("/orders"); }); }}>Delete Order</button></section>}
        </aside>
      </div>
    </div>
  );
}

function ProcessingSection({ title, section, orderId, files, text, onMutate, busy }: { title: string; section: Exclude<FileSection, "ORIGINAL">; orderId: string; files: OrderFile[]; text?: string | null; onMutate: (label: string, action: () => Promise<unknown>) => Promise<void>; busy: string }) {
  const [open, setOpen] = useState(false);
  const [pickingText, setPickingText] = useState(text || "");
  const accept = section === "INVOICE" ? "application/pdf" : section === "TICKET" ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp";
  const ready = section === "PICKING" ? Boolean(files.length || text?.trim()) : files.length > 0;

  async function selected(selectedFiles: FileList | null) {
    if (!selectedFiles?.length) return;
    await onMutate(`${section}-upload`, async () => {
      for (const selectedFile of Array.from(selectedFiles)) await uploadOrderFile(orderId, section, selectedFile);
    });
  }

  async function replace(file: OrderFile, selectedFile: File | undefined) {
    if (!selectedFile) return;
    await onMutate(`${section}-replace`, () => uploadOrderFile(orderId, section, selectedFile, file.id));
  }

  return <article className={`processing-card ${ready ? "ready" : ""}`}>
    <div className="processing-heading"><div><span className="check-icon">{ready ? "✓" : "○"}</span><div><h3>{title}</h3><p>{ready ? "Submitted" : "Required"}</p></div></div><button className="button text" onClick={() => setOpen((value) => !value)}>{open ? "Hide" : "View"}</button></div>
    {open && <div className="processing-body">
      {section === "PICKING" && <div className="picking-text"><label className="field"><span>Picking Note</span><textarea rows={3} value={pickingText} onChange={(e) => setPickingText(e.target.value)} placeholder="Picking completed. 12 boxes prepared." /></label><button className="button secondary small" disabled={busy !== ""} onClick={() => void onMutate("picking-text", () => api(`/api/orders/${orderId}/picking-text`, { method: "PUT", body: JSON.stringify({ text: pickingText }) }))}>Save Picking Note</button></div>}
      {files.length > 0 && <div className="processing-files">{files.map((file) => <div className="active-file" key={file.id}><FileViewer orderId={orderId} file={file} defaultOpen={false} /><div className="file-actions"><label className="button secondary small">Replace<input className="visually-hidden" type="file" accept={accept} disabled={busy !== ""} onChange={(e) => { void replace(file, e.target.files?.[0]); e.target.value = ""; }} /></label><button className="button danger small" disabled={busy !== ""} onClick={() => { if (window.confirm(`Delete ${file.original_filename}? The order may reopen automatically if this is the last file in the section.`)) void onMutate(`${section}-delete`, () => api(`/api/orders/${orderId}/files/${file.id}`, { method: "DELETE" })); }}>Delete</button></div></div>)}</div>}
      <label className={files.length ? "button secondary small add-files-button" : "upload-drop"}><input className="visually-hidden" type="file" accept={accept} multiple disabled={busy !== ""} onChange={(e) => { void selected(e.target.files); e.target.value = ""; }} />{files.length ? <>＋ Add more files</> : <><span>＋</span><b>Upload {title}</b><small>{section === "INVOICE" ? "Select one or more PDFs" : section === "TICKET" ? "Select photos or PDFs" : "Select one or more photos"}</small></>}</label>
    </div>}
  </article>;
}

function AddToOrderForm({ orderId, busy, onMutate }: { orderId: string; busy: string; onMutate: (label: string, action: () => Promise<unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() && files.length === 0) return;
    await onMutate("addition", async () => {
      const uploaded = [];
      for (const file of files) uploaded.push(await uploadAdditionDraft(orderId, file));
      await api(`/api/orders/${orderId}/additions`, { method: "POST", body: JSON.stringify({ text: text || null, files: uploaded }) });
      setText("");
      setFiles([]);
      setOpen(false);
    });
  }

  if (!open) return <button className="button secondary add-to-order-button" disabled={busy !== ""} onClick={() => setOpen(true)}>＋ Add to Order</button>;
  return <form className="add-to-order-form" onSubmit={submit}>
    <label className="field"><span>Addition text</span><textarea rows={4} maxLength={20000} value={text} onChange={(event) => setText(event.target.value)} placeholder="Add quantities, products or instructions without changing the original order." /></label>
    <div className="field"><span>Addition images</span><ImagePicker files={files} onChange={setFiles} disabled={busy !== ""} label={files.length ? "Add more images" : "Choose images"} /></div>
    <div className="form-actions"><button className="button primary" disabled={busy !== "" || (!text.trim() && files.length === 0)}>{busy === "addition" ? "Adding…" : "Add to Order"}</button><button className="button text" type="button" disabled={busy !== ""} onClick={() => setOpen(false)}>Cancel</button></div>
  </form>;
}

function FileViewer({ orderId, file, defaultOpen = false }: { orderId: string; file: OrderFile; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const isImage = file.mime_type.startsWith("image/");
  useEffect(() => {
    if (!open || url) return;
    api<{ url: string }>(`/api/orders/${orderId}/files/${file.id}/signed-url`).then((data) => setUrl(data.url)).catch((reason) => setError(reason.message));
  }, [open, url, orderId, file.id]);
  return <div className="file-viewer"><div className="file-line"><div><b>{file.original_filename}</b><small>{(file.file_size / 1024 / 1024).toFixed(1)} MB · Uploaded {formatDateTime(file.uploaded_at)}</small></div><button className="button text" onClick={() => setOpen((value) => !value)}>{open ? "Hide" : "View"}</button></div>{open && <div className="file-preview">{error ? <div className="alert error">{error}</div> : !url ? <span>Loading preview…</span> : isImage ? <img src={url} alt={file.original_filename} loading="lazy" decoding="async" /> : <><iframe src={url} title={file.original_filename} loading="lazy" /><a className="button secondary small" href={url} target="_blank" rel="noreferrer">Open PDF</a></>}</div>}</div>;
}
