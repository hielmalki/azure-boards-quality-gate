#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$REPO_ROOT/.env" ]]; then
  set -a
  source "$REPO_ROOT/.env"
  set +a
fi

"$REPO_ROOT/scripts/bump-extension-version.sh"

if [[ -z "${MARKETPLACE_PAT:-}" ]]; then
  echo "MARKETPLACE_PAT ist nicht gesetzt (PAT mit Marketplace-'Publish'-Scope, siehe" >&2
  echo "https://marketplace.visualstudio.com/manage)." >&2
  exit 1
fi

cd "$REPO_ROOT/web"
npm run build

PUBLISH_ARGS=(extension publish --manifest-globs ../vss-extension.json --output-path ../vsix-output --token "$MARKETPLACE_PAT")
if [[ -n "${SHARE_WITH_ORG:-}" ]]; then
  PUBLISH_ARGS+=(--share-with "$SHARE_WITH_ORG")
fi

npx tfx "${PUBLISH_ARGS[@]}"
