#!/usr/bin/env bash
# Full deploy pipeline: data sync → lookups → sitemap → vite build → wrangler.
# Idempotent — safe to re-run. Run from apps/karta-web/.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▸ 1/5 sync-data (apps/data-pipeline/outputs → public/data + public/logos)"
node scripts/sync-data.mjs

echo "▸ 2/5 build-lookups (lookup-{clubs,jls,zupanije}.json for CF Worker)"
node scripts/build-lookups.mjs

echo "▸ 3/5 build-sitemap (sitemap.xml + robots.txt)"
node scripts/build-sitemap.mjs

echo "▸ 4/5 vite build → dist/"
npm run build

echo "▸ 5/5 wrangler pages deploy"
# CLOUDFLARE_ACCOUNT_ID must point to the D.O.M. account; project name is
# pinned to gis-domovina (see reference_cloudflare_deploy.md memory).
CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-7dc7167b7e2e00923bfa7cd697df14e4}" \
  npx wrangler pages deploy dist \
  --project-name=gis-domovina \
  --branch="${DEPLOY_BRANCH:-main}"

echo "✓ Deploy complete. Verify https://gis.domovina.ai/"
