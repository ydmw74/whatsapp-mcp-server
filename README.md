# WhatsApp MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that connects Claude and other LLM clients to WhatsApp. Built on top of the [Baileys](https://github.com/WhiskeySockets/Baileys) library, which implements the WhatsApp Web protocol natively — no browser automation required.

## Features

- **`whatsapp_get_status`** — Check connection status (connected, waiting for QR, error)
- **`whatsapp_list_chats`** — List available chats and groups with metadata
- **`whatsapp_list_messages`** — List recent messages from the server's local store (observed while running; optional persistence)
- **`whatsapp_send_message`** — Send text messages to contacts or groups
- **`whatsapp_get_group_info`** — Get group details, participants, and admin info

## Prerequisites

- **Node.js** >= 18
- **A WhatsApp account** linked to a phone
- **An MCP-compatible client** (Claude Desktop, Claude Code, etc.)

> **Compatibility:** Works with both **regular WhatsApp** and **WhatsApp Business** accounts. Baileys implements the WhatsApp Web Multi-Device protocol, which is identical for both account types. Business-specific features (catalogs, auto-replies, labels) are not supported by this server.


## Quick Start

### 1. Clone and Build

```bash
git clone https://github.com/ydmw74/whatsapp-mcp-server.git
cd whatsapp-mcp-server
npm install
npm run build
```

### 2. First Run — QR Code Authentication

Run the server once manually to complete the QR code pairing:

```bash
node dist/index.js
```

A QR code will appear in your terminal. Scan it with your phone:

**WhatsApp > Settings > Linked Devices > Link a Device**

After successful pairing, the session is persisted in `~/.whatsapp-mcp/auth`. You won't need to scan again unless you unlink the device.

### 3. Configure Your MCP Client

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "whatsapp": {
      "command": "node",
      "args": ["/absolute/path/to/whatsapp-mcp-server/dist/index.js"]
    }
  }
}
```

#### Claude Code

```bash
claude mcp add whatsapp node /absolute/path/to/whatsapp-mcp-server/dist/index.js
```

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `WHATSAPP_AUTH_DIR` | `~/.whatsapp-mcp/auth` | Directory for session persistence |
| `WHATSAPP_RELINK` | *(unset)* | Force re-linking in non-interactive environments. Use `backup` (or `1`/`true`) to move the existing auth dir aside, or `delete` to remove it. |
| `WHATSAPP_EXIT_AFTER_PAIR` | `auto` | If a QR code was shown in this run, exit automatically after successful pairing. Defaults to enabled only for interactive terminal runs (TTY). |
| `WHATSAPP_PERSIST_MESSAGES` | `false` | Persist the local message store to disk (`message-store.json`). |
| `WHATSAPP_MAX_MESSAGES_PER_CHAT` | `200` | Retention limit per chat for the local message store. |
| `WHATSAPP_MAX_MESSAGES_TOTAL` | `2000` | Global retention limit for the local message store. |

## Tools Reference

### `whatsapp_get_status`

Check if WhatsApp is connected and ready.

**Parameters:** None

**Returns:** Connection status, phone number, or QR code if authentication is pending.

### `whatsapp_list_chats`

List available WhatsApp chats.

**Parameters:**
- `limit` (number, 1-100, default: 20) — Maximum chats to return

**Returns:** List of chats with ID, name, type (group/DM), and unread count.

### `whatsapp_list_messages`

List recent messages from the server's local message store.

**Parameters:**
- `chat_id` (string, optional) — Chat JID (DM or group). If omitted, returns recent messages across all chats.
- `limit` (number, 1-100, default: 20) — Maximum number of messages to return

**Returns:** A formatted list of messages with timestamp, sender, and text.

### `whatsapp_send_message`

Send a text message.

**Parameters:**
- `chat_id` (string) — Phone number with country code (e.g., `4915123456789`) or full JID
- `text` (string) — Message text (max 4096 chars)

**Returns:** Message ID and timestamp.

### `whatsapp_get_group_info`

Get detailed group information.

**Parameters:**
- `group_id` (string) — Group JID (e.g., `120363012345678901@g.us`)

**Returns:** Group subject, description, participant list with admin status.

## How It Works

You do **not** start the server manually. Your MCP client (Claude Desktop, Claude Code, etc.) launches and manages the server process automatically in the background.

When you open a chat in Claude Desktop, it spawns `node dist/index.js` as a child process and communicates with it over **stdio** (stdin/stdout). When you close the chat, the process is stopped. You don't need to manage it yourself.

The **only manual step** is the one-time QR code authentication (see Quick Start, Step 2). After that, the session is persisted to disk and the server reconnects automatically on every subsequent start.

## Architecture

```
┌──────────────────┐     stdio      ┌──────────────────┐
│  Claude / LLM    │ ◄──────────── │  MCP Server      │
│  Client          │ ──────────── │  (this project)  │
└──────────────────┘               └────────┬─────────┘
                                            │
                                   Baileys Protocol
                                            │
                                   ┌────────▼─────────┐
                                   │  WhatsApp Web    │
                                   │  Servers         │
                                   └──────────────────┘
```

The server uses **stdio transport** for local MCP communication and **Baileys** for the WhatsApp Web protocol. Session state is persisted to disk so re-authentication is only needed once.

## Security Considerations

- **Session data** is stored locally in `~/.whatsapp-mcp/auth`. Protect this directory — anyone with access can impersonate your WhatsApp account.
- **Messages can be stored locally** in memory for `whatsapp_list_messages` (and optionally persisted to `message-store.json`). Treat stored message data as sensitive.
- The LLM client should **always confirm with the user** before sending messages via `whatsapp_send_message`.
- This project uses the unofficial WhatsApp Web protocol. WhatsApp may block accounts that violate their Terms of Service. Use responsibly.

## Limitations

- **Limited message history**: The server lists recent messages that it observed while running (and optionally persisted). It does not fetch arbitrary chat history from WhatsApp.
- **No media support** (yet): Only text messages are supported currently.
- **Single session**: Only one WhatsApp account can be linked at a time.

## Development

```bash
# Install dependencies
npm install

# Run in development mode (auto-reload)
npm run dev

# Build
npm run build

# Clean build artifacts
npm run clean
```

## Acknowledgements

- [Baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web API library
- [OpenClaw](https://github.com/openclaw/openclaw) — Inspiration for the WhatsApp integration architecture
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — Model Context Protocol SDK

## License

MIT
