/**
 * WhatsApp chat listing tool.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WhatsAppClient } from "../services/whatsapp-client.js";
import { ListChatsInputSchema, type ListChatsInput } from "../schemas/index.js";

export function registerChatsTool(server: McpServer, client: WhatsAppClient): void {
  server.registerTool(
    "whatsapp_list_chats",
    {
      title: "List WhatsApp Chats",
      description: `List available WhatsApp chats (groups and contacts).

Returns a list of chats with their IDs, names, and metadata.
Use the chat ID from the results with other tools like whatsapp_send_message.

Args:
  - limit (number): Maximum chats to return (1-100, default: 20)

Returns:
  List of chats with:
  - id: Chat JID (use this for sending messages)
  - name: Display name of the chat
  - isGroup: Whether this is a group chat
  - unreadCount: Number of unread messages`,
      inputSchema: ListChatsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListChatsInput) => {
      try {
        const chats = await client.getChats(params.limit);

        if (chats.length === 0) {
          return {
            content: [{
              type: "text",
              text: "No chats found. The chat list may still be loading after connection.",
            }],
          };
        }

        const lines = [`# WhatsApp Chats (${chats.length})`, ""];
        for (const chat of chats) {
          const type = chat.isGroup ? "Group" : "DM";
          const unread = chat.unreadCount > 0 ? ` (${chat.unreadCount} unread)` : "";
          lines.push(`- **${chat.name}** [${type}]${unread}`);
          lines.push(`  ID: \`${chat.id}\``);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error listing chats: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
