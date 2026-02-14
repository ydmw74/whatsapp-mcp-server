/**
 * Zod schemas for WhatsApp MCP Server tool inputs.
 */

import { z } from "zod";

export const GetStatusInputSchema = z.object({}).strict();

export const ListChatsInputSchema = z.object({
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of chats to return (1-100, default: 20)"),
}).strict();

export const SendMessageInputSchema = z.object({
  chat_id: z.string()
    .min(1)
    .describe("WhatsApp chat ID (JID) or phone number with country code (e.g., '4915123456789' or '4915123456789@s.whatsapp.net')"),
  text: z.string()
    .min(1)
    .max(4096)
    .describe("Message text to send (max 4096 characters)"),
}).strict();

export const GetGroupInfoInputSchema = z.object({
  group_id: z.string()
    .min(1)
    .describe("WhatsApp group JID (e.g., '120363012345678901@g.us')"),
}).strict();

export type GetStatusInput = z.infer<typeof GetStatusInputSchema>;
export type ListChatsInput = z.infer<typeof ListChatsInputSchema>;
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;
export type GetGroupInfoInput = z.infer<typeof GetGroupInfoInputSchema>;
