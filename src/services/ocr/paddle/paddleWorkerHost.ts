import type { PaddleEngine } from './paddleEngine';
import type { RecognitionProgress } from '../textRecognizer';
import type { PaddleRequest, PaddleResponse, PaddleResult } from './paddleProtocol';

/** The side of the worker that the host talks through: `self` in a Web Worker. */
export interface WorkerScope {
  postMessage(message: PaddleResponse): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<PaddleRequest>) => void): void;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message === '' ? error.name : error.message;
  }
  return String(error);
}

/** Answers the requests of the page with the engine, inside the worker. */
export function servePaddleRequests(scope: WorkerScope, engine: PaddleEngine): void {
  scope.addEventListener('message', ({ data: request }) => {
    const onProgress = (progress: RecognitionProgress) => {
      scope.postMessage({ id: request.id, kind: 'progress', progress });
    };
    const work: Promise<PaddleResult> =
      request.kind === 'analyze'
        ? engine.analyze(request.image, onProgress)
        : request.kind === 'readRegions'
          ? engine.readRegions(request.image, request.regions, onProgress)
          : engine.correctFrench(request.texts);
    work.then(
      (result) => {
        scope.postMessage({ id: request.id, kind: 'done', result });
      },
      (error: unknown) => {
        scope.postMessage({ id: request.id, kind: 'failed', message: messageOf(error) });
      },
    );
  });
}
