// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

// Freeze the clock before the page module (and its store's starter list) is created.
vi.hoisted(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 13, 12, 20));
});

// Mounted tests for reminders on the App shell. The clock is pinned to 13 Nov 2026 12:20.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const $ = <T extends Element = HTMLElement>(selector: string) => host.querySelector(selector) as T | null;
const button = (text: string, scope: ParentNode = host) => [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const rows = () => [...host.querySelectorAll(".as-row h2")].map((h) => h.textContent);
const press = (el: Element, detail = 0) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail })); });
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const stored = () => JSON.parse(localStorage.getItem("reminders-v1") ?? "null") as { text: string; when: string; done: boolean }[] | null;
const textInput = () => $<HTMLInputElement>('.as-composer input:not([type="datetime-local"])')!;
const whenInput = () => $<HTMLInputElement>('.as-composer input[type="datetime-local"]')!;

const SAVED = [
  { id: "1", text: "Ship portfolio batch", when: "2026-08-24T09:00", done: false },
  { id: "2", text: "Review the next route", when: "2026-08-24T14:30", done: false },
  { id: "3", text: "Archive loose notes", when: "2026-08-25T10:00", done: true },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 13, 12, 20));
  localStorage.clear();
  // Most tests start from saved reminders with past August times (two of them overdue).
  localStorage.setItem("reminders-v1", JSON.stringify(SAVED));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Home />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe("after hydration", () => {
  it("marks past open reminders overdue and defaults the time to the next full hour", () => {
    expect(whenInput().value).toBe("2026-11-13T13:00");
    expect([...host.querySelectorAll(".as-pill")].map((p) => p.textContent)).toEqual(["Overdue", "Overdue"]);
    press(button("Overdue", $(".as-side")!));
    expect(rows()).toEqual(["Ship portfolio batch", "Review the next route"]);
  });

  it("the header counts overdue reminders first and names only an upcoming one as Next", () => {
    const head = () => $(".as-head p")!.textContent;
    expect(head()).toBe("2 overdue · Nothing else coming up");
    type(textInput(), "Renew passport");
    type(whenInput(), "2027-02-01T09:30");
    press(button("Add", $(".as-composer")!));
    expect(head()).toBe("2 overdue · Next: Renew passport · Mon 1 Feb 2027 · 09:30");
    for (const text of ["Ship portfolio batch", "Review the next route"]) {
      act(() => { $<HTMLInputElement>(`[aria-label="${text}: mark as done"]`)!.click(); });
    }
    expect(head()).toBe("Next: Renew passport · Mon 1 Feb 2027 · 09:30");
  });
});

describe("adding", () => {
  it("adds with the default time, keeps focus in the field and resets the time", () => {
    expect(button("Add", $(".as-composer")!).disabled).toBe(true);
    type(textInput(), "Call the dentist");
    press(button("Add", $(".as-composer")!));
    expect(stored()![0]).toMatchObject({ text: "Call the dentist", when: "2026-11-13T13:00", done: false });
    expect(rows()).toContain("Call the dentist");
    expect(document.activeElement).toBe(textInput());
    expect(textInput().value).toBe("");
  });

  it("uses a time the person picks", () => {
    type(textInput(), "Renew passport");
    type(whenInput(), "2027-02-01T09:30");
    press(button("Add", $(".as-composer")!));
    expect(stored()![0].when).toBe("2027-02-01T09:30");
    expect(host.textContent).toContain("Mon 1 Feb 2027 · 09:30");
    expect(whenInput().value).toBe("2026-11-13T13:00");
  });
});

