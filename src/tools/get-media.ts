/**
 * WhatsApp media get tool.
 *
 * Returns media (attachments) directly as Base64 without local download.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WhatsAppClient } from "../services/whatsapp-client.js";
import { GetMediaInputSchema, type GetMediaInput } from "../schemas/index.js";

export function registerGetMediaTool(server: McpServer, client: WhatsAppClient): void {
  server.registerTool(
    "whatsapp_get_media",
    {
      title: "Get WhatsApp Media",
      description: `Get media (attachments) directly from the server as Base64 without saving to disk.

Important:
  - The server can only return media for messages it has observed since it started.
  - Use whatsapp_list_messages to get message_id + chat_id.

Args:
  - chat_id (string): Chat JID (from whatsapp_list_messages)
  - message_id (string): Message ID (from whatsapp_list_messages)
  - format (string, optional): Return format - "base64" (default) or "data_url". Base64 for direct use, Data URL for display.

Returns:
  - base64: Base64 encoded media (for "base64" format) or image data URL (for "data_url" format)
  - media: Metadata (kind, mimetype, etc.)`,
      inputSchema: GetMediaInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: GetMediaInput) => {
      try {
        const result = await client.getMedia(params.chat_id, params.message_id, params.format);
        
      if (params.format === "data_url") {
        return {
          content: [{
            type: "image",
            data: result.base64,
            mimeType: result.media.mimetype || "application/octet-stream",
          }],
        };
      }
        
        return {
          content: [{
            type: "text",
            text: `Media retrieved successfully.\n\nBase64: ${result.base64.substring(0, 100)}...\n\nKind: ${result.media.kind}${result.media.isVoiceNote ? " (voice-note)" : ""}\nMIME: ${result.media.mimetype || "unknown"}\nFile: ${result.media.fileName || "unknown"}\nBytes: ${result.media.fileLength ?? "unknown"}\nSeconds: ${result.media.seconds ?? "unknown"}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting media: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
