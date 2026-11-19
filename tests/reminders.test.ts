import { describe, expect, it } from "vitest";
import {
  starterReminders,
  toLocalInput,
  formatWhen,
  headline,
  nextUpcoming,
  isOverdue,
  listView,
  nextFullHour,
  restoreReminder,
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
    expect(parseReminders(null, new Date(2026, 10, 18, 14, 25))).toEqual(starterReminders(new Date(2026, 10, 18, 14, 25)));
  });

  // 2026-11-18 review: fixed August dates made every first visit open on two red Overdue pills.
  it("dates the starter list from the clock: nothing overdue, one done yesterday", () => {
    const now = new Date(2026, 10, 18, 14, 25);
    const starter = starterReminders(now);
    expect(starter.map((r) => r.when)).toEqual(["2026-11-18T16:00", "2026-11-19T09:00", "2026-11-17T10:00"]);
    expect(starter.filter((r) => isOverdue(r, toLocalInput(now)))).toEqual([]);
    expect(headline(starter, toLocalInput(now))).toBe("Next: Ship portfolio batch · Wed 18 Nov 2026 · 16:00");
    // Late evening: "later today" rolls into tomorrow but still sorts before 09:00.
    const late = starterReminders(new Date(2026, 10, 18, 23, 10));
    expect(sortByWhen(late).map((r) => r.id)).toEqual(["3", "1", "2"]);
  });

  it("round-trips what serializeReminders wrote", () => {
    expect(parseReminders(serializeReminders(items))).toEqual(items);
  });

  // Bug: the page did JSON.parse(saved) as Reminder[] and then [...items].sort(...),
  // so corrupt or foreign data in localStorage crashed the page.
  it.each(["oops", "null", "1", '{"items":[]}'])("survives corrupt storage %s", (raw) => {
    expect(parseReminders(raw, new Date(2026, 10, 18, 14, 25))).toEqual(starterReminders(new Date(2026, 10, 18, 14, 25)));
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

  // Bug (BOO-400): the header said "Next: Ship portfolio batch" although that reminder was overdue.
  it("next upcoming skips overdue and done reminders", () => {
    expect(nextUpcoming(items, "2026-09-01T13:00")?.id).toBe("b");
    expect(nextUpcoming(items, "2026-09-01T12:00")?.id).toBe("c");
    expect(nextUpcoming(items, "2026-09-03T00:00")).toBeUndefined();
  });

  it("headline puts the overdue count before the next upcoming reminder", () => {
    expect(headline(items, "2026-08-31T00:00")).toBe("Next: Middle · Tue 1 Sep 2026 · 12:00");
    expect(headline(items, "2026-09-01T13:00")).toBe("1 overdue · Next: Later · Wed 2 Sep 2026 · 10:00");
    expect(headline(items, "2026-09-03T00:00")).toBe("2 overdue · Nothing else coming up");
    expect(headline(items, null)).toBe("2 open");
    expect(headline(items.map((r) => ({ ...r, done: true })), "2026-09-01T13:00")).toBe("Nothing open. You are all caught up.");
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

describe("App shell helpers", () => {
  const items = [
    { id: "a", text: "past open", when: "2026-08-24T09:00", done: false },
    { id: "b", text: "future open", when: "2027-01-02T08:30", done: false },
    { id: "c", text: "past done", when: "2026-08-25T10:00", done: true },
  ];

  it("formats a datetime-local value the same everywhere", () => {
    expect(formatWhen("2026-08-24T09:00")).toBe("Mon 24 Aug 2026 · 09:00");
    expect(formatWhen("2027-01-02")).toBe("Sat 2 Jan 2027 · 00:00");
    expect(formatWhen("not a date")).toBe("not a date");
  });

  it("defaults new reminders to the next full hour in local time", () => {
    expect(nextFullHour(new Date(2026, 10, 13, 16, 42))).toBe("2026-11-13T17:00");
    expect(nextFullHour(new Date(2026, 11, 31, 23, 5))).toBe("2027-01-01T00:00");
  });

  it("splits reminders into open, overdue, done and all lists", () => {
    const now = "2026-11-13T12:00";
    expect(listView(items, "open", now).map((r) => r.id)).toEqual(["a", "b"]);
    expect(listView(items, "overdue", now).map((r) => r.id)).toEqual(["a"]);
    expect(listView(items, "overdue", null)).toEqual([]);
    expect(listView(items, "done", now).map((r) => r.id)).toEqual(["c"]);
    expect(listView(items, "all", now).map((r) => r.id)).toEqual(["a", "c", "b"]);
    expect(isOverdue(items[2], now)).toBe(false);
  });

  it("restores a removed reminder once", () => {
    expect(restoreReminder(items.slice(1), items[0]).map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(restoreReminder(items, items[0])).toBe(items);
  });
});
