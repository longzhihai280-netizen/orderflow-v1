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
    let refreshTimer: number | undefined;
    const scheduleRefresh = () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => callback.current(), 350);
    };
    let channel = supabase
      .channel(`orders-live-${orderId || "all"}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", ...(orderId && { filter: `id=eq.${orderId}` }) }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_files", ...(filter && { filter }) }, scheduleRefresh);
    if (orderId) {
      channel = channel
        .on("postgres_changes", { event: "*", schema: "public", table: "order_activity_logs", filter }, scheduleRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "order_additions", filter }, scheduleRefresh);
    }
    channel.subscribe();
    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [orderId]);
}