describe("lists and empty states", () => {
  it("ticking moves a reminder to Completed and shows each empty state", () => {
    act(() => { $<HTMLInputElement>('[aria-label="Ship portfolio batch: mark as done"]')!.click(); });
    press(button("Completed", $(".as-side")!));
    expect(rows()).toEqual(["Ship portfolio batch", "Archive loose notes"]);

    press(button("Open", $(".as-side")!));
    act(() => { $<HTMLInputElement>('[aria-label="Review the next route: mark as done"]')!.click(); });
    press(button("Overdue", $(".as-side")!));
    expect(host.textContent).toContain("Nothing overdue");
    press(button("Open", $(".as-side")!));
    expect(host.textContent).toContain("All caught up");
    expect(host.textContent).toContain("Nothing open. You are all caught up.");
  });

  it("says nothing is saved once everything is removed, and Completed has its own empty state", () => {
    press(button("All", $(".as-side")!));
    for (const text of ["Ship portfolio batch", "Review the next route", "Archive loose notes"]) press($(`[aria-label="Remove ${text}"]`)!, 1);
    expect(host.textContent).toContain("No reminders yet");
  });

  it("Completed shows its own empty state", () => {
    press(button("Completed", $(".as-side")!));
    act(() => { $<HTMLInputElement>('[aria-label="Archive loose notes: mark as not done"]')!.click(); });
    press(button("Completed", $(".as-side")!));
    expect(host.textContent).toContain("Nothing completed yet");
  });
});

