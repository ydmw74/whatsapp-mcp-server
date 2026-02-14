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

async function main(): Promise<void> {
  // Initialize WhatsApp client
  const authDir = process.env.WHATSAPP_AUTH_DIR;
  const client = new WhatsAppClient(authDir);

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
