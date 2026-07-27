#!/usr/bin/env bash
#
# install-git-hooks.sh — zet de gecommitte hooks in .git/hooks.
#
# Hooks staan niet in git en overleven een verse clone niet. Draai dit één keer per
# clone (worktrees delen .git/hooks, dus één keer is genoeg voor alle sessies).
#
#   bash scripts/install-git-hooks.sh

set -euo pipefail
ROOT="$(git rev-parse --show-toplevel)"
DEST="$(git rev-parse --git-common-dir)/hooks"
SRC="$ROOT/scripts/hooks"

mkdir -p "$DEST"
for hook in "$SRC"/*; do
  name="$(basename "$hook")"
  cp "$hook" "$DEST/$name"
  chmod +x "$DEST/$name"
  echo "✓ geïnstalleerd: $DEST/$name"
done
