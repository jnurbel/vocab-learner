import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * The files of the on-device photo reader, served by the app itself under `<base>paddle/`: the
 * CSP allows `connect-src 'self'` only, and nothing must be fetched from a CDN. Git holds no
 * binaries: the runtime is copied from node_modules (pinned by the lockfile), the dictionary is
 * built from a dependency, and the models are downloaded at build time from a fixed revision of
 * their repository, then checked against their SHA-256 before use.
 */

/** PaddleOCR PP-OCRv5 models converted to ONNX (Apache-2.0), at a fixed revision. */
const MODEL_REPOSITORY =
  'https://huggingface.co/snowfluke/ppu-paddle-ocr-models/resolve/3cbb26882389013ed863b66a78e52376b5ff0f0a';

interface DownloadedFile {
  source: string;
  sha256: string;
}

const MODELS: Readonly<Record<string, DownloadedFile>> = {
  'paddle/models/PP-OCRv5_mobile_det_infer.onnx': {
    source: 'detection/PP-OCRv5_mobile_det_infer.onnx',
    sha256: 'd7fe3ea74652890722c0f4d02458b7261d9f5ae6c92904d05707c9eb155c7924',
  },
  'paddle/models/PP-OCRv5_mobile_rec_infer.onnx': {
    source: 'recognition/PP-OCRv5_mobile_rec_infer.onnx',
    sha256: 'd253c3cbee6e507828a5271a30ab0ec8ae7c2a99d0cc8e6f844fe380809d22b3',
  },
  'paddle/models/ppocrv5_dict.txt': {
    source: 'recognition/ppocrv5_dict.txt',
    sha256: '9dfc80c50b6cb07399a47a7cf25d11db475fb4ad0e1fc96b2eff6467c8166ff3',
  },
  'paddle/models/latin_PP-OCRv5_mobile_rec_infer.onnx': {
    source: 'recognition/multi/latin/v5/latin_PP-OCRv5_mobile_rec_infer.onnx',
    sha256: '497dbed20b7fd86334c9deb5082c2958982a316bb16e3589ebc6502cd85cae79',
  },
  'paddle/models/ppocrv5_latin_dict.txt': {
    source: 'recognition/multi/latin/v5/ppocrv5_latin_dict.txt',
    sha256: '7274e68c7675355e45dd75c360c83faa0d0624de33a704c799a7da8897662201',
  },
};

/** The WebAssembly runtime of onnxruntime-web, single-threaded SIMD build. */
const RUNTIME: Readonly<Record<string, string>> = {
  'paddle/ort/ort-wasm-simd-threaded.wasm': 'onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
};

const FRENCH_WORDS = 'paddle/fr-words.txt';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.wasm': 'application/wasm',
  '.onnx': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function paddleAssets(): Plugin {
  let root = process.cwd();
  let base = '/';
  const cacheFolder = () => path.join(root, 'node_modules', '.cache', 'paddle-models');

  /** A listed model, downloaded once into node_modules/.cache, refused if its hash differs. */
  async function model(fileName: string, { source, sha256: expected }: DownloadedFile) {
    const cached = path.join(cacheFolder(), expected);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- listed hashes only
    if (existsSync(cached)) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- listed hashes only
      const content = readFileSync(cached);
      if (sha256(content) === expected) {
        return content;
      }
    }
    const response = await fetch(`${MODEL_REPOSITORY}/${source}`);
    if (!response.ok) {
      throw new Error(`Cannot download ${fileName}: HTTP ${String(response.status)}`);
    }
    const content = Buffer.from(await response.arrayBuffer());
    if (sha256(content) !== expected) {
      throw new Error(`${fileName} does not match its SHA-256: refused`);
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed cache folder
    mkdirSync(cacheFolder(), { recursive: true });
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- listed hashes only
    writeFileSync(`${cached}.part`, content);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- listed hashes only
    renameSync(`${cached}.part`, cached);
    return content;
  }

  /** A listed file of node_modules, never a path taken from a request. */
  const fromModules = (file: string) =>
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- listed paths only
    readFileSync(path.join(root, 'node_modules', file));

  /** One word per line, from an-array-of-french-words (MIT, after the CC0 Letterpress list). */
  const frenchWords = () => {
    const words = JSON.parse(
      fromModules('an-array-of-french-words/index.json').toString('utf8'),
    ) as string[];
    return Buffer.from(words.join('\n'), 'utf8');
  };

  async function file(fileName: string): Promise<Buffer | undefined> {
    const downloaded = MODELS[fileName];
    if (downloaded !== undefined) {
      return model(fileName, downloaded);
    }
    const runtime = RUNTIME[fileName];
    if (runtime !== undefined) {
      return fromModules(runtime);
    }
    return fileName === FRENCH_WORDS ? frenchWords() : undefined;
  }

  return {
    name: 'paddle-assets',
    configResolved(config) {
      root = config.root;
      base = config.base;
    },
    async generateBundle() {
      for (const fileName of [...Object.keys(MODELS), ...Object.keys(RUNTIME), FRENCH_WORDS]) {
        const source = await file(fileName);
        if (source !== undefined) {
          this.emitFile({ type: 'asset', fileName, source });
        }
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = (request.url ?? '').split('?')[0] ?? '';
        const name = url.startsWith(base) ? url.slice(base.length) : url.replace(/^\//, '');
        file(name).then(
          (source) => {
            if (source === undefined) {
              next();
              return;
            }
            response.setHeader(
              'Content-Type',
              CONTENT_TYPES[path.extname(name)] ?? 'application/octet-stream',
            );
            response.end(source);
          },
          (error: unknown) => {
            next(error);
          },
        );
      });
    },
  };
}
