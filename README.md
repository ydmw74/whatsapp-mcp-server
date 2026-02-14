# WhatsApp MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that connects Claude and other LLM clients to WhatsApp. Built on top of the [Baileys](https://github.com/WhiskeySockets/Baileys) library, which implements the WhatsApp Web protocol natively — no browser automation required.

## Features

- **** — Check connection status (connected, waiting for QR, error)
- **** — List available chats and groups with metadata
- **** — Send text messages to contacts or groups
- **** — Get group details, participants, and admin info

## Prerequisites

- **Node.js** >= 18
- **A WhatsApp account** linked to a phone
- **An MCP-compatible client** (Claude Desktop, Claude Code, etc.)

## Quick Start

### 1. Clone and Build



### 2. First Run — QR Code Authentication

Run the server once manually to complete the QR code pairing:



A QR code will appear in your terminal. Scan it with your phone:

**WhatsApp > Settings > Linked Devices > Link a Device**

After successful pairing, the session is persisted in . You won't need to scan again unless you unlink the device.

### 3. Configure Your MCP Client

#### Claude Desktop

Add to your :



#### Claude Code



## Configuration

| Environment Variable | Default | Description |
|---|---|---|
|  |  | Directory for session persistence |

## Tools Reference

### 

Check if WhatsApp is connected and ready.

**Parameters:** None

**Returns:** Connection status, phone number, or QR code if authentication is pending.

### 

List available WhatsApp chats.

**Parameters:**
-  (number, 1-100, default: 20) — Maximum chats to return

**Returns:** List of chats with ID, name, type (group/DM), and unread count.

### 

Send a text message.

**Parameters:**
-  (string) — Phone number with country code (e.g., ) or full JID
-  (string) — Message text (max 4096 chars)

**Returns:** Message ID and timestamp.

### 

Get detailed group information.

**Parameters:**
-  (string) — Group JID (e.g., )

**Returns:** Group subject, description, participant list with admin status.

## Architecture



The server uses **stdio transport** for local MCP communication and **Baileys** for the WhatsApp Web protocol. Session state is persisted to disk so re-authentication is only needed once.

## Security Considerations

- **Session data** is stored locally in . Protect this directory — anyone with access can impersonate your WhatsApp account.
- **No messages are logged** by the MCP server. Messages flow directly between Baileys and your LLM client.
- The LLM client should **always confirm with the user** before sending messages via .
- This project uses the unofficial WhatsApp Web protocol. WhatsApp may block accounts that violate their Terms of Service. Use responsibly.

## Limitations

- **No message history**: Baileys doesn't persist incoming messages by default. The server can list chats and send messages, but browsing message history requires additional store implementation.
- **No media support** (yet): Only text messages are supported currently.
- **Single session**: Only one WhatsApp account can be linked at a time.

## Development



## Acknowledgements

- [Baileys](https://github.com/WhiskeySockets/Baileys) — WhatsApp Web API library
- [OpenClaw](https://github.com/openclaw/openclaw) — Inspiration for the WhatsApp integration architecture
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) — Model Context Protocol SDK

## License

MIT
