/**
 * WhatsApp send file tool.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WhatsAppClient } from "../services/whatsapp-client.js";
import { SendFileInputSchema, type SendFileInput } from "../schemas/index.js";

export function registerSendFileTool(server: McpServer, client: WhatsAppClient): void {
  server.registerTool(
    "whatsapp_send_file",
    {
      title: "Send WhatsApp File/Media",
      description: `Send a file/media message to a WhatsApp chat or phone number.

IMPORTANT: This tool sends a real message. The LLM client should confirm
with the user before calling this tool.

Args:
  - chat_id (string): WhatsApp chat JID or phone number with country code
  - path (string): Local file path (supports "~/" expansion)
  - kind (string, optional): document|image|video|audio|voice (voice sends a WhatsApp voice note / ptt)
  - caption (string, optional): Caption (image/video/document)
  - mimetype (string, optional): MIME type override
  - fileName (string, optional): File name override (document only)

Returns:
  - id: Message ID of the sent message
  - timestamp: Unix timestamp when the message was sent`,
      inputSchema: SendFileInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: SendFileInput) => {
      try {
        const result = await client.sendFile(params.chat_id, params.path, {
          kind: params.kind,
          caption: params.caption,
          mimetype: params.mimetype,
          fileName: params.fileName,
        });

        const contactName = await client.getContactName(params.chat_id);
        const formattedTime = client.formatTimestamp(result.timestamp);
        const kind = params.kind || "document";

        return {
          content: [{
            type: "text",
            text: `File sent successfully.\n\nTo: ${contactName} (${params.chat_id})\nKind: ${kind}\nTime: ${formattedTime}\nMessage ID: ${result.id}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error sending file: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}

