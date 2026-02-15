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
import { WhatsAppClient } from "./services/whatsapp-client.js";
import { registerStatusTool } from "./tools/status.js";
import { registerChatsTool } from "./tools/chats.js";
import { registerSendMessageTool } from "./tools/send-message.js";
import { registerGroupInfoTool } from "./tools/group-info.js";
import { registerListMessagesTool } from "./tools/list-messages.js";

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { createInterface } from "node:readline/promises";

function resolveAuthDir(): string {
  const raw = process.env.WHATSAPP_AUTH_DIR;
  if (raw) {
    return raw.startsWith("~/") ? path.join(os.homedir(), raw.slice(2)) : raw;
  }
  return path.join(os.homedir(), ".whatsapp-mcp", "auth");
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

async function main(): Promise<void> {
  // Initialize WhatsApp client
  const authDir = resolveAuthDir();
  await maybeRelinkAuthDir(authDir);
  const client = new WhatsAppClient(authDir);
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
  });

  // Create MCP server
  const server = new McpServer({
    name: "whatsapp-mcp-server",
    version: "0.1.0",
  });

  // Register all tools
  registerStatusTool(server, client);
  registerChatsTool(server, client);
  registerSendMessageTool(server, client);
  registerGroupInfoTool(server, client);
  registerListMessagesTool(server, client);

  // Start WhatsApp connection (runs in background)
  console.error("Starting WhatsApp connection...");
  client.connect().catch((error) => {
    console.error("WhatsApp connection error:", error);
  });

  // Connect MCP server to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("WhatsApp MCP server running via stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
