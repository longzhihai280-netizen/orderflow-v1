"use client";

import { createClient } from "@/lib/supabase/client";
import { useEffect, useRef } from "react";

export function useRealtimeRefresh(onChange: () => void, orderId?: string) {
  const callback = useRef(onChange);

  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const supabase = createClient();
    const filter = orderId ? `order_id=eq.${orderId}` : undefined;
    const channel = supabase
      .channel(`orders-live-${orderId || "all"}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", ...(orderId && { filter: `id=eq.${orderId}` }) }, () => callback.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_files", ...(filter && { filter }) }, () => callback.current())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_activity_logs", ...(filter && { filter }) }, () => callback.current())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [orderId]);
}
