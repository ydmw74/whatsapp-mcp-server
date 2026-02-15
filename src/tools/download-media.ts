/**
 * WhatsApp media download tool.
 *
 * Downloads attachments (including voice notes) for messages observed by this server.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WhatsAppClient } from "../services/whatsapp-client.js";
import { DownloadMediaInputSchema, type DownloadMediaInput } from "../schemas/index.js";

export function registerDownloadMediaTool(server: McpServer, client: WhatsAppClient): void {
  server.registerTool(
    "whatsapp_download_media",
    {
      title: "Download WhatsApp Media",
      description: `Download media (attachments) for a message from the server's in-memory raw message store.

Important:
  - The server can only download media for messages it has observed since it started.
  - Use whatsapp_list_messages to get message_id + chat_id.

Args:
  - chat_id (string): Chat JID (from whatsapp_list_messages)
  - message_id (string): Message ID (from whatsapp_list_messages)
  - output_dir (string, optional): Directory to write the file to (supports "~/" expansion)

Returns:
  - path: Absolute path to the downloaded file
  - media: Metadata (kind, mimetype, etc.)`,
      inputSchema: DownloadMediaInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (params: DownloadMediaInput) => {
      try {
        const result = await client.downloadMedia(params.chat_id, params.message_id, params.output_dir);
        return {
          content: [{
            type: "text",
            text: `Downloaded media successfully.\n\nPath: ${result.path}\nKind: ${result.media.kind}${result.media.isVoiceNote ? " (voice-note)" : ""}\nMIME: ${result.media.mimetype || "unknown"}\nFile: ${result.media.fileName || "unknown"}\nBytes: ${result.media.fileLength ?? "unknown"}\nSeconds: ${result.media.seconds ?? "unknown"}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error downloading media: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}

