"use client";

/* eslint-disable @next/next/no-img-element -- Chat images use expiring private Storage URLs. */

import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime } from "@/lib/time";
import { uploadChatDraft } from "@/lib/uploads";
import type { ChatAttachment, ChatMessage, Profile } from "@/types/domain";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePicker } from "./image-picker";
import { StatusBadge } from "./status-badge";

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const result = await api<{ messages: ChatMessage[]; profile: Profile }>("/api/chat");
      setMessages(result.messages);
      setProfile(result.profile);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load chat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial chat data load.
    void load();
  }, [load]);
  useEffect(() => {
    const supabase = createClient();
    let timer: number | undefined;
    const refresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), 250);
    };
    const channel = supabase.channel(`chat-live-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_attachments" }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, refresh)
      .subscribe();
    return () => { if (timer) window.clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [load]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    setError("");
    try {
      const attachments = [];
      for (const file of files) attachments.push(await uploadChatDraft(file));
      await api("/api/chat", { method: "POST", body: JSON.stringify({ text: text || null, attachments }) });
      setText("");
      setFiles([]);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send the message.");
    } finally {
      setSending(false);
    }
  }

  return <section className="panel chat-panel">
    {error && <div className="alert error">{error}</div>}
    <div className="chat-messages" aria-live="polite">
      {loading ? <div className="empty-state"><span>Loading chat…</span></div> : messages.length === 0 ? <div className="empty-state"><b>No messages yet.</b><span>Start the shared team conversation below.</span></div> : messages.map((message) => <article key={message.id} className={message.sender_id === profile?.id ? "chat-message own" : "chat-message"}>
        <div className="chat-message-meta"><strong>{message.sender_display_name}</strong><time>{formatDateTime(message.created_at)}</time></div>
        {message.message_text && <p>{message.message_text}</p>}
        {message.attachments.length > 0 && <div className="chat-images">{message.attachments.map((attachment) => <ChatImage key={attachment.id} attachment={attachment} />)}</div>}
        {message.order_id && <SharedOrderCard message={message} />}
      </article>)}
      <div ref={bottomRef} />
    </div>
    <form className="chat-composer" onSubmit={send}>
      <label className="field"><span>Message</span><textarea rows={3} maxLength={10000} value={text} onChange={(event) => setText(event.target.value)} placeholder="Write a message…" /></label>
      <ImagePicker files={files} onChange={setFiles} disabled={sending} label={files.length ? "Add more images" : "Add images"} />
      <button className="button primary" disabled={sending || (!text.trim() && files.length === 0)}>{sending ? "Sending…" : "Send"}</button>
    </form>
  </section>;
}

function SharedOrderCard({ message }: { message: ChatMessage }) {
  if (!message.order_customer_name) return <div className="shared-order unavailable">This shared order is no longer available.</div>;
  return <Link href={`/orders/${message.order_id}`} className="shared-order">
    <div><span>Shared order</span><strong>Order #{message.daily_order_number} · {message.order_customer_name}</strong></div>
    <div className="shared-order-badges">{message.order_priority && <StatusBadge value={message.order_priority} kind="priority" />}{message.order_workflow_status && <StatusBadge value={message.order_workflow_status} />}</div>
    <small>Accepted by: {message.order_accepted_by_display_name || "Not accepted"}</small>
  </Link>;
}

function ChatImage({ attachment }: { attachment: ChatAttachment }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ url: string }>(`/api/chat/attachments/${attachment.id}/signed-url`).then((result) => setUrl(result.url)).catch((reason) => setError(reason.message));
  }, [attachment.id]);
  if (error) return <div className="chat-image-error">Image unavailable</div>;
  if (!url) return <div className="chat-image-loading">Loading image…</div>;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={attachment.original_filename} loading="lazy" decoding="async" /></a>;
}
