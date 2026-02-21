#!/usr/bin/env node
/**
 * WhatsApp MCP Server
 *
 * An MCP server that provides WhatsApp messaging capabilities via Baileys.
 * Connects to WhatsApp Web protocol and exposes tools for listing chats,
 * sending messages, and getting group information.
 *
 * Authentication: On first run, a QR code is displayed in the terminal.
 * Scan it with your phone (WhatsApp > Linked Devices > Link a Device).
 * The session is persisted so you only need to scan once.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { WhatsAppClient } from "./services/whatsapp-client.js";
import { registerStatusTool } from "./tools/status.js";
import { registerChatsTool } from "./tools/chats.js";
import { registerSendMessageTool } from "./tools/send-message.js";
import { registerGroupInfoTool } from "./tools/group-info.js";
import { registerListMessagesTool } from "./tools/list-messages.js";
import { registerDownloadMediaTool } from "./tools/download-media.js";
import { registerSendFileTool } from "./tools/send-file.js";
import { registerGetMediaTool } from "./tools/get-media.js";

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { createInterface } from "node:readline/promises";

type TransportMode = "stdio" | "http";

function createMcpServer(client: WhatsAppClient): McpServer {
  const server = new McpServer({
    name: "whatsapp-mcp-server",
    version: "0.1.0",
  });

  registerStatusTool(server, client);
  registerChatsTool(server, client);
  registerSendMessageTool(server, client);
  registerGroupInfoTool(server, client);
  registerListMessagesTool(server, client);
  registerDownloadMediaTool(server, client);
  registerSendFileTool(server, client);
  registerGetMediaTool(server, client);

  return server;
}

function resolveAuthDir(): string {
  const raw = process.env.WHATSAPP_AUTH_DIR;
  if (raw) {
    return raw.startsWith("~/") ? path.join(os.homedir(), raw.slice(2)) : raw;
  }
  return path.join(os.homedir(), ".whatsapp-mcp", "auth");
}

function resolveTransportMode(): TransportMode {
  const raw = (process.env.WHATSAPP_MCP_TRANSPORT || "stdio").trim().toLowerCase();
  if (!raw || raw === "stdio") return "stdio";
  if (raw === "http" || raw === "streamable-http" || raw === "streamable_http" || raw === "streamablehttp") {
    return "http";
  }
  throw new Error(`Invalid WHATSAPP_MCP_TRANSPORT: ${raw}. Expected "stdio" or "http".`);
}

function resolveHttpHost(): string {
  return (process.env.WHATSAPP_HTTP_HOST || "127.0.0.1").trim();
}

function resolveHttpPort(): number {
  const raw = (process.env.WHATSAPP_HTTP_PORT || "8787").trim();
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid WHATSAPP_HTTP_PORT: ${raw}. Expected integer 1-65535.`);
  }
  return port;
}

function resolveHttpPath(): string {
  const raw = (process.env.WHATSAPP_HTTP_PATH || "/mcp").trim();
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  if (withLeadingSlash === "/") return withLeadingSlash;
  return withLeadingSlash.replace(/\/+$/, "");
}

function parseRelinkMode(): "backup" | "delete" | null {
  const raw = (process.env.WHATSAPP_RELINK || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "y" || raw === "backup") return "backup";
  if (raw === "delete" || raw === "wipe" || raw === "remove") return "delete";
  return null;
}

function backupSuffix(): string {
  // "2026-02-15T17-01-02Z"
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function backupDir(srcDir: string): Promise<string> {
  const dstDir = `${srcDir}.backup-${backupSuffix()}`;
  try {
    await fsp.rename(srcDir, dstDir);
    return dstDir;
  } catch {
    // Fallback for cases where rename fails: copy + remove.
    await fsp.cp(srcDir, dstDir, { recursive: true, errorOnExist: true });
    await fsp.rm(srcDir, { recursive: true, force: true });
    return dstDir;
  }
}

async function maybeRelinkAuthDir(authDir: string): Promise<void> {
  const credsPath = path.join(authDir, "creds.json");
  const hasCreds = fs.existsSync(credsPath);
  if (!hasCreds) return;

  const nonInteractiveMode = parseRelinkMode();
  if (nonInteractiveMode) {
    console.error(`Existing WhatsApp auth found at ${authDir} (WHATSAPP_RELINK=${nonInteractiveMode}).`);
    if (nonInteractiveMode === "delete") {
      await fsp.rm(authDir, { recursive: true, force: true });
      return;
    }
    const backup = await backupDir(authDir);
    console.error(`Backed up existing auth dir to ${backup}`);
    return;
  }

  // Only prompt when run manually; never block MCP clients (stdin is a pipe).
  if (!process.stdin.isTTY) return;

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    console.error(`Existing WhatsApp auth found at: ${authDir}`);
    const relink = (await rl.question("Create a new WhatsApp link (QR code)? (y/N): ")).trim().toLowerCase();
    if (!(relink === "y" || relink === "yes")) return;

    const action = (await rl.question("What to do with existing auth dir? [b]ackup/[d]elete/[c]ancel (default: backup): "))
      .trim()
      .toLowerCase();

    if (action === "d" || action === "delete") {
      await fsp.rm(authDir, { recursive: true, force: true });
      console.error("Deleted existing auth dir.");
      return;
    }
    if (action === "c" || action === "cancel") {
      console.error("Cancelled. Keeping existing auth.");
      return;
    }

    const backup = await backupDir(authDir);
    console.error(`Backed up existing auth dir to ${backup}`);
  } finally {
    rl.close();
  }
}

function shouldExitAfterPair(): boolean {
  const raw = (process.env.WHATSAPP_EXIT_AFTER_PAIR || "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "y") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "n") return false;
  // Default: only for manual runs in a real terminal; never for stdio-spawned MCP clients.
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function sendJsonError(res: ServerResponse, statusCode: number, message: string): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message,
      },
      id: null,
    }),
  );
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const bufferChunk = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    chunks.push(bufferChunk);
    totalBytes += bufferChunk.length;
    if (totalBytes > 1_000_000) {
      throw new Error("Request body too large");
    }
  }

  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON request body");
  }
}

function getSessionId(req: IncomingMessage): string | undefined {
  const header = req.headers["mcp-session-id"];
  if (Array.isArray(header)) return header[0];
  return header;
}

async function startHttpTransport(client: WhatsAppClient): Promise<void> {
  const host = resolveHttpHost();
  const port = resolveHttpPort();
  const mcpPath = resolveHttpPath();
  const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

  const httpServer = createServer((req, res) => {
    void (async () => {
      try {
        const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
        if (reqUrl.pathname !== mcpPath) {
          res.statusCode = 404;
          res.end("Not Found");
          return;
        }

        const method = (req.method || "GET").toUpperCase();
        const parsedBody = method === "POST" ? await readJsonBody(req) : undefined;
        const sessionId = getSessionId(req);

        let entry = sessionId ? sessions.get(sessionId) : undefined;

        if (!entry) {
          if (sessionId) {
            sendJsonError(res, 404, "Unknown MCP session id");
            return;
          }
          if (method !== "POST" || !isInitializeRequest(parsedBody)) {
            sendJsonError(res, 400, "No active MCP session. Send initialize first.");
            return;
          }

          const server = createMcpServer(client);
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              sessions.set(newSessionId, { server, transport });
            },
            onsessionclosed: async (closedSessionId) => {
              const closed = sessions.get(closedSessionId);
              sessions.delete(closedSessionId);
              if (closed) {
                try {
                  await closed.server.close();
                } catch (error) {
                  console.error("Failed to close MCP session server:", error);
                }
              }
            },
          });

          await server.connect(transport);
          entry = { server, transport };
        }

        await entry.transport.handleRequest(req, res, parsedBody);
      } catch (error) {
        console.error("HTTP transport request failed:", error);
        if (!res.headersSent) {
          sendJsonError(res, 500, "Internal server error");
        } else {
          res.destroy();
        }
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  console.error(`WhatsApp MCP server running via streamable HTTP at http://${host}:${port}${mcpPath}`);
}

async function main(): Promise<void> {
  // Initialize WhatsApp client
  const authDir = resolveAuthDir();
  await maybeRelinkAuthDir(authDir);
  const client = new WhatsAppClient(authDir);
  const transportMode = resolveTransportMode();
  const exitAfterPair = shouldExitAfterPair();
  let sawQrThisRun = false;
  let exitScheduled = false;

  client.onConnection((status) => {
    if (status.qrCode) {
      sawQrThisRun = true;
    }
    if (exitAfterPair && sawQrThisRun && status.connected && !exitScheduled) {
      exitScheduled = true;
      console.error("WhatsApp pairing complete. Exiting (session saved).");
      setTimeout(() => process.exit(0), 1000);
    }
    if (status.connected && !exitScheduled) {
      client.loadRawMessageStore();
    }
  });

  // Start WhatsApp connection (runs in background)
  console.error("Starting WhatsApp connection...");
  client.connect().catch((error) => {
    console.error("WhatsApp connection error:", error);
  });

  if (transportMode === "stdio") {
    const server = createMcpServer(client);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("WhatsApp MCP server running via stdio");
    return;
  }

  await startHttpTransport(client);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
