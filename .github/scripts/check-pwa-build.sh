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

# The on-device photo reader (PaddleOCR): its models, runtime, worker and dictionary are served by
# the app, kept on first use, never precached: they weigh ~48 MB.
for file in paddle/models/PP-OCRv5_mobile_det_infer.onnx paddle/models/PP-OCRv5_mobile_rec_infer.onnx \
  paddle/models/ppocrv5_dict.txt paddle/models/latin_PP-OCRv5_mobile_rec_infer.onnx \
  paddle/models/ppocrv5_latin_dict.txt paddle/ort/ort-wasm-simd-threaded.wasm paddle/fr-words.txt; do
  if [[ ! -s "${dist}/${file}" ]]; then
    echo "::error::${dist}/${file} (photo reader) is missing from the build"
    missing=1
  fi
done
if ! compgen -G "${dist}/paddle/paddle.worker-*.js" >/dev/null; then
  echo "::error::the photo reader worker (${dist}/paddle/paddle.worker-*.js) is missing from the build"
  missing=1
fi
if ! grep -q 'paddle-ocr-' "${dist}/sw.js"; then
  echo "::error::${dist}/sw.js does not cache the photo reader on first use"
  missing=1
fi
if grep -q 'url:"paddle/' "${dist}/sw.js"; then
  echo "::error::${dist}/sw.js precaches a file of the photo reader"
  missing=1
fi

exit "${missing}"
