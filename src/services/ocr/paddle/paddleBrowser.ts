import * as ort from 'onnxruntime-web';
import { DetectionService, RecognitionService } from 'ppu-paddle-ocr/web';
import type { Box } from '../../../domain/photo/photoBlocks';
import type { PaddleDependencies } from './paddleEngine';
import { PADDLE_RUNTIME_FILE, PADDLE_RUNTIME_FOLDER } from './paddleFiles';

type PaddleImage = Parameters<DetectionService['run']>[0];

/** Fetches a file of the app, telling how many bytes have arrived so far. */
export async function fetchFile(
  url: string,
  onBytes: (bytes: number) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`Cannot fetch ${url}`);
  }
  const chunks: Uint8Array[] = [];
  let arrived = 0;
  const reader = response.body.getReader();
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    chunks.push(chunk.value);
    arrived += chunk.value.length;
    onBytes(arrived);
  }
  const file = new Uint8Array(arrived);
  chunks.reduce((offset, chunk) => {
    file.set(chunk, offset);
    return offset + chunk.length;
  }, 0);
  return file.buffer;
}

/**
 * PaddleOCR on onnxruntime-web, in the browser: WebAssembly on a single thread (GitHub Pages
 * cannot isolate the page across origins, which threads need), with the runtime served by the
 * app itself. Exercised end to end by the e2e tests.
 */
export function browserPaddleDependencies(appBase: string): PaddleDependencies {
  // Only the .wasm file is fetched: its JavaScript glue is bundled with the worker.
  ort.env.wasm.wasmPaths = {
    wasm: new URL(PADDLE_RUNTIME_FOLDER + PADDLE_RUNTIME_FILE, appBase).href,
  };
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const createSession = (model: ArrayBuffer) =>
    ort.InferenceSession.create(new Uint8Array(model), {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
  return {
    fetchFile,
    createDetector: async (model) => {
      const detector = new DetectionService(await createSession(model));
      return { run: (canvas) => detector.run(canvas as PaddleImage) };
    },
    createRecognizer: async (model, dictionary) => {
      const options = {
        charactersDictionary: dictionary,
        minimumConfidence: 0,
        strategy: 'per-box',
      } as const;
      const recognizer = new RecognitionService(await createSession(model), options);
      return {
        run: (canvas, boxes: Box[]) =>
          recognizer.run(canvas as PaddleImage, boxes, dictionary, 'per-box', {
            minimumConfidence: 0,
          }),
      };
    },
    decode: async (image) => {
      const bitmap = await createImageBitmap(image);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return { canvas, size, close: () => undefined };
    },
  };
}
