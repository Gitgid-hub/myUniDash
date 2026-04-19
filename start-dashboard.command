#!/bin/zsh

set -e

PROJECT_DIR="/Users/gids/Documents/myUniDash"
URL="http://localhost:3000/dashboard"

cd "$PROJECT_DIR"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting School OS dashboard..."
echo "Open: ${URL}"
echo ""

open "$URL"
npm run dev
