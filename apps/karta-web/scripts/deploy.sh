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

# DEPLOY_TARGET=pages  → Pages projekt gis-domovina (Advanced Mode, dist/_worker.js)
# DEPLOY_TARGET=worker → Worker gis-domovina sa static assets (wrangler.toml)
# Isti public/_worker.js u oba slučaja. Domenu gis.domovina.ai drži onaj cilj
# na koji je u CF-u spojena — vidi docs/2026-10-30-pages-u-workers.md.
TARGET="${DEPLOY_TARGET:-pages}"
export CLOUDFLARE_ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-7dc7167b7e2e00923bfa7cd697df14e4}"
if [ "$TARGET" = "worker" ]; then
  echo "▸ 5/5 wrangler deploy (Worker + static assets)"
  npx wrangler deploy
else
  echo "▸ 5/5 wrangler pages deploy"
  # Project name is pinned to gis-domovina (see reference_cloudflare_deploy.md memory).
  npx wrangler pages deploy dist \
    --project-name=gis-domovina \
    --branch="${DEPLOY_BRANCH:-main}"
fi

echo "✓ Deploy complete. Verify https://gis.domovina.ai/"
