import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { starterReminders } from "@/lib/reminders";

function rpc(body: unknown) {
  return POST(new Request("http://localhost/api/mcp", { method: "POST", body: JSON.stringify(body) }));
}

describe("MCP route", () => {
  it("echoes the JSON-RPC request id, including 0", async () => {
    expect((await (await rpc({ jsonrpc: "2.0", id: 7, method: "tools/list" })).json()).id).toBe(7);
    expect((await (await rpc({ jsonrpc: "2.0", id: 0, method: "initialize" })).json()).id).toBe(0);
  });

  it("lists only the tools it really implements", async () => {
    const { result } = await (await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })).json();
    expect(result.tools.map((t: { name: string }) => t.name)).toEqual(["get_sample_reminders", "next_reminder"]);
  });

  // 2026-11-19 Codex review: the samples used the server's zone; now the caller picks one (default UTC).
  describe("get_sample_reminders", () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-19T04:00:00Z")); });
    afterEach(() => vi.useRealTimers());
    const call = (args?: Record<string, unknown>) =>
      rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_sample_reminders", ...(args ? { arguments: args } : {}) } }).then((res) => res.json());

    it("defaults to UTC local times", async () => {
      const { result } = await call();
      expect(result.timeZone).toBe("UTC");
      expect(result.reminders.map((r: { when: string }) => r.when)).toEqual(["2026-11-19T06:00", "2026-11-20T09:00", "2026-11-18T10:00"]);
    });

    it("builds the local times in the caller's IANA time zone", async () => {
      const { result } = await call({ timeZone: "Asia/Bangkok" });
      // 04:00 UTC is 11:00 in Bangkok: later today is 13:00 there, not an already-passed 06:00.
      expect(result.reminders.map((r: { when: string }) => r.when)).toEqual(["2026-11-19T13:00", "2026-11-20T09:00", "2026-11-18T10:00"]);
      expect(result.reminders).toEqual(starterReminders(new Date(), "Asia/Bangkok"));
    });

    it.each(["Mars/Olympus", "", 7])("rejects an invalid timeZone %s", async (timeZone) => {
      const body = await call({ timeZone });
      expect(body.error.code).toBe(-32602);
      expect(body.error.message).toMatch(/IANA time zone/);
    });

    it("documents the optional timeZone argument in the tool schema", async () => {
      const { result } = await (await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })).json();
      const tool = result.tools.find((t: { name: string }) => t.name === "get_sample_reminders");
      expect(tool.inputSchema.properties.timeZone.type).toBe("string");
      expect(tool.inputSchema.required).toBeUndefined();
    });
  });

  it("next_reminder picks the earliest open reminder from the ones it is given", async () => {
    const reminders = [
      { id: "a", text: "Late", when: "2026-09-02T10:00", done: false },
      { id: "b", text: "Done", when: "2026-09-01T08:00", done: true },
      { id: "c", text: "Soon", when: "2026-09-01T09:00", done: false },
      { id: "d", text: "bad" },
    ];
    const res = await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "next_reminder", arguments: { reminders } } });
    const { result } = await res.json();
    expect(result.next).toEqual(reminders[2]);
    expect(result.open).toBe(2);
    expect(result.ordered.map((r: { id: string }) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("next_reminder returns null when everything is done and rejects a non-array", async () => {
    const done = [{ id: "a", text: "x", when: "2026-09-01T08:00", done: true }];
    const ok = await (await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "next_reminder", arguments: { reminders: done } } })).json();
    expect(ok.result.next).toBeNull();
    const bad = await (await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "next_reminder", arguments: { reminders: 3 } } })).json();
    expect(bad.error.code).toBe(-32602);
    expect(bad.id).toBe(5);
  });

  it("rejects an unknown tool instead of pretending to call it (no notifications are sent)", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "send_notification" } });
    expect((await res.json()).error.code).toBe(-32602);
  });

  it("rejects an unknown method and bad JSON", async () => {
    expect((await (await rpc({ jsonrpc: "2.0", id: 7, method: "nope" })).json()).error.code).toBe(-32601);
    const bad = await POST(new Request("http://localhost/api/mcp", { method: "POST", body: "{" }));
    const body = await bad.json();
    expect(body.error.code).toBe(-32700);
    expect(body.id).toBeNull();
  });
});
