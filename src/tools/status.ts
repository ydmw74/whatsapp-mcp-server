/**
 * WhatsApp connection status tool.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WhatsAppClient } from "../services/whatsapp-client.js";
import { GetStatusInputSchema } from "../schemas/index.js";

export function registerStatusTool(server: McpServer, client: WhatsAppClient): void {
  server.registerTool(
    "whatsapp_get_status",
    {
      title: "Get WhatsApp Connection Status",
      description: `Check the current WhatsApp connection status.

Returns whether the client is connected, the linked phone number,
or a QR code that needs to be scanned if not yet authenticated.

Use this tool first to verify WhatsApp is connected before using other tools.

Returns:
  - connected (boolean): Whether WhatsApp is currently connected
  - phoneNumber (string): The connected phone number (if connected)
  - qrCode (string): QR code data to scan (if waiting for authentication)
  - error (string): Error message (if connection failed)`,
      inputSchema: GetStatusInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const status = client.status;

      let text: string;
      if (status.connected) {
        text = `WhatsApp is connected.
Phone: +${status.phoneNumber}`;
      } else if (status.qrCode) {
        text = `WhatsApp is waiting for QR code scan.

Please scan the QR code displayed in the terminal with your phone:
WhatsApp > Settings > Linked Devices > Link a Device

QR data: ${status.qrCode}`;
      } else if (status.error) {
        text = `WhatsApp connection error: ${status.error}`;
      } else {
        text = "WhatsApp is connecting... Please wait a moment and check again.";
      }

      return {
        content: [{ type: "text", text }],
      };
    }
  );
}
