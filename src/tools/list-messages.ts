/**
 * WhatsApp message listing tool.
 *
 * Note: WhatsApp Web/Baileys does not provide arbitrary history access.
 * This lists messages observed by the running server (and optionally persisted).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WhatsAppClient } from "../services/whatsapp-client.js";
import { ListMessagesInputSchema, type ListMessagesInput } from "../schemas/index.js";

export function registerListMessagesTool(server: McpServer, client: WhatsAppClient): void {
  server.registerTool(
    "whatsapp_list_messages",
    {
      title: "List WhatsApp Messages",
      description: `List recent WhatsApp messages from the server's local message store.

Important: This tool can only list messages that the running server has observed (and, if enabled, persisted).
It does not fetch arbitrary chat history from WhatsApp.

Args:
  - chat_id (string, optional): Chat JID to list messages from (DM or group). If omitted, returns recent messages across all chats.
  - limit (number): Maximum messages to return (1-100, default: 20)

Returns:
  A formatted list of messages with timestamp, sender, and text.`,
      inputSchema: ListMessagesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListMessagesInput) => {
      try {
        const messages = await client.listMessages(params.chat_id, params.limit);
        if (messages.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No messages available in the local store yet. Keep the server running and try again after messages arrive.",
            }],
          };
        }

        const headerChat = params.chat_id ? `for ${params.chat_id}` : "across all chats";
        const lines: string[] = [`# WhatsApp Messages (${messages.length}) ${headerChat}`, ""];
        for (const m of messages) {
          const time = client.formatTimestamp(m.timestamp);
          const sender = m.isFromMe ? "me" : (m.senderName || m.sender);
          const chatLabel = params.chat_id ? "" : ` (${m.chatName})`;
          lines.push(`- **${time}** ${sender}${chatLabel}: ${m.text}`);
          lines.push(`  ID: \`${m.id}\`  Chat: \`${m.chatId}\``);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error listing messages: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}

