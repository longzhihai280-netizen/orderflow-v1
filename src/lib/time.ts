export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Pacific/Auckland";

export function businessDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: BUSINESS_TIMEZONE,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00Z`));
}

export function dateRangeForPreset(preset: string, now = new Date()): { from: string; to: string } {
  const today = businessDate(now);
  const dateAtNoon = new Date(`${today}T12:00:00Z`);
  const shift = (days: number) => {
    const copy = new Date(dateAtNoon);
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy.toISOString().slice(0, 10);
  };
  if (preset === "yesterday") return { from: shift(-1), to: shift(-1) };
  if (preset === "last7") return { from: shift(-6), to: today };
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: today, to: today };
}
