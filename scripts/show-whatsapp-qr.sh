#!/usr/bin/env sh
set -eu

APP_NAME="${1:-whatsapp-mcp}"
PM2_HOME_DIR="${PM2_HOME:-$HOME/.pm2}"
LOG_FILE="${PM2_HOME_DIR}/logs/${APP_NAME}-error-0.log"

if [ ! -f "$LOG_FILE" ]; then
  echo "Log file not found: $LOG_FILE" >&2
  echo "Tip: pass app name as first arg, e.g. $0 whatsapp-mcp" >&2
  exit 1
fi

if ! sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]+: //' "$LOG_FILE" \
  | awk '
      /=== WhatsApp QR Code ===/ { in_block=1; block=""; }
      in_block { block = block $0 ORS }
      /========================/ && in_block { last_block = block; in_block = 0 }
      END {
        if (last_block != "") {
          printf "%s", last_block
        } else {
          exit 1
        }
      }
    '; then
  echo "No complete QR block found in ${LOG_FILE}" >&2
  echo "Tip: run 'pm2 restart ${APP_NAME}' and try again." >&2
  exit 1
fi
