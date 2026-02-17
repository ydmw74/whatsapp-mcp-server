const os = require("node:os");
const path = require("node:path");

const authDir = path.join(os.homedir(), "whatsapp-mcp-data", "auth");

module.exports = {
  apps: [
    {
      name: "whatsapp-mcp",
      cwd: __dirname,
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      max_memory_restart: "512M",
      time: true,
      env: {
        NODE_ENV: "production",
        WHATSAPP_MCP_TRANSPORT: "http",
        WHATSAPP_HTTP_HOST: "0.0.0.0",
        WHATSAPP_HTTP_PORT: "8787",
        WHATSAPP_HTTP_PATH: "/mcp",
        WHATSAPP_AUTH_DIR: authDir,
        WHATSAPP_PERSIST_MESSAGES: "1",
        WHATSAPP_MAX_MESSAGES_PER_CHAT: "500",
        WHATSAPP_MAX_MESSAGES_TOTAL: "5000"
      }
    }
  ]
};
