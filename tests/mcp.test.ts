import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { STARTER } from "@/lib/reminders";

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

  it("get_sample_reminders returns the starter list the page begins with", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_sample_reminders" } });
    expect((await res.json()).result.reminders).toEqual(STARTER);
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
