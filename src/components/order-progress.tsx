export function OrderProgress({ picking, invoice, ticket, compact = false }: { picking: boolean; invoice: boolean; ticket: boolean; compact?: boolean }) {
  const items = [["Picking", picking], ["Invoice", invoice], ["Ticket", ticket]] as const;
  return <div className={compact ? "progress compact" : "progress"}>{items.map(([label, ready]) => <span key={label} className={ready ? "done" : "waiting"}><b>{ready ? "✓" : "○"}</b> {label}</span>)}</div>;
}
