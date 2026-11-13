// Reminders ("tideboard") data and pure logic, shared by the page and the MCP route.
// Reminders are stored in localStorage only; nothing sends a notification.

export type Reminder = { id: string; text: string; when: string; done: boolean };

export const STORAGE_KEY = "reminders-v1";

export const STARTER: Reminder[] = [
  { id: "1", text: "Ship portfolio batch", when: "2026-08-24T09:00", done: false },
  { id: "2", text: "Review the next route", when: "2026-08-24T14:30", done: false },
  { id: "3", text: "Archive loose notes", when: "2026-08-25T10:00", done: true },
];

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
export function parseReminders(raw: string | null): Reminder[] {
  if (raw === null) return STARTER;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return STARTER;
  }
  return Array.isArray(data) ? sanitizeReminders(data) : STARTER;
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
