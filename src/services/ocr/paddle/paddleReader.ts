import type { SpellingResult } from '../../../domain/photo/frenchSpelling';
import type { Reading } from '../../../domain/photo/photoBlocks';
import type { PhotoAnalysis, PhotoReader } from '../photoReader';
import { RecognitionCancelled, type RecognitionOptions } from '../textRecognizer';
import type { PaddleRequest, PaddleResponse, PaddleResult } from './paddleProtocol';

/** The side of a Web Worker that the page talks through. */
export interface WorkerPort {
  postMessage(request: PaddleRequest): void;
  addEventListener(type: 'message' | 'error', listener: (event: Event) => void): void;
  terminate(): void;
}

type RequestBody = PaddleRequest extends infer Request
  ? Request extends PaddleRequest
    ? Omit<Request, 'id'>
    : never
  : never;

interface Pending {
  resolve: (result: PaddleResult) => void;
  reject: (error: Error) => void;
  onProgress: RecognitionOptions['onProgress'];
}

/**
 * The photo reader seen from the page: requests go to a worker started on first use, which keeps
 * its models for the following photos. Cancelling stops the worker, which frees its memory.
 */
export function createPaddleReader(startWorker: () => WorkerPort): PhotoReader {
  let worker: WorkerPort | undefined;
  let nextId = 1;
  const pending = new Map<number, Pending>();

  function stop(error: Error) {
    worker?.terminate();
    worker = undefined;
    const waiting = [...pending.values()];
    pending.clear();
    waiting.forEach(({ reject }) => {
      reject(error);
    });
  }

  function started(): WorkerPort {
    if (worker !== undefined) {
      return worker;
    }
    const port = startWorker();
    port.addEventListener('message', (event) => {
      const response = (event as MessageEvent<PaddleResponse>).data;
      const request = pending.get(response.id);
      if (request === undefined) {
        return;
      }
      if (response.kind === 'progress') {
        request.onProgress(response.progress);
        return;
      }
      pending.delete(response.id);
      if (response.kind === 'done') {
        request.resolve(response.result);
      } else {
        request.reject(new Error(response.message));
      }
    });
    port.addEventListener('error', () => {
      stop(new Error('The photo reader stopped'));
    });
    worker = port;
    return port;
  }

  function send<T extends PaddleResult>(
    body: RequestBody,
    options: RecognitionOptions,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (options.signal.aborted) {
        reject(new RecognitionCancelled());
        return;
      }
      const id = nextId;
      nextId += 1;
      pending.set(id, {
        resolve: (result) => {
          resolve(result as T);
        },
        reject,
        onProgress: options.onProgress,
      });
      options.signal.addEventListener('abort', () => {
        if (pending.has(id)) {
          stop(new RecognitionCancelled());
        }
      });
      started().postMessage({ ...body, id });
    });
  }

  return {
    analyze: (image, options) => send<PhotoAnalysis>({ kind: 'analyze', image }, options),
    readRegions: (image, regions, options) =>
      send<Reading[]>({ kind: 'readRegions', image, regions: [...regions] }, options),
    correctFrench: (texts, options) =>
      send<SpellingResult[]>({ kind: 'correctFrench', texts: [...texts] }, options),
    dispose: () => {
      stop(new RecognitionCancelled());
    },
  };
}
