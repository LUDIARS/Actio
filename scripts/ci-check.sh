#!/usr/bin/env bash
set -euo pipefail

# CI check script - used by both GitHub Actions and local pre-push hook
# Ensures the same checks run in both environments.

cd "$(git rev-parse --show-toplevel)"

echo "=== [0/4] Build SDK (packages/sdk) ==="
# npm が packages/sdk をローカルリンクで解決するため、dist/ を事前ビルドする必要あり。
# CI では clone 直後 dist/ が存在しないので tsc が @ludiars/schedula-sdk の型を解決できない。
(cd packages/sdk && npx tsc)

echo "=== [1/4] Backend type check (npm run build) ==="
npm run build

echo ""
echo "=== [2/4] Backend tests (npm test) ==="
npm test

echo ""
echo "=== [3/4] Frontend lint (npm run lint) ==="
cd frontend
npm run lint

echo ""
echo "=== [4/4] Frontend build (npm run build) ==="
npm run build

echo ""
echo "=== All CI checks passed ==="
