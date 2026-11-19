"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { AppFoot, AppTop, ListButton, Pill, type Tone } from "@/components/app-shell";
import { createLocalStore, useLocalStore } from "@/lib/local-store";
import { STORAGE_KEY, addReminder as addTo, deleteReminder, formatWhen, headline, isOverdue, listView, nextFullHour, parseReminders, restoreReminder, serializeReminders, toLocalInput, toggleDone, type Reminder, type ReminderList } from "@/lib/reminders";

const store = createLocalStore(STORAGE_KEY, parseReminders, serializeReminders);

// The viewer's clock at minute resolution, re-read every 30 s so Overdue marks appear on their own
// while the page stays open. null on the server and during hydration (no time baked into HTML).
function subscribeClock(listener: () => void) {
  const timer = window.setInterval(listener, 30_000);
  return () => window.clearInterval(timer);
}
function useNow(): string | null {
  return useSyncExternalStore(subscribeClock, () => toLocalInput(new Date()), () => null);
}
// Every removal still inside the Undo window (rows are shown sorted by time, so no position is needed).
type RemovedBatch = { items: Reminder[]; viaKeyboard: boolean };
const removedLabel = (items: Reminder[]) => (items.length === 1 ? `Removed “${items[0].text}”` : `Removed ${items.length} reminders`);
const LISTS: { value: ReminderList; label: string; tone?: Tone }[] = [
  { value: "open", label: "Open", tone: "green" },
  { value: "overdue", label: "Overdue", tone: "red" },
  { value: "done", label: "Completed", tone: "grey" },
  { value: "all", label: "All" },
];

