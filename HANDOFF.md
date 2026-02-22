# Handoff / Current State (WhatsApp MCP Server)

Repo: `<repo-root>`

## Where We Left Off

### In `main` (as of HEAD)
- **Baileys 7.x required**: This project now requires `@whiskeysockets/baileys@^7.0.0-rc.9` or later. Older versions (6.x) fail to generate valid QR codes for new device linking.
- Packaging: `prepare`/`prepack` run `npm run build` and `files` whitelist includes `dist/` so installs/publish work even though `dist/` is gitignored.
- Auth relink flow:
  - Interactive (TTY): prompt to create a new link + backup/delete existing auth dir.
  - Non-interactive: `WHATSAPP_RELINK=backup|delete`.
- Auto-exit after successful QR pairing (TTY default): `WHATSAPP_EXIT_AFTER_PAIR` (auto/1/0).
- Local message store + tool:
  - `whatsapp_list_messages`
  - Optional persistence: `WHATSAPP_PERSIST_MESSAGES=1` (stores `message-store.json` near auth dir).
- Pairing device label UX:
  - When **not paired yet** (`creds.json` missing) and running in a **TTY**, the server prompts for a device label with a default.
  - The chosen label is passed via `WHATSAPP_DEVICE_NAME` to Baileys so WhatsApp shows something like: `<label> (Mac OS)` / `<label> (Ubuntu)`.
  - Non-interactive MCP runs never prompt (to avoid blocking stdio).
- Media support:
  - `whatsapp_send_file` (document/image/video/audio/voice note)
  - `whatsapp_get_media` (returns media directly as Base64 without local download) - new!
  - `whatsapp_download_media` (downloads attachments to local file)
  - `whatsapp_list_messages` shows media metadata and hints for media tools.
- Voice notes:
  - Inbound: detected as `audio` with `isVoiceNote=true`.
  - Outbound: send with `kind=voice` (sends as PTT/voice note).

Media support was merged via PR #4: https://github.com/ydmw74/whatsapp-mcp-server/pull/4

## Code Pointers (Media/Label)
- `src/index.ts`: prompts device label for initial pairing (TTY only).
- `src/services/whatsapp-client.ts`:
  - `WHATSAPP_DEVICE_NAME` support via Baileys `browser` config.
  - In-memory raw message cache used for media downloads.
  - `sendFile(...)`, `getMedia(...)` (returns media as Base64), and `downloadMedia(...)` implementations.
  - `loadRawMessageStore()` loads persisted messages for media downloads (new!).
  - **Note**: Baileys 7.x requires dynamic import (`await import("@whiskeysockets/baileys")`) due to ESM-only module format. Static imports will fail.
- `src/schemas/index.ts`: new Zod schemas for send/get/download media tools.
- `src/tools/send-file.ts`, `src/tools/get-media.ts`, `src/tools/download-media.ts`: MCP tool registrations.
- `src/tools/list-messages.ts`: prints media metadata + media tool hints.
- `README.md`, `.env.example`: documented new env vars/tools.

## PM2 Helper Script

For deployments with PM2, use the helper script to display QR codes cleanly:

```bash
# On the server
whatsapp-qr
```

This script is installed at `/usr/local/bin/whatsapp-qr` and extracts the QR code from PM2 logs without timestamp prefixes.

## Known Limitations / Notes
- **Baileys 7.x compatibility**: The code uses dynamic `await import()` for Baileys because version 7.x is ESM-only. Static imports will cause "Cannot find module" errors.
- `whatsapp_download_media` only works for messages observed since the server started (raw message cache is in-memory and bounded).
- No automatic audio transcoding: for `kind=voice` you should send a compatible file (typically OGG/Opus).
- MCP config (Codex) was adjusted to run via `node` (because `dist/index.js` is not necessarily executable):
  - `~/.codex/config.toml` uses `command="node"` and `args=["/absolute/path/to/whatsapp-mcp-server/dist/index.js"]`.

## How To Continue Next Time

1. Update local checkout:
```bash
cd <repo-root>
git checkout main
git pull
npm install
npm run build
```

2. Restart the MCP client process (Codex/Claude Desktop) so tool definitions refresh (if you just updated code).

## Quick Manual Tests

### Pairing label prompt (TTY)
Ensure auth is fresh (or use `WHATSAPP_RELINK=backup|delete`), then run:
```bash
node dist/index.js
```
It should prompt for `Device label (...)` before showing the QR code.

### QR code on PM2
```bash
whatsapp-qr
```

### Media end-to-end
- Send an image/document/voice note to the linked WhatsApp account while the server is running.
- Use `whatsapp_list_messages` and verify:
  - `Media:` line is present.
  - `Download:` hint is present.
- Call `whatsapp_download_media` using the shown `chat_id` + `message_id`.
- For outbound:
  - `whatsapp_send_file` with `kind=document|image|video|audio|voice`.
