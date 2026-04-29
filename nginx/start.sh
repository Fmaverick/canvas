#!/bin/sh
set -eu

HTTP_CONF="/etc/nginx/templates/http.conf"
HTTPS_CONF="/etc/nginx/templates/https.conf"
ACTIVE_CONF="/etc/nginx/conf.d/default.conf"
CERT_FILE="/etc/letsencrypt/live/canvas.onebeatai.com/fullchain.pem"

render_config() {
  if [ -f "$CERT_FILE" ]; then
    cp "$HTTPS_CONF" "$ACTIVE_CONF"
  else
    cp "$HTTP_CONF" "$ACTIVE_CONF"
  fi
}

render_config

(
  while :; do
    sleep 60
    render_config
    nginx -s reload >/dev/null 2>&1 || true
  done
) &

exec nginx -g 'daemon off;'
