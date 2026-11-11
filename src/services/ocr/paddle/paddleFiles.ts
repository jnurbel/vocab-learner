/**
 * The files of the on-device photo reader, served by the app itself under `<base>paddle/` (see
 * config/paddleAssets.ts), with their size in bytes for the progress of the first download.
 */
export const PADDLE_FILES = {
  detection: { path: 'paddle/models/PP-OCRv5_mobile_det_infer.onnx', bytes: 4_748_769 },
  chinese: { path: 'paddle/models/PP-OCRv5_mobile_rec_infer.onnx', bytes: 16_559_278 },
  chineseDictionary: { path: 'paddle/models/ppocrv5_dict.txt', bytes: 74_014 },
  latin: { path: 'paddle/models/latin_PP-OCRv5_mobile_rec_infer.onnx', bytes: 8_066_518 },
  latinDictionary: { path: 'paddle/models/ppocrv5_latin_dict.txt', bytes: 2_617 },
  frenchWords: { path: 'paddle/fr-words.txt', bytes: 0 },
} as const;

export type PaddleFile = keyof typeof PADDLE_FILES;

/** The folder of the WebAssembly runtime (onnxruntime-web), single-threaded. */
export const PADDLE_RUNTIME_FOLDER = 'paddle/ort/';
export const PADDLE_RUNTIME_FILE = 'ort-wasm-simd-threaded.wasm';

export function paddleFileUrl(appBase: string, file: PaddleFile): string {
  return new URL(PADDLE_FILES[file].path, appBase).href;
}
