/**
 * WhatsApp send message tool.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WhatsAppClient } from "../services/whatsapp-client.js";
import { SendMessageInputSchema, type SendMessageInput } from "../schemas/index.js";

export function registerSendMessageTool(server: McpServer, client: WhatsAppClient): void {
  server.registerTool(
    "whatsapp_send_message",
    {
      title: "Send WhatsApp Message",
      description: `Send a text message to a WhatsApp chat or phone number.

IMPORTANT: This tool sends a real message. The LLM client should confirm
with the user before calling this tool.

Args:
  - chat_id (string): WhatsApp chat JID or phone number with country code
    Examples: '4915123456789', '4915123456789@s.whatsapp.net', '120363012345678901@g.us'
  - text (string): Message text to send (max 4096 characters)

Returns:
  - id: Message ID of the sent message
  - timestamp: Unix timestamp when the message was sent

Errors:
  - "WhatsApp is not connected" if client hasn't completed QR authentication
  - "Message too long" if text exceeds 4096 characters`,
      inputSchema: SendMessageInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: SendMessageInput) => {
      try {
        const result = await client.sendMessage(params.chat_id, params.text);
        const contactName = await client.getContactName(params.chat_id);
        const formattedTime = client.formatTimestamp(result.timestamp);

        return {
          content: [{
            type: "text",
            text: `Message sent successfully.\n\nTo: ${contactName} (${params.chat_id})\nTime: ${formattedTime}\nMessage ID: ${result.id}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error sending message: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
