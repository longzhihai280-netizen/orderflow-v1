import { humanize } from "@/lib/workflow";

export function StatusBadge({ value, kind = "status" }: { value: string; kind?: "status" | "priority" | "aux" }) {
  return <span className={`badge ${kind} ${value.toLowerCase()}`}>{humanize(value)}</span>;
}
