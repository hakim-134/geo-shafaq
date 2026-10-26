#!/usr/bin/env bash
# Builds the game and copies it to the server, run by hand (no CI here, the owner's call).
# The server's Caddy serves /srv/shafaq/web (api-geo-shafaq/docker-compose.yml).
#
#   DEPLOY_TARGET=deploy@<server> scripts/deploy.sh
#
# The public settings (PUBLIC_YANDEX_KEY, PUBLIC_GLITCHTIP_DSN, PUBLIC_API_URL) come from
# .env.local, as in every build.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DEPLOY_TARGET:?set DEPLOY_TARGET=user@server}"

npm run build
# new files first, then index.html, so no player gets a page whose files are gone; old files
# stay, for players still on the previous version
rsync -rlz --exclude index.html build/ "$DEPLOY_TARGET:/srv/shafaq/web/"
rsync -lz build/index.html "$DEPLOY_TARGET:/srv/shafaq/web/index.html"
echo "deployed"
