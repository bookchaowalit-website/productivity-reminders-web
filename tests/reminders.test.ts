import { describe, expect, it } from "vitest";
import {
  STARTER,
  addReminder,
  deleteReminder,
  nextOpen,
  openCount,
  parseReminders,
  readableWhen,
  serializeReminders,
  sortByWhen,
  toggleDone,
  type Reminder,
} from "@/lib/reminders";

const items: Reminder[] = [
  { id: "b", text: "Later", when: "2026-09-02T10:00", done: false },
  { id: "a", text: "Earlier", when: "2026-09-01T08:30", done: true },
  { id: "c", text: "Middle", when: "2026-09-01T12:00", done: false },
];

describe("parseReminders", () => {
  it("falls back to the starter list when nothing is stored", () => {
    expect(parseReminders(null)).toEqual(STARTER);
  });

  it("round-trips what serializeReminders wrote", () => {
    expect(parseReminders(serializeReminders(items))).toEqual(items);
  });

  // Bug: the page did JSON.parse(saved) as Reminder[] and then [...items].sort(...),
  // so corrupt or foreign data in localStorage crashed the page.
  it.each(["oops", "null", "1", '{"items":[]}'])("survives corrupt storage %s", (raw) => {
    expect(parseReminders(raw)).toEqual(STARTER);
  });

  it("drops malformed entries", () => {
    const raw = JSON.stringify([items[0], { id: "x", text: "no date", done: false }, { ...items[1], done: "yes" }]);
    expect(parseReminders(raw)).toEqual([items[0]]);
  });

  it("keeps an emptied list empty", () => {
    expect(parseReminders("[]")).toEqual([]);
  });
});

describe("reminder logic", () => {
  it("sorts by time without mutating the input", () => {
    expect(sortByWhen(items).map((r) => r.id)).toEqual(["a", "c", "b"]);
    expect(items.map((r) => r.id)).toEqual(["b", "a", "c"]);
  });

  it("finds the earliest open reminder and counts open ones", () => {
    expect(nextOpen(items)?.id).toBe("c");
    expect(nextOpen(items.map((r) => ({ ...r, done: true })))).toBeUndefined();
    expect(openCount(items)).toBe(2);
  });

  it("formats the time as date / time and tolerates a missing time", () => {
    expect(readableWhen("2026-08-24T09:00")).toBe("2026.08.24 / 09:00");
    expect(readableWhen("2026-08-24")).toBe("2026.08.24 / 00:00");
  });

  it("adds a trimmed reminder on top and ignores blank text", () => {
    const next = addReminder(items, "  Call mum ", "2026-09-03T18:00", () => "new");
    expect(next[0]).toEqual({ id: "new", text: "Call mum", when: "2026-09-03T18:00", done: false });
    expect(addReminder(items, "  ", "2026-09-03T18:00", () => "x")).toBe(items);
  });

  // Bug: clearing the date field gave a reminder with when "" that sorted first and showed " / 00:00".
  it("refuses a reminder without a date", () => {
    expect(addReminder(items, "No date", "", () => "x")).toBe(items);
  });

  it("toggles done and deletes by id", () => {
    expect(toggleDone(items, "a")[1].done).toBe(false);
    expect(toggleDone(items, "b")[0].done).toBe(true);
    expect(deleteReminder(items, "c").map((r) => r.id)).toEqual(["b", "a"]);
  });
});