export default function Home() {
  const items = useLocalStore(store);
  const setItems = store.set;
  // The clock only exists in the browser: overdue marks and the default time appear after hydration.
  const now = useNow();
  const [list, setList] = useState<ReminderList>("open");
  const [text, setText] = useState("");
  const [when, setWhen] = useState<string | null>(null);
  // Until the person types, the time follows the clock; from the first keystroke it is fixed, so it
  // cannot jump to the next hour while they are still writing.
  const whenValue = when ?? (now ? nextFullHour(new Date()) : "");
  const focusAfterToggle = useRef<number | null>(null);
  // One Undo puts back every removal still inside the Undo window.
  const [removed, setRemovedState] = useState<RemovedBatch | null>(null);
  // The latest batch, so two removals before a re-render still both land in it.
  const removedRef = useRef<RemovedBatch | null>(null);
  const setRemoved = (batch: RemovedBatch | null) => { removedRef.current = batch; setRemovedState(batch); };
  const [toastFocused, setToastFocused] = useState(false);
  // A mouse resting on the toast pauses the countdown too (WCAG 2.2.1), not only keyboard focus.
  const [toastHovered, setToastHovered] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const textRef = useRef<HTMLInputElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => listView(items, list, now), [items, list, now]);
  const countOf = (value: ReminderList) => listView(items, value, now).length;

  useEffect(() => { if (removed?.viaKeyboard) undoRef.current?.focus(); }, [removed]);
  // Ticking a row in Open (or unticking in Completed) removes it from the list, and with it the
  // focused checkbox: move focus to the row now in that place, or to the reminder field.
  useEffect(() => {
    const index = focusAfterToggle.current;
    if (index === null) return;
    focusAfterToggle.current = null;
    const checks = document.querySelectorAll<HTMLInputElement>(".as-list .as-check input");
    (checks[Math.min(index, checks.length - 1)] ?? textRef.current)?.focus();
  }, [visible]);
  function toggle(item: Reminder, index: number) {
    const leaves = list === "open" || list === "done" || (list === "overdue" && !item.done);
    if (leaves) focusAfterToggle.current = index;
    setItems((current) => toggleDone(current, item.id));
  }
  useEffect(() => {
    if (!removed || toastFocused || toastHovered) return;
    // Each removal makes a new batch object, so the 6 s restart from the latest one.
    const timer = window.setTimeout(() => { removedRef.current = null; setRemovedState(null); setToastHovered(false); }, 6000);
    return () => window.clearTimeout(timer);
  }, [removed, toastFocused, toastHovered]);

  // While the toast shows, reserve its height (plus its 24px offset and a gap) at the bottom of the page and in
  // scroll-padding, so a link or control focused behind it (e.g. the footer, Tab while the pointer rests on the
  // toast) scrolls clear instead of staying hidden (WCAG 2.4.11). Same pattern as habit-tracker and calendar.
  const toastShown = removed !== null;
  useLayoutEffect(() => {
    const toast = toastRef.current;
    if (!toastShown || !toast) return;
    const rootStyle = document.documentElement.style;
    const reserve = () => rootStyle.setProperty("--as-toast-space", `${toast.offsetHeight + 32}px`);
    reserve();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(reserve) : null;
    observer?.observe(toast);
    return () => { observer?.disconnect(); rootStyle.removeProperty("--as-toast-space"); };
  }, [toastShown]);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || !whenValue) return;
    setItems((current) => addTo(current, text, whenValue, () => crypto.randomUUID()));
    // A new reminder is open; if the list on screen would hide it (Completed, or Overdue with a
    // future time), switch to Open so the person sees what they just added.
    if (list === "done" || (list === "overdue" && !(now !== null && whenValue < now))) setList("open");
    setAnnouncement(`Added “${text.trim()}” for ${formatWhen(whenValue)}.`);
    setText("");
    setWhen(null);
    textRef.current?.focus();
  }
  function remove(item: Reminder, viaKeyboard: boolean) {
    setItems((current) => deleteReminder(current, item.id));
    const batch = [...(removedRef.current?.items ?? []), item];
    setRemoved({ items: batch, viaKeyboard });
    setAnnouncement(`${removedLabel(batch)}. Undo is available for a few seconds.`);
  }
  function closeToast() {
    setRemoved(null);
    setToastFocused(false);
    setToastHovered(false);
    textRef.current?.focus();
  }
  function undo() {
    const batch = removedRef.current?.items;
    if (!batch?.length) return;
    setItems((current) => batch.reduce(restoreReminder, current));
    setAnnouncement(batch.length === 1 ? `Restored “${batch[0].text}”.` : `Restored ${batch.length} reminders.`);
    closeToast();
  }

  const title = LISTS.find((entry) => entry.value === list)!.label;
  // A time already passed is allowed (catching up on something missed), but say it will be Overdue.
  const inPast = now !== null && whenValue !== "" && whenValue < now;

  return (
    <div className="as">
      <a className="as-skip" href="#main">Skip to content</a>
      <AppTop name="Reminders" tagline="Saved on this device · no notifications" />

      <div className="as-body">
        <aside className="as-side" aria-label="Lists">
          <p className="as-side-title" aria-hidden="true">Lists</p>
          <ul className="as-lists">
            {LISTS.map(({ value, label, tone }) => (
              <ListButton key={value} label={label} count={countOf(value)} tone={tone} current={list === value} onSelect={() => setList(value)} />
            ))}
          </ul>
        </aside>

        <main id="main" className="as-main">
          <div className="as-head">
            <div>
              <h1>{title}</h1>
              <p aria-live="polite">{headline(items, now)}</p>
              <p className="as-head-note">Saved on this device. This page never sends notifications.</p>
            </div>
          </div>

          <form className="as-composer" onSubmit={add} aria-label="New reminder">
            <div className="as-composer-grid">
              <label className="as-field">Reminder
                <input ref={textRef} value={text} onChange={(event) => { if (when === null && whenValue) setWhen(whenValue); setText(event.target.value); }} placeholder="What should you remember?" autoComplete="off" />
              </label>
              <label className="as-field">When
                <input type="datetime-local" value={whenValue} onChange={(event) => setWhen(event.target.value)} aria-describedby="when-hint" />
              </label>
              <button type="submit" className="as-button" disabled={!text.trim() || !whenValue}>Add</button>
            </div>
            {/* Outside the label, so the field's name stays "When"; the warning is only its description. */}
            {/* Always in the DOM as a polite live region, so the warning is announced while focus stays in When. */}
            <p id="when-hint" className="as-hint" aria-live="polite">{inPast ? "This time has passed, so the reminder will show as Overdue." : ""}</p>
          </form>

          {visible.length ? (
            <ul className="as-list" aria-label={title}>
              {visible.map((item, index) => {
                const late = now !== null && isOverdue(item, now);
                return (
                  <li className="as-row as-row-check" key={item.id} data-done={item.done ? "true" : undefined}>
                    <label className="as-check">
                      <input type="checkbox" checked={item.done} onChange={() => toggle(item, index)} aria-label={`${item.text}: mark as ${item.done ? "not done" : "done"}`} />
                      <span aria-hidden="true" />
                    </label>
                    <div>
                      <h2>{item.text}</h2>
                      {/* The starter list is dated from the clock, so times appear once the clock is known (after hydration). */}
                      <p>{now === null ? "\u00a0" : <time dateTime={item.when}>{formatWhen(item.when)}</time>}</p>
                    </div>
                    {late ? <Pill tone="red">Overdue</Pill> : item.done ? <Pill tone="grey">Done</Pill> : <Pill tone="green">Open</Pill>}
                    <button type="button" className="as-plain as-danger" aria-label={`Remove ${item.text}`} onClick={(event) => remove(item, event.detail === 0)}>Remove</button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="as-list as-empty">
              {items.length === 0 ? (
                <><strong>No reminders yet</strong>Type a reminder above, pick a time and press Add.</>
              ) : list === "overdue" ? (
                <><strong>Nothing overdue</strong>Every open reminder is still ahead of you.</>
              ) : list === "done" ? (
                <><strong>Nothing completed yet</strong>Tick a reminder when it is handled.</>
              ) : (
                <><strong>All caught up</strong>Every reminder here is complete.</>
              )}
            </div>
          )}

          <p className="as-note">Reminders are saved in this browser only. This page does not send notifications or sync to other devices.</p>
        </main>
      </div>

      <p className="as-sr" role="status" aria-live="polite">{announcement}</p>
      {removed ? (
        <div
          ref={toastRef}
          className="as-toast"
          role="group"
          aria-label="Undo remove"
          onFocus={() => setToastFocused(true)}
          onMouseEnter={() => setToastHovered(true)}
          onMouseLeave={() => setToastHovered(false)}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToastFocused(false); }}
          onKeyDown={(event) => { if (event.key === "Escape") closeToast(); }}
        >
          <span>{removedLabel(removed.items)}</span>
          <button ref={undoRef} type="button" className="as-plain" onClick={undo} aria-label={removed.items.length === 1 ? undefined : `Undo remove of ${removed.items.length} reminders`}>Undo</button>
        </div>
      ) : null}

      <AppFoot source="https://github.com/bookchaowalit-website/productivity-reminders-web" />
    </div>
  );
}
