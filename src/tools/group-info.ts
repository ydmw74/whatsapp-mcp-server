/**
 * WhatsApp group info tool.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WhatsAppClient } from "../services/whatsapp-client.js";
import { GetGroupInfoInputSchema, type GetGroupInfoInput } from "../schemas/index.js";

export function registerGroupInfoTool(server: McpServer, client: WhatsAppClient): void {
  server.registerTool(
    "whatsapp_get_group_info",
    {
      title: "Get WhatsApp Group Info",
      description: `Get detailed information about a WhatsApp group.

Returns the group subject, description, participants, and creation date.

Args:
  - group_id (string): WhatsApp group JID (e.g., '120363012345678901@g.us')
    Use whatsapp_list_chats to find group IDs.

Returns:
  - subject: Group name/subject
  - description: Group description text
  - participants: List of members with admin status
  - creation: Group creation timestamp`,
      inputSchema: GetGroupInfoInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: GetGroupInfoInput) => {
      try {
        const info = await client.getGroupInfo(params.group_id);

        const admins = info.participants.filter((p) => p.admin);
        const members = info.participants.filter((p) => !p.admin);

        const lines = [
          `# ${info.subject}`,
          "",
          info.description ? `> ${info.description}` : "_No description_",
          "",
          `**Participants:** ${info.participants.length}`,
          `**Created:** ${info.creation > 0 ? new Date(info.creation * 1000).toLocaleDateString("de-DE") : "_Unknown_"}`,
          "",
        ];

        if (admins.length > 0) {
          lines.push("**Admins:**");
          for (const admin of admins) {
            const phone = admin.id.split("@")[0];
            lines.push(`- +${phone}`);
          }
          lines.push("");
        }

        lines.push("**Members:**");
        for (const member of members.slice(0, 50)) {
          const phone = member.id.split("@")[0];
          lines.push(`- +${phone}`);
        }
        if (members.length > 50) {
          lines.push(`- ... and ${members.length - 50} more`);
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error getting group info: ${error instanceof Error ? error.message : String(error)}. Make sure the group_id ends with '@g.us'.`,
          }],
          isError: true,
        };
      }
    }
  );
}
