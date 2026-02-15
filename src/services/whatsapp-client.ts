/**
 * WhatsApp client service using Baileys.
 * Manages connection, authentication, and message operations.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  WAMessage,
  Contact,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidGroup,
  isJidUser,
  jidNormalizedUser,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import * as path from "path";
import * as fs from "fs";
import pino from "pino";

export interface WhatsAppMessage {
  id: string;
  chatId: string;
  chatName: string;
  sender: string;
  senderName: string;
  timestamp: number;
  text: string;
  isFromMe: boolean;
  isGroup: boolean;
  type: string;
}

export interface WhatsAppChat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: string;
  lastMessageTime?: number;
}

export interface ConnectionStatus {
  connected: boolean;
  qrCode?: string;
  phoneNumber?: string;
  error?: string;
}

type ConnectionCallback = (status: ConnectionStatus) => void;

export class WhatsAppClient {
  private socket: WASocket | null = null;
  private authDir: string;
  private connectionCallbacks: ConnectionCallback[] = [];
  private _status: ConnectionStatus = { connected: false };
  private qrDisplayed = false;

  constructor(authDir?: string) {
    this.authDir = authDir || path.join(
      process.env.WHATSAPP_AUTH_DIR || path.join(process.env.HOME || "~", ".whatsapp-mcp"),
      "auth"
    );
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get isConnected(): boolean {
    return this._status.connected && this.socket !== null;
  }

  onConnection(callback: ConnectionCallback): void {
    this.connectionCallbacks.push(callback);
  }

  private notifyConnection(status: ConnectionStatus): void {
    this._status = status;
    for (const cb of this.connectionCallbacks) {
      cb(status);
    }
  }

  async connect(): Promise<void> {
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

    // Create a logger that writes to stderr to avoid polluting stdout
    // (stdout is reserved for the MCP JSON-RPC stdio transport)
    const logger = pino(
      { level: "warn" },
      pino.destination({ dest: 2, sync: true })
    );

    this.socket = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger as any),
      },
      logger: logger as any,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
    });

    this.socket.ev.on("creds.update", saveCreds);

    this.socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.notifyConnection({
          connected: false,
          qrCode: qr,
        });
        // Also display QR in terminal for stdio usage
        if (!this.qrDisplayed) {
          try {
            // Dynamic import for qrcode-terminal
            import("qrcode-terminal").then((qrTerminal) => {
              qrTerminal.default.generate(qr, { small: true }, (code: string) => {
                console.error("\n=== WhatsApp QR Code ===");
                console.error("Scan this QR code with your phone:");
                console.error("WhatsApp > Settings > Linked Devices > Link a Device\n");
                console.error(code);
                console.error("========================\n");
              });
            });
          } catch {
            console.error("QR Code (paste into QR reader):", qr);
          }
          this.qrDisplayed = true;
        }
      }

      if (connection === "close") {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          console.error("Connection closed, reconnecting...");
          this.qrDisplayed = false;
          this.connect();
        } else {
          this.notifyConnection({
            connected: false,
            error: "Logged out from WhatsApp. Delete auth directory and re-scan QR code.",
          });
        }
      } else if (connection === "open") {
        this.qrDisplayed = false;
        const phoneNumber = this.socket?.user?.id?.split(":")[0] || "unknown";
        this.notifyConnection({
          connected: true,
          phoneNumber,
        });
        console.error(`WhatsApp connected as +${phoneNumber}`);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      await this.socket.logout();
      this.socket = null;
      this.notifyConnection({ connected: false });
    }
  }

  private ensureConnected(): WASocket {
    if (!this.socket || !this.isConnected) {
      throw new Error(
        "WhatsApp is not connected. Please wait for QR code scan and connection to complete."
      );
    }
    return this.socket;
  }

  async getChats(limit: number = 20): Promise<WhatsAppChat[]> {
    const sock = this.ensureConnected();
    const chats: WhatsAppChat[] = [];

    // Get all chats from the store
    const conversations = await sock.groupFetchAllParticipating();

    // Get individual chats from contact list
    const store = sock as any;

    // Return available group chats
    for (const [id, group] of Object.entries(conversations)) {
      if (chats.length >= limit) break;
      chats.push({
        id,
        name: (group as any).subject || id,
        isGroup: true,
        unreadCount: 0,
      });
    }

    return chats;
  }

  async sendMessage(
    chatId: string,
    text: string
  ): Promise<{ id: string; timestamp: number }> {
    const sock = this.ensureConnected();
    const normalizedId = this.normalizeJid(chatId);

    const result = await sock.sendMessage(normalizedId, { text });

    return {
      id: result?.key?.id || "unknown",
      timestamp: result?.messageTimestamp as number || Math.floor(Date.now() / 1000),
    };
  }

  async getContactName(jid: string): Promise<string> {
    if (!this.socket) return jid;

    try {
      // Try to get contact info
      const contact = (this.socket as any).contacts?.[jid];
      if (contact?.name) return contact.name;
      if (contact?.notify) return contact.notify;
      if (contact?.verifiedName) return contact.verifiedName;
    } catch {
      // Fall through
    }

    // Extract phone number from JID
    const phone = jid.split("@")[0].split(":")[0];
    return `+${phone}`;
  }

  async searchMessages(
    query: string,
    chatId?: string,
    limit: number = 20
  ): Promise<WhatsAppMessage[]> {
    // Note: Baileys doesn't have a native search API.
    // This is a placeholder that would require message store implementation.
    throw new Error(
      "Message search requires a message store implementation. " +
      "Consider using whatsapp_list_messages to browse recent messages instead."
    );
  }

  async getGroupInfo(groupId: string): Promise<{
    id: string;
    subject: string;
    description: string;
    participants: Array<{ id: string; admin: boolean }>;
    creation: number;
  }> {
    const sock = this.ensureConnected();
    const normalizedId = this.normalizeJid(groupId);

    const metadata = await sock.groupMetadata(normalizedId);

    return {
      id: metadata.id,
      subject: metadata.subject,
      description: metadata.desc || "",
      participants: metadata.participants.map((p) => ({
        id: p.id,
        admin: p.admin === "admin" || p.admin === "superadmin",
      })),
      creation: metadata.creation || 0,
    };
  }

  private normalizeJid(input: string): string {
    // Remove whatsapp: prefix if present
    let jid = input.replace(/^whatsapp:/gi, "");

    // If it's already a full JID, return it
    if (jid.includes("@")) return jid;

    // If it looks like a phone number, make it a user JID
    const cleaned = jid.replace(/[^0-9]/g, "");
    if (cleaned.length > 0) {
      return `${cleaned}@s.whatsapp.net`;
    }

    return jid;
  }

  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}