describe("remove and undo", () => {
  it("keyboard removal focuses Undo; Undo restores and focus returns to the reminder field", () => {
    press($('[aria-label="Remove Review the next route"]')!, 0);
    expect(rows()).toEqual(["Ship portfolio batch"]);
    expect(document.activeElement?.textContent).toBe("Undo");
    press(button("Undo"));
    expect(rows()).toEqual(["Ship portfolio batch", "Review the next route"]);
    expect(document.activeElement).toBe(textInput());
  });

  it("Escape dismisses without restoring; a mouse removal times out after six seconds", () => {
    press($('[aria-label="Remove Ship portfolio batch"]')!, 0);
    act(() => { $(".as-toast")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect($(".as-toast")).toBeNull();
    expect(rows()).toEqual(["Review the next route"]);

    vi.useFakeTimers();
    press($('[aria-label="Remove Review the next route"]')!, 1);
    expect(document.activeElement?.textContent).not.toBe("Undo");
    act(() => { vi.advanceTimersByTime(6000); });
    expect($(".as-toast")).toBeNull();
  });
});

describe("review fixes", () => {
  // The clock subscription starts on mount, so remount after switching to fully fake timers.
  function remountWithFakeTimers(at: Date) {
    act(() => root.unmount());
    vi.useFakeTimers();
    vi.setSystemTime(at);
    root = createRoot(host);
    act(() => root.render(<Home />));
  }

  it("marks a reminder overdue on its own once its time passes, while the page stays open", () => {
    remountWithFakeTimers(new Date(2026, 10, 13, 12, 20));
    type(textInput(), "Stand-up");
    type(whenInput(), "2026-11-13T12:30");
    press(button("Add", $(".as-composer")!));
    const pillOf = () => [...host.querySelectorAll(".as-row")].find((row) => row.textContent?.includes("Stand-up"))!.querySelector(".as-pill")!.textContent;
    expect(pillOf()).toBe("Open");
    vi.setSystemTime(new Date(2026, 10, 13, 12, 31));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(pillOf()).toBe("Overdue");
  });

  it("keeps the default time fixed once typing starts, even when the hour rolls over", () => {
    remountWithFakeTimers(new Date(2026, 10, 13, 12, 58));
    expect(whenInput().value).toBe("2026-11-13T13:00");
    vi.setSystemTime(new Date(2026, 10, 13, 13, 0, 10));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(whenInput().value).toBe("2026-11-13T14:00");
    vi.setSystemTime(new Date(2026, 10, 13, 12, 59));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(whenInput().value).toBe("2026-11-13T13:00");
    type(textInput(), "Water plants");
    vi.setSystemTime(new Date(2026, 10, 13, 13, 1));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(whenInput().value).toBe("2026-11-13T13:00");
  });

  it("ticking a row in Open moves focus to the row now in its place, then to the reminder field", () => {
    const first = $<HTMLInputElement>('[aria-label="Ship portfolio batch: mark as done"]')!;
    first.focus();
    act(() => { first.click(); });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Review the next route: mark as done");
    act(() => { (document.activeElement as HTMLInputElement).click(); });
    expect(document.activeElement).toBe(textInput());
  });
});

describe("adding from a list that would hide the new reminder", () => {
  it("switches from Completed to Open so the new reminder is visible", () => {
    press(button("Completed", $(".as-side")!));
    type(textInput(), "Book flights");
    press(button("Add", $(".as-composer")!));
    expect($("h1")!.textContent).toBe("Open");
    expect(rows()).toContain("Book flights");
  });

  it("stays in Overdue when the new time is already past, switches to Open when it is ahead", () => {
    press(button("Overdue", $(".as-side")!));
    type(textInput(), "Late one");
    type(whenInput(), "2026-11-13T08:00");
    press(button("Add", $(".as-composer")!));
    expect($("h1")!.textContent).toBe("Overdue");
    expect(rows()).toContain("Late one");
    type(textInput(), "Later one");
    press(button("Add", $(".as-composer")!));
    expect($("h1")!.textContent).toBe("Open");
    expect(rows()).toContain("Later one");
  });

  // 2026-11-18 review round 2.
  it("a first visit starts from sample reminders dated from the clock, none of them overdue", () => {
    // The page's store builds its starter list when the module loads; the clock was frozen (vi.hoisted above) before that.
    act(() => root.unmount());
    localStorage.clear();
    root = createRoot(host);
    act(() => root.render(<Home />));
    expect([...host.querySelectorAll(".as-pill")].map((p) => p.textContent)).toEqual(["Open", "Open"]);
    expect([...host.querySelectorAll(".as-row time")].map((t) => t.textContent)).toEqual(["Fri 13 Nov 2026 · 14:00", "Sat 14 Nov 2026 · 09:00"]);
    expect($(".as-head p")!.textContent).toBe("Next: Ship portfolio batch · Fri 13 Nov 2026 · 14:00");
  });

  it("strikes through done rows, now that row titles are h2", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(`${process.cwd()}/app/app-shell.css`, "utf8")).toContain('.as-row[data-done="true"] h2, .as-row[data-done="true"] h3 { color: var(--as-muted); text-decoration: line-through; }');
  });

  it("warns, linked to the field, when the chosen time has already passed", () => {
    expect($("#when-hint")).toBeNull();
    type(whenInput(), "2026-11-12T09:00");
    expect($("#when-hint")!.textContent).toBe("This time has passed, so the reminder will show as Overdue.");
    expect(whenInput().getAttribute("aria-describedby")).toBe("when-hint");
    // Described by the hint, but not named by it: the hint sits outside the When label.
    expect(whenInput().closest("label")!.contains($("#when-hint"))).toBe(false);
    type(whenInput(), "2026-11-14T09:00");
    expect($("#when-hint")).toBeNull();
  });

  it("a mouse resting on the Undo toast keeps it open; leaving restarts the countdown", () => {
    act(() => root.unmount());
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 13, 12, 20));
    root = createRoot(host);
    act(() => root.render(<Home />));
    press($('[aria-label="Remove Ship portfolio batch"]')!, 1);
    const toast = $(".as-toast")!;
    act(() => { toast.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); });
    act(() => { vi.advanceTimersByTime(10000); });
    expect($(".as-toast")).not.toBeNull();
    act(() => { toast.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body })); });
    act(() => { vi.advanceTimersByTime(6000); });
    expect($(".as-toast")).toBeNull();
  });

  it("keeps the heading outline in order: one h1 first, row titles are h2, no h3", () => {
    const levels = [...host.querySelectorAll("h1, h2, h3")].map((h) => h.tagName);
    expect(levels[0]).toBe("H1");
    expect(levels).not.toContain("H3");
  });

  it("says under the title that nothing is sent as a notification (shown on phones)", () => {
    expect($(".as-head-note")!.textContent).toBe("Saved on this device. This page never sends notifications.");
  });

  // Codex 2026-11-19: a focused footer link must not sit behind the toast.
  it("reserves the toast's height at the page bottom and in scroll-padding while it shows, and clears it after", async () => {
    const root = document.documentElement.style;
    expect(root.getPropertyValue("--as-toast-space")).toBe("");
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(52);
    press($('[aria-label="Remove Ship portfolio batch"]')!, 1);
    expect(root.getPropertyValue("--as-toast-space")).toBe("84px");
    act(() => { $(".as-toast")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(root.getPropertyValue("--as-toast-space")).toBe("");
    height.mockRestore();
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/app/app-shell.css`, "utf8");
    expect(css).toContain("html { scroll-padding-top: 64px; scroll-padding-bottom: calc(16px + var(--as-toast-space, 0px)); }");
    expect(css).toContain(".as { padding-bottom: var(--as-toast-space, 0px); }");
  });
});
