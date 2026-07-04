#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$REPO_ROOT/vss-extension.json"

CURRENT_VERSION="$(grep -m1 '"version"' "$MANIFEST" | sed -E 's/.*"version": *"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/')"
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"

perl -pi -e "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" "$MANIFEST"

echo "vss-extension.json: $CURRENT_VERSION -> $NEW_VERSION"
