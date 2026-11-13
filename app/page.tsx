"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { AppFoot, AppTop, ListButton, Pill, type Tone } from "@/components/app-shell";
import { createLocalStore, useLocalStore } from "@/lib/local-store";
import { STORAGE_KEY, addReminder as addTo, deleteReminder, formatWhen, isOverdue, listView, nextFullHour, nextOpen, parseReminders, restoreReminder, serializeReminders, toLocalInput, toggleDone, type Reminder, type ReminderList } from "@/lib/reminders";

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
  const [removed, setRemoved] = useState<{ item: Reminder; viaKeyboard: boolean } | null>(null);
  const [toastFocused, setToastFocused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const textRef = useRef<HTMLInputElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);

  const visible = useMemo(() => listView(items, list, now), [items, list, now]);
  const countOf = (value: ReminderList) => listView(items, value, now).length;
  const next = nextOpen(items);

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
    if (!removed || toastFocused) return;
    const timer = window.setTimeout(() => setRemoved(null), 6000);
    return () => window.clearTimeout(timer);
  }, [removed, toastFocused]);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!text.trim() || !whenValue) return;
    setItems((current) => addTo(current, text, whenValue, () => crypto.randomUUID()));
    setAnnouncement(`Added “${text.trim()}” for ${formatWhen(whenValue)}.`);
    setText("");
    setWhen(null);
    textRef.current?.focus();
  }
  function remove(item: Reminder, viaKeyboard: boolean) {
    setItems((current) => deleteReminder(current, item.id));
    setRemoved({ item, viaKeyboard });
    setAnnouncement(`Removed “${item.text}”. Undo is available for a few seconds.`);
  }
  function closeToast() {
    setRemoved(null);
    setToastFocused(false);
    textRef.current?.focus();
  }
  function undo() {
    if (!removed) return;
    const { item } = removed;
    setItems((current) => restoreReminder(current, item));
    setAnnouncement(`Restored “${item.text}”.`);
    closeToast();
  }

  const title = LISTS.find((entry) => entry.value === list)!.label;

  return (
    <div className="as">
      <a className="as-skip" href="#main">Skip to content</a>
      <AppTop name="Reminders" tagline="Saved on this device · no notifications" />

      <div className="as-body">
        <aside className="as-side" aria-label="Lists">
          <h2>Lists</h2>
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
              <p aria-live="polite">{next ? <>Next: {next.text} · {formatWhen(next.when)}</> : "Nothing open. You are all caught up."}</p>
            </div>
          </div>

          <form className="as-composer" onSubmit={add} aria-label="New reminder">
            <div className="as-composer-grid">
              <label className="as-field">Reminder
                <input ref={textRef} value={text} onChange={(event) => { if (when === null && whenValue) setWhen(whenValue); setText(event.target.value); }} placeholder="What should you remember?" autoComplete="off" />
              </label>
              <label className="as-field">When
                <input type="datetime-local" value={whenValue} onChange={(event) => setWhen(event.target.value)} />
              </label>
              <button type="submit" className="as-button" disabled={!text.trim() || !whenValue}>Add</button>
            </div>
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
                      <h3>{item.text}</h3>
                      <p><time dateTime={item.when}>{formatWhen(item.when)}</time></p>
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
          className="as-toast"
          role="group"
          aria-label="Undo remove"
          onFocus={() => setToastFocused(true)}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setToastFocused(false); }}
          onKeyDown={(event) => { if (event.key === "Escape") closeToast(); }}
        >
          <span>Removed “{removed.item.text}”</span>
          <button ref={undoRef} type="button" className="as-plain" onClick={undo}>Undo</button>
        </div>
      ) : null}

      <AppFoot source="https://github.com/bookchaowalit-website/productivity-reminders-web" />
    </div>
  );
}
