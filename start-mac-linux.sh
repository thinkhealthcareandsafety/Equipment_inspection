#!/usr/bin/env bash
# Mac / Linux launcher: installs on first run, builds, starts, opens the browser.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Install Node.js LTS from https://nodejs.org first."; exit 1; }
[ -d node_modules ] || npm install || exit 1
[ -f client/dist/index.html ] || npm run build || exit 1
( sleep 20; (open http://localhost:4000 || xdg-open http://localhost:4000) >/dev/null 2>&1 ) &
npm start
