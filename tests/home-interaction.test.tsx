// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

// Mounted tests for reminders on the App shell. The clock is pinned to 13 Nov 2026 12:20.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
const $ = <T extends Element = HTMLElement>(selector: string) => host.querySelector(selector) as T | null;
const button = (text: string, scope: ParentNode = host) => [...scope.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith(text)) as HTMLButtonElement;
const rows = () => [...host.querySelectorAll(".as-row h3")].map((h) => h.textContent);
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 13, 12, 20));
  localStorage.clear();
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
