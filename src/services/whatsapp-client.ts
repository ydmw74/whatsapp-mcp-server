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
import * as os from "os";
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
  private chatStore: Map<string, { id: string; name: string; isGroup: boolean; conversationTimestamp?: number }> = new Map();
  private saveChatStoreTimer: NodeJS.Timeout | null = null;
  private saveChatStoreInFlight: Promise<void> = Promise.resolve();
  private reconnectCount440 = 0;
  private socketGeneration = 0;
  private groupMetadataInFlight: Set<string> = new Set();

  constructor(authDir?: string) {
    const resolvedAuthDir = authDir?.startsWith("~/")
      ? path.join(os.homedir(), authDir.slice(2))
      : authDir;
    // Prefer explicit argument; then env var; then user's home dir. Avoid "~" which Node won't expand.
    const baseDir = process.env.WHATSAPP_AUTH_DIR || path.join(os.homedir(), ".whatsapp-mcp");
    this.authDir = resolvedAuthDir || path.join(baseDir, "auth");
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

  private get chatStoreFile(): string {
    return path.join(this.authDir, '..', 'chat-store.json');
  }

  private loadChatStore(): void {
    try {
      const file = this.chatStoreFile;
      if (fs.existsSync(file)) {
        const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        for (const entry of data) {
          this.chatStore.set(entry.id, entry);
        }
        console.error('Loaded ' + this.chatStore.size + ' chats from persistent store');
      }
    } catch (e) {
      console.error('Failed to load chat store: ' + e);
    }
  }

  private scheduleSaveChatStore(): void {
    if (this.saveChatStoreTimer) return;
    this.saveChatStoreTimer = setTimeout(() => {
      this.saveChatStoreTimer = null;
      void this.saveChatStoreAsync();
    }, 250);
  }

  private saveChatStoreAsync(): Promise<void> {
    const file = this.chatStoreFile;
    const data = Array.from(this.chatStore.values());
    const payload = JSON.stringify(data, null, 2);

    // Serialize writes to avoid partial overwrites if multiple writes race.
    this.saveChatStoreInFlight = this.saveChatStoreInFlight
      .catch(() => {
        // Keep the chain alive even if a previous write failed.
      })
      .then(async () => {
        try {
          await fs.promises.mkdir(path.dirname(file), { recursive: true });
          const tmp = file + ".tmp";
          await fs.promises.writeFile(tmp, payload, "utf-8");
          await fs.promises.rename(tmp, file);
        } catch (e) {
          console.error("Failed to save chat store: " + e);
        }
      });

    return this.saveChatStoreInFlight;
  }

  async connect(): Promise<void> {
    try {
      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      // Load persisted chat store on first connect
      if (this.chatStore.size === 0) {
        this.loadChatStore();
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
      let version: any | undefined;
      try {
        ({ version } = await fetchLatestBaileysVersion());
      } catch (e) {
        console.error("Failed to fetch latest Baileys version, continuing with defaults: " + e);
      }

      // Create a logger that writes to stderr (stdout is for MCP JSON-RPC)
      const logger = pino(
        { level: "warn" },
        pino.destination({ dest: 2, sync: true })
      );

      // Each connect() gets a unique generation ID
      const generation = ++this.socketGeneration;

      this.socket = makeWASocket({
        ...(version ? { version } : {}),
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
        if (!this.qrDisplayed) {
          try {
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

        // Only the current generation should reconnect
        if (generation !== this.socketGeneration) {
          console.error('Stale socket (gen ' + generation + ' vs ' + this.socketGeneration + '), ignoring disconnect');
          return;
        }

        if (shouldReconnect) {
          // Limit reconnect attempts for code 440 (conflict:replaced)
          if (statusCode === 440) {
            this.reconnectCount440++;
            if (this.reconnectCount440 > 2) {
              console.error("Too many conflict:replaced reconnects (" + this.reconnectCount440 + "), stopping. Will reconnect on next API call.");
              this.notifyConnection({
                connected: false,
                error: "Connection conflict. Restart to reconnect.",
              });
              return;
            }
          }
          const delay = statusCode === 440 ? 5000 : 2000;
          console.error("Connection closed (code: " + statusCode + "), reconnecting in " + delay + "ms...");
          this.qrDisplayed = false;
          setTimeout(() => {
            if (generation === this.socketGeneration) {
              void this.connect().catch((e) => {
                console.error("Reconnect failed:", e);
              });
            }
          }, delay);
        } else {
          this.notifyConnection({
            connected: false,
            error: "Logged out from WhatsApp. Delete auth directory and re-scan QR code.",
          });
        }
      } else if (connection === "open") {
        this.qrDisplayed = false;
        // Only reset reconnect counter after 30s of stable connection
        setTimeout(() => {
          if (this.isConnected && generation === this.socketGeneration) {
            this.reconnectCount440 = 0;
          }
        }, 30000);
        const phoneNumber = this.socket?.user?.id?.split(":")[0] || "unknown";
        this.notifyConnection({
          connected: true,
          phoneNumber,
        });
        console.error("WhatsApp connected as +" + phoneNumber);
      }
      });

    // Listen for incoming messages to discover individual chats
      this.socket.ev.on("messages.upsert", ({ messages }) => {
      let changed = false;
      for (const msg of messages) {
        const jid = msg.key.remoteJid;
        if (!jid || jid === "status@broadcast") continue;
        const isGroup = jid.endsWith("@g.us");
        if (!this.chatStore.has(jid)) {
          // For groups, avoid using "participant" as the chat name (that's a sender JID).
          const name = isGroup ? jid.split("@")[0] : (msg.pushName || jid.split("@")[0]);
          this.chatStore.set(jid, { id: jid, name, isGroup, conversationTimestamp: 0 });
          changed = true;
        }
        const entry = this.chatStore.get(jid)!;
        entry.conversationTimestamp = Math.floor(Date.now() / 1000);
        if (!isGroup && msg.pushName && entry.name === jid.split("@")[0]) {
          entry.name = msg.pushName;
          changed = true;
        }
        this.chatStore.set(jid, entry);

        // Opportunistically enrich group names from metadata (best-effort, non-blocking).
        if (isGroup) {
          this.maybeUpdateGroupSubject(jid);
        }
      }
      if (changed) {
        this.scheduleSaveChatStore();
      }
      });

    // Listen for contacts to get names for individual chats
      this.socket.ev.on("contacts.upsert", (contacts) => {
      let changed = false;
      for (const contact of contacts) {
        if (!contact.id) continue;
        const id = contact.id;
        if (id.endsWith("@g.us") || id.endsWith("@broadcast")) continue;
        const name = (contact as any).notify || (contact as any).name || (contact as any).verifiedName || id.split("@")[0];
        const existing = this.chatStore.get(id);
        if (existing) {
          existing.name = name;
          this.chatStore.set(id, existing);
        } else {
          this.chatStore.set(id, { id, name, isGroup: false, conversationTimestamp: 0 });
        }
        changed = true;
      }
      if (changed) {
        console.error("Contacts updated, chat store now has " + this.chatStore.size + " entries");
        this.scheduleSaveChatStore();
      }
      });
    } catch (e) {
      this.notifyConnection({
        connected: false,
        error: e instanceof Error ? e.message : String(e),
      });
      throw e;
    }
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

    if (this.chatStore.size > 0) {
      const allChats = Array.from(this.chatStore.values())
        .sort((a, b) => (b.conversationTimestamp || 0) - (a.conversationTimestamp || 0))
        .slice(0, limit);

      console.error("Returning " + allChats.length + " chats from store");
      return allChats.map((chat) => ({
        id: chat.id,
        name: chat.name || chat.id.split("@")[0],
        isGroup: chat.isGroup,
        unreadCount: 0,
      }));
    }

    console.error("Chat store empty, fallback to groupFetchAllParticipating (10s timeout)...");
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 10000)
      );
      const conversations = await Promise.race([
        sock.groupFetchAllParticipating(),
        timeoutPromise,
      ]);

      const chats: WhatsAppChat[] = [];
      for (const [id, group] of Object.entries(conversations)) {
        if (chats.length >= limit) break;
        const chat = { id, name: (group as any).subject || id.split("@")[0], isGroup: true, unreadCount: 0 };
        chats.push(chat);
        this.chatStore.set(id, { id, name: chat.name, isGroup: true, conversationTimestamp: 0 });
      }

      console.error("Fallback returned " + chats.length + " group chats");
      this.scheduleSaveChatStore();
      return chats;
    } catch (e) {
      console.error("Fallback failed: " + e);
      return [];
    }
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
      timestamp: this.toUnixSeconds((result as any)?.messageTimestamp),
    };
  }

  async getContactName(jid: string): Promise<string> {
    if (!this.socket) return jid;
    const normalized = this.normalizeJid(jid);
    // For groups, prefer the stored chat name if we have it.
    const fromStore = this.chatStore.get(normalized)?.name || this.chatStore.get(jid)?.name;
    if (fromStore) return fromStore;
    try {
      const contact = (this.socket as any).contacts?.[normalized];
      if (contact?.name) return contact.name;
      if (contact?.notify) return contact.notify;
      if (contact?.verifiedName) return contact.verifiedName;
    } catch {
      // Fall through
    }
    const phone = normalized.split("@")[0].split(":")[0];
    return "+" + phone;
  }

  async searchMessages(
    query: string,
    chatId?: string,
    limit: number = 20
  ): Promise<WhatsAppMessage[]> {
    throw new Error(
      "Message search requires a message store implementation. " +
      "This server currently only supports listing chats and sending messages."
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
    let jid = input.replace(/^whatsapp:/gi, "");
    if (jid.includes("@")) return jid;
    const cleaned = jid.replace(/[^0-9]/g, "");
    if (cleaned.length > 0) {
      return cleaned + "@s.whatsapp.net";
    }
    return jid;
  }

  private toUnixSeconds(value: unknown): number {
    // Baileys / proto timestamps can be number-like or Long-like objects.
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "bigint") return Number(value);
    if (value && typeof value === "object") {
      const v = value as any;
      if (typeof v.toNumber === "function") {
        const n = v.toNumber();
        if (typeof n === "number" && Number.isFinite(n)) return n;
      }
      if (typeof v.toString === "function") {
        const n = Number(v.toString());
        if (Number.isFinite(n)) return n;
      }
    }
    return Math.floor(Date.now() / 1000);
  }

  private maybeUpdateGroupSubject(groupJid: string): void {
    if (!this.socket) return;
    if (this.groupMetadataInFlight.has(groupJid)) return;
    const existing = this.chatStore.get(groupJid);
    // If the name is already something other than the placeholder (the group id prefix), keep it.
    const placeholder = groupJid.split("@")[0];
    if (existing?.name && existing.name !== placeholder) return;

    this.groupMetadataInFlight.add(groupJid);
    const sock = this.socket;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 2000)
    );

    Promise.race([sock.groupMetadata(groupJid), timeout])
      .then((metadata: any) => {
        const subject = metadata?.subject;
        if (!subject) return;
        const current = this.chatStore.get(groupJid);
        if (!current) return;
        if (current.name !== subject) {
          current.name = subject;
          this.chatStore.set(groupJid, current);
          this.scheduleSaveChatStore();
        }
      })
      .catch(() => {
        // Best-effort only.
      })
      .finally(() => {
        this.groupMetadataInFlight.delete(groupJid);
      });
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
