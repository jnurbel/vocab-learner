#!/usr/bin/env bash
# Fails when the build in dist/ would not make an installable, offline app on GitHub Pages:
# the service worker, its Workbox runtime, the web manifest and its icons must all be there.
set -euo pipefail

dist="${1:-dist}"
missing=0

for file in sw.js manifest.webmanifest index.html \
  icons/icon-192.png icons/icon-512.png icons/icon-maskable-512.png icons/apple-touch-icon-180.png; do
  if [[ ! -s "${dist}/${file}" ]]; then
    echo "::error::${dist}/${file} is missing from the build"
    missing=1
  fi
done

if ! compgen -G "${dist}/workbox-*.js" >/dev/null; then
  echo "::error::the Workbox runtime (${dist}/workbox-*.js) is missing from the build"
  missing=1
fi

if ! grep -q '<link rel="manifest" href="/vocab-learner/manifest.webmanifest"' "${dist}/index.html"; then
  echo "::error::${dist}/index.html does not link the web manifest"
  missing=1
fi

# The service worker must precache the pinyin-pro chunk, for the automatic pinyin offline.
if ! grep -q 'pinyinProGenerator' "${dist}/sw.js"; then
  echo "::error::${dist}/sw.js does not precache the pinyin-pro chunk"
  missing=1
fi

# The photo reader is kept on first use, never precached: it would weigh ~9 MB on every install.
if grep -q 'tesseract/' "${dist}/sw.js" && ! grep -q 'tesseract-' "${dist}/sw.js"; then
  echo "::error::${dist}/sw.js precaches the photo reader instead of caching it on first use"
  missing=1
fi
if ! grep -q 'CacheFirst' "${dist}/sw.js" || [[ ! -s "${dist}/tesseract/worker.min.js" ]]; then
  echo "::error::the photo reader (${dist}/tesseract/) or its runtime cache is missing"
  missing=1
fi

exit "${missing}"
