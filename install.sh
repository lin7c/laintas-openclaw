#!/usr/bin/env bash
# Laintas for OpenClaw — one-command install (macOS / Linux).
#
# 1. If OpenClaw is not installed, installs it (pinned version via npm when
#    a supported Node.js is present, otherwise OpenClaw's own installer).
# 2. Installs the Laintas provider plugin from its public repository.
#
# Safe to re-run.
set -euo pipefail

OPENCLAW_VERSION="2026.11.2"
PLUGIN_SPEC="git:github.com/lin7c/openclaw-laintas"

if command -v openclaw >/dev/null 2>&1; then
  echo "OpenClaw found: $(openclaw --version 2>/dev/null || echo present)"
else
  NODE_MAJOR=""
  if command -v node >/dev/null 2>&1; then
    NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo '')"
  fi
  if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -ge 24 ] && command -v npm >/dev/null 2>&1; then
    echo "Installing OpenClaw $OPENCLAW_VERSION via npm..."
    npm install -g "openclaw@$OPENCLAW_VERSION"
  else
    echo "Installing OpenClaw via its official installer..."
    curl -fsSL https://openclaw.ai/install.sh | bash
  fi
  echo "OpenClaw installed: $(openclaw --version)"
fi

echo "Installing the Laintas plugin..."
openclaw plugins install --force --accept-capabilities "$PLUGIN_SPEC"

cat <<'EOF'

Done. Now sign in and pick a model:

  openclaw models auth login --provider laintas
  openclaw models set laintas/gpt-6-luna

Your Laintas account balance is what gets billed — there is no API key.
EOF
