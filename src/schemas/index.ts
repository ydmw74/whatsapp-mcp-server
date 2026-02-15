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

export const ListMessagesInputSchema = z.object({
  chat_id: z.string()
    .min(1)
    .optional()
    .describe("Optional: WhatsApp chat ID (JID) to list messages from. If omitted, lists recent messages across all chats in the local store."),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of messages to return (1-100, default: 20)"),
}).strict();

export const DownloadMediaInputSchema = z.object({
  chat_id: z.string()
    .min(1)
    .describe("WhatsApp chat ID (JID). Use the Chat field from whatsapp_list_messages."),
  message_id: z.string()
    .min(1)
    .describe("Message ID within the chat. Use the ID field from whatsapp_list_messages."),
  output_dir: z.string()
    .min(1)
    .optional()
    .describe("Optional output directory for the downloaded file. Supports '~/' expansion. Default: <authDir>/../downloads"),
}).strict();

export const SendFileInputSchema = z.object({
  chat_id: z.string()
    .min(1)
    .describe("WhatsApp chat ID (JID) or phone number with country code (e.g., '4915123456789' or '4915123456789@s.whatsapp.net')"),
  path: z.string()
    .min(1)
    .describe("Local file path to send. Supports '~/' expansion. Relative paths are resolved against the current working directory."),
  kind: z.enum(["document", "image", "video", "audio", "voice"])
    .optional()
    .describe("What to send. Use 'voice' for WhatsApp voice notes (ptt). Default: document"),
  caption: z.string()
    .max(4096)
    .optional()
    .describe("Optional caption (for image/video/document)."),
  mimetype: z.string()
    .min(1)
    .optional()
    .describe("Optional MIME type override (e.g. 'application/pdf', 'image/png', 'audio/ogg; codecs=opus')."),
  fileName: z.string()
    .min(1)
    .optional()
    .describe("Optional file name override for documents."),
}).strict();

export type GetStatusInput = z.infer<typeof GetStatusInputSchema>;
export type ListChatsInput = z.infer<typeof ListChatsInputSchema>;
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;
export type GetGroupInfoInput = z.infer<typeof GetGroupInfoInputSchema>;
export type ListMessagesInput = z.infer<typeof ListMessagesInputSchema>;
export type DownloadMediaInput = z.infer<typeof DownloadMediaInputSchema>;
export type SendFileInput = z.infer<typeof SendFileInputSchema>;
