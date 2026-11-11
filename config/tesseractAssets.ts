import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * The files of Tesseract.js served by the app itself, under `<base>tesseract/`: the CSP allows
 * `connect-src 'self'` only, and nothing must be fetched from a CDN. Copied from node_modules at
 * build time, so that their versions are pinned by the lockfile and git holds no binaries.
 */
export const TESSERACT_FILES: Readonly<Record<string, string>> = {
  'tesseract/worker.min.js': 'tesseract.js/dist/worker.min.js',
  // The reader picks one of these, after the WebAssembly features of the device.
  'tesseract/core/tesseract-core-lstm.wasm.js': 'tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract/core/tesseract-core-simd-lstm.wasm.js':
    'tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract/core/tesseract-core-relaxedsimd-lstm.wasm.js':
    'tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  // "best_int" LSTM models, the lighter ones (tessdata_best, integer).
  'tesseract/lang/chi_sim.traineddata.gz':
    '@tesseract.js-data/chi_sim/4.0.0_best_int/chi_sim.traineddata.gz',
  'tesseract/lang/eng.traineddata.gz': '@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.js': 'text/javascript',
  // Unzipped by the reader itself: no Content-Encoding header.
  '.gz': 'application/octet-stream',
};

export function tesseractAssets(): Plugin {
  let root = process.cwd();
  let base = '/';
  /** Reads a file listed in TESSERACT_FILES, never a path taken from a request. */
  const read = (file: string) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- listed paths only
    readFileSync(path.join(root, 'node_modules', file));

  return {
    name: 'tesseract-assets',
    configResolved(config) {
      root = config.root;
      base = config.base;
    },
    generateBundle() {
      for (const [fileName, file] of Object.entries(TESSERACT_FILES)) {
        this.emitFile({ type: 'asset', fileName, source: read(file) });
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = (request.url ?? '').split('?')[0] ?? '';
        const name = url.startsWith(base) ? url.slice(base.length) : url.replace(/^\//, '');
        const file = TESSERACT_FILES[name];
        if (file === undefined) {
          next();
          return;
        }
        response.setHeader('Content-Type', CONTENT_TYPES[path.extname(name)] ?? 'text/plain');
        response.end(read(file));
      });
    },
  };
}
