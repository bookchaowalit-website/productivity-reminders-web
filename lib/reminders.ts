// Reminders ("tideboard") data and pure logic, shared by the page and the MCP route.
// Reminders are stored in localStorage only; nothing sends a notification.

export type Reminder = { id: string; text: string; when: string; done: boolean };

export const STORAGE_KEY = "reminders-v1";

/**
 * Sample reminders for a first visit, dated from the viewer's clock so none of them starts out
 * Overdue: one later today (the hour after next), one tomorrow at 09:00, and one handled
 * yesterday. The order (yesterday < later today < tomorrow 09:00) is the same whatever `now` is.
 */
export function starterReminders(now: Date): Reminder[] {
  const at = (days: number, hours: number, minutes = 0) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hours, minutes, 0, 0);
    return toLocalInput(date);
  };
  const later = new Date(now);
  later.setMinutes(0, 0, 0);
  later.setHours(later.getHours() + 2);
  return [
    { id: "1", text: "Ship portfolio batch", when: toLocalInput(later), done: false },
    { id: "2", text: "Review the next route", when: at(1, 9), done: false },
    { id: "3", text: "Archive loose notes", when: at(-1, 10), done: true },
  ];
}

function toReminder(value: unknown): Reminder | null {
  if (typeof value !== "object" || value === null) return null;
  const { id, text, when, done } = value as Record<string, unknown>;
  if (typeof id !== "string" || typeof text !== "string" || typeof when !== "string" || typeof done !== "boolean") return null;
  return { id, text, when, done };
}

/** Keep only well-formed reminders from untrusted data. */
export function sanitizeReminders(data: unknown[]): Reminder[] {
  return data.map(toReminder).filter((r): r is Reminder => r !== null);
}

/** Parse what the page stored. Missing or corrupt data falls back to the starter list. */
export function parseReminders(raw: string | null, now: Date = new Date()): Reminder[] {
  if (raw === null) return starterReminders(now);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return starterReminders(now);
  }
  return Array.isArray(data) ? sanitizeReminders(data) : starterReminders(now);
}

export function serializeReminders(items: Reminder[]): string {
  return JSON.stringify(items);
}

/** Earliest first. `when` is a datetime-local string (YYYY-MM-DDTHH:MM), so text order is time order. */
export function sortByWhen(items: Reminder[]): Reminder[] {
  return [...items].sort((a, b) => a.when.localeCompare(b.when));
}

export function nextOpen(items: Reminder[]): Reminder | undefined {
  return sortByWhen(items).find((r) => !r.done);
}

export function openCount(items: Reminder[]): number {
  return items.filter((r) => !r.done).length;
}

export function readableWhen(value: string): string {
  const [date, time] = value.split("T");
  return date.replaceAll("-", ".") + " / " + (time || "00:00");
}

export function addReminder(items: Reminder[], text: string, when: string, makeId: () => string): Reminder[] {
  const message = text.trim();
  if (!message || !when) return items;
  return [{ id: makeId(), text: message, when, done: false }, ...items];
}

export function toggleDone(items: Reminder[], id: string): Reminder[] {
  return items.map((r) => (r.id === id ? { ...r, done: !r.done } : r));
}

export function deleteReminder(items: Reminder[], id: string): Reminder[] {
  return items.filter((r) => r.id !== id);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "Mon 24 Aug 2026 · 09:00" from a datetime-local string. Built by hand (not Intl) so the server
 * and the browser print exactly the same text; the weekday comes from the calendar date alone.
 */
export function formatWhen(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return value;
  const [, y, m, d, hh = "00", mm = "00"] = match;
  const weekday = WEEKDAYS[new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).getUTCDay()];
  return `${weekday} ${Number(d)} ${MONTHS[Number(m) - 1]} ${y} · ${hh}:${mm}`;
}

/** The viewer's local time as a datetime-local string (YYYY-MM-DDTHH:MM). */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Default for a new reminder: the next full hour after `now`. */
export function nextFullHour(now: Date): string {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return toLocalInput(next);
}

/** Open and due before `now` (both datetime-local strings, so text order is time order). */
export function isOverdue(item: Reminder, now: string): boolean {
  return !item.done && item.when < now;
}

/** The earliest open reminder that is not overdue yet (due at or after `now`). */
export function nextUpcoming(items: Reminder[], now: string): Reminder | undefined {
  return sortByWhen(items).find((r) => !r.done && r.when >= now);
}

/**
 * The line under the title. Overdue ones come first ("1 overdue"), then the next upcoming reminder.
 * Without the viewer's clock (`now` null, before hydration) only the open count is known.
 */
export function headline(items: Reminder[], now: string | null): string {
  const open = openCount(items);
  if (open === 0) return "Nothing open. You are all caught up.";
  if (now === null) return `${open} open`;
  const overdue = items.filter((r) => isOverdue(r, now)).length;
  const next = nextUpcoming(items, now);
  const nextText = next ? `Next: ${next.text} · ${formatWhen(next.when)}` : "Nothing else coming up";
  return overdue > 0 ? `${overdue} overdue · ${nextText}` : nextText;
}

export type ReminderList = "open" | "overdue" | "done" | "all";

/** The rows a list shows, earliest first. Overdue needs the viewer's clock, so `now` may be null. */
export function listView(items: Reminder[], list: ReminderList, now: string | null): Reminder[] {
  const sorted = sortByWhen(items);
  if (list === "open") return sorted.filter((r) => !r.done);
  if (list === "done") return sorted.filter((r) => r.done);
  if (list === "overdue") return now ? sorted.filter((r) => isOverdue(r, now)) : [];
  return sorted;
}

/** Undo for a removal: put it back unless it is already there (rows are shown sorted by time). */
export function restoreReminder(items: Reminder[], item: Reminder): Reminder[] {
  return items.some((r) => r.id === item.id) ? items : [...items, item];
}
