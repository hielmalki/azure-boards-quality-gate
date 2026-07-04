#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTION_APP_NAME="${FUNCTION_APP_NAME:-qualitygate-ai-api}"

cd "$REPO_ROOT"
func azure functionapp publish "$FUNCTION_APP_NAME"
