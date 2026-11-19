import { NextResponse } from "next/server";
import { starterReminders, nextOpen, openCount, sanitizeReminders, sortByWhen } from "@/lib/reminders";

// Stateless JSON-RPC MCP endpoint. Reminders live in the visitor's browser (localStorage), so the server
// cannot read them and never sends notifications: it serves the starter list and orders reminders the caller sends.

type RpcRequest = { id?: number | string | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };

const TOOLS = [
  { name: "get_sample_reminders", description: "The starter reminders a new browser begins with", inputSchema: { type: "object", properties: {} } },
  {
    name: "next_reminder",
    description: "Order the given reminders by time and return the earliest open one; malformed entries are skipped",
    inputSchema: {
      type: "object",
      properties: {
        reminders: {
          type: "array",
          items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, when: { type: "string", description: "YYYY-MM-DDTHH:MM" }, done: { type: "boolean" } } },
        },
      },
      required: ["reminders"],
    },
  },
];

class RpcError extends Error {
  constructor(readonly code: number, message: string) {
    super(message);
  }
}

function callTool(name: string | undefined, args: Record<string, unknown> = {}) {
  switch (name) {
    case "get_sample_reminders":
      return { reminders: starterReminders(new Date()) };
    case "next_reminder": {
      if (!Array.isArray(args.reminders)) throw new RpcError(-32602, "reminders must be an array");
      const reminders = sanitizeReminders(args.reminders);
      return { next: nextOpen(reminders) ?? null, open: openCount(reminders), ordered: sortByWhen(reminders) };
    }
    default:
      throw new RpcError(-32602, `Unknown tool: ${String(name)}`);
  }
}

export async function POST(request: Request) {
  let id: RpcRequest["id"] = null;
  try {
    const body = (await request.json()) as RpcRequest;
    id = body.id ?? null;
    let result: unknown;
    switch (body.method) {
      case "initialize":
        result = {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "Reminders", version: "1.0.0" },
        };
        break;
      case "tools/list":
        result = { tools: TOOLS };
        break;
      case "tools/call":
        result = callTool(body.params?.name, body.params?.arguments);
        break;
      default:
        throw new RpcError(-32601, `Unknown method: ${String(body.method)}`);
    }
    return NextResponse.json({ jsonrpc: "2.0", id, result });
  } catch (error) {
    const code = error instanceof RpcError ? error.code : -32700;
    const message = error instanceof RpcError ? error.message : "Parse error";
    return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 400 });
  }
}
