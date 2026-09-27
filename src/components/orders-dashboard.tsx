"use client";

import { api } from "@/lib/api";
import { businessDate, dateRangeForPreset, formatDateLabel, formatDateTime } from "@/lib/time";
import { missingSections } from "@/lib/workflow";
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh";
import type { OrderStatistics, OrderSummary } from "@/types/domain";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OrderProgress } from "./order-progress";
import { StatusBadge } from "./status-badge";

const emptyStats: OrderStatistics = { total: 0, completed: 0, unassigned: 0, in_progress: 0, pending_confirmation: 0, out_of_stock: 0 };

export function OrdersDashboard() {
  const searchParams = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const [preset, setPreset] = useState("today");
  const initialRange = dateRangeForPreset("today");
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [statistics, setStatistics] = useState<OrderStatistics>(emptyStats);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([businessDate()]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (searchParams.get("focus") === "search") searchRef.current?.focus();
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    try {
      setError("");
      const params = new URLSearchParams({ from, to });
      if (debouncedQuery) params.set("q", debouncedQuery);
      const [orderData, statData] = await Promise.all([
        api<{ orders: OrderSummary[] }>(`/api/orders?${params}`),
        api<{ statistics: OrderStatistics }>(`/api/statistics?${params}`)
      ]);
      setOrders(orderData.orders);
      setStatistics({ ...emptyStats, ...statData.statistics });
      setSelectedId((current) => current && orderData.orders.some((order) => order.id === current) ? current : orderData.orders[0]?.id || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load orders.");
    } finally {
      setLoading(false);
    }
  }, [from, to, debouncedQuery]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Load remote data when filters change.
    void load();
  }, [load]);
  useRealtimeRefresh(() => void load());

  function choosePreset(value: string) {
    setPreset(value);
    if (value !== "custom") {
      const range = dateRangeForPreset(value);
      setFrom(range.from);
      setTo(range.to);
    }
  }

  const grouped = useMemo(() => orders.reduce<Record<string, OrderSummary[]>>((groups, order) => {
    (groups[order.order_date] ||= []).push(order);
    return groups;
  }, {}), [orders]);
  const selected = orders.find((order) => order.id === selectedId) || null;

  return (
    <div className="dashboard-page">
      <div className="page-heading dashboard-heading">
        <div><p className="eyebrow">Live operations</p><h1>Orders</h1><p className="muted">All dates use Pacific/Auckland business time.</p></div>
        <Link href="/orders/new" className="button primary">+ Send Order</Link>
      </div>

      <section className="filter-bar panel">
        <label className="search-field"><span className="sr-only">Search orders</span><input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, customer, employee or order text" /><span>⌕</span></label>
        <div className="preset-buttons" role="group" aria-label="Date filter">
          {[['today','Today'],['yesterday','Yesterday'],['last7','Last 7 Days'],['month','This Month'],['custom','Custom']].map(([value,label]) => <button key={value} className={preset === value ? "selected" : ""} onClick={() => choosePreset(value)}>{label}</button>)}
        </div>
        {preset === "custom" && <div className="custom-dates"><label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>To <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label></div>}
      </section>

      {error && <div className="alert error">{error}</div>}
      <div className="dashboard-grid">
        <section className="order-list panel" aria-busy={loading}>
          <div className="section-title-row"><h2>Order List</h2><span>{statistics.total} orders</span></div>
          {loading && <div className="empty-state">Loading orders…</div>}
          {!loading && orders.length === 0 && <div className="empty-state"><b>No orders found</b><span>Try another date range or search.</span></div>}
          {Object.entries(grouped).map(([date, dateOrders]) => {
            const isOpen = expanded.has(date);
            return <div className="date-group" key={date}>
              <button className="date-heading" onClick={() => setExpanded((current) => { const next = new Set(current); if (isOpen) next.delete(date); else next.add(date); return next; })}><span>{isOpen ? "▾" : "▸"} {formatDateLabel(date)}</span><b>{dateOrders.length} Orders</b></button>
              {isOpen && <div className="date-orders">{dateOrders.map((order) => <button key={order.id} className={`order-row ${selectedId === order.id ? "selected" : ""} priority-${order.priority.toLowerCase()}`} onClick={() => setSelectedId(order.id)}>
                <div className="order-row-main"><span className="order-number">#{order.daily_order_number}</span><span className="customer-name">{order.customer_name}</span><StatusBadge value={order.priority} kind="priority" /></div>
                <div className="order-row-meta"><StatusBadge value={order.workflow_status} />{order.auxiliary_status !== "NONE" && <StatusBadge value={order.auxiliary_status} kind="aux" />}<span>{order.accepted_by_display_name ? `Accepted by ${order.accepted_by_display_name}` : "Waiting for acceptance"}</span><time>{formatDateTime(order.created_at).split(", ").at(-1)}</time></div>
                <OrderProgress picking={order.picking_ready} invoice={order.invoice_ready} ticket={order.ticket_ready} compact />
              </button>)}</div>}
            </div>;
          })}
        </section>

        <aside className="order-preview panel">
          {selected ? <>
            <div className="preview-top"><div><p className="eyebrow">Selected order</p><h2>#{selected.daily_order_number} {selected.customer_name}</h2></div><StatusBadge value={selected.priority} kind="priority" /></div>
            <div className="preview-status"><StatusBadge value={selected.workflow_status} />{selected.auxiliary_status !== "NONE" && <StatusBadge value={selected.auxiliary_status} kind="aux" />}</div>
            <dl className="detail-list"><div><dt>Accepted by</dt><dd>{selected.accepted_by_display_name || "Not accepted"}</dd></div><div><dt>Created</dt><dd>{formatDateTime(selected.created_at)}</dd></div><div><dt>Created by</dt><dd>{selected.created_by_display_name}</dd></div></dl>
            <OrderProgress picking={selected.picking_ready} invoice={selected.invoice_ready} ticket={selected.ticket_ready} />
            {missingSections(selected).length > 0 && selected.accepted_by && <p className="waiting-for"><b>Waiting for:</b> {missingSections(selected).join(", ")}</p>}
            {selected.original_text && <div className="text-preview"><h3>Original Order</h3><p>{selected.original_text}</p></div>}
            <Link className="button primary wide" href={`/orders/${selected.id}`}>Open Order</Link>
          </> : <div className="empty-state"><b>Select an order</b><span>Order details will appear here.</span></div>}
        </aside>
      </div>

      <section className="stats-section"><div className="section-title-row"><div><p className="eyebrow">Current filter</p><h2>Statistics</h2></div><span>Auxiliary counts do not add to Total Orders.</span></div><div className="stats-grid">
        {[['Total Orders',statistics.total,'total'],['Completed',statistics.completed,'completed'],['Unassigned',statistics.unassigned,'unassigned'],['In Progress',statistics.in_progress,'in-progress'],['Pending Confirmation',statistics.pending_confirmation,'pending'],['Out of Stock',statistics.out_of_stock,'stock']].map(([label,value,tone]) => <article className={`stat-card ${tone}`} key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}
      </div></section>
    </div>
  );
}
