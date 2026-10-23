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
