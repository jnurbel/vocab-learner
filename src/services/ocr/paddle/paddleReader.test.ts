import { describe, expect, it } from 'vitest';
import { RecognitionCancelled, type RecognitionProgress } from '../textRecognizer';
import type { PaddleRequest, PaddleResponse } from './paddleProtocol';
import { createPaddleReader, type WorkerPort } from './paddleReader';

/** A worker that the test drives: it answers when told to. */
class FakeWorker implements WorkerPort {
  readonly requests: PaddleRequest[] = [];
  terminated = false;
  readonly #listeners: Record<string, ((event: Event) => void)[]> = { message: [], error: [] };

  postMessage(request: PaddleRequest) {
    this.requests.push(request);
  }

  addEventListener(type: 'message' | 'error', listener: (event: Event) => void) {
    this.#listeners[type]?.push(listener);
  }

  terminate() {
    this.terminated = true;
  }

  answer(response: PaddleResponse) {
    this.#listeners['message']?.forEach((listener) => {
      listener(new MessageEvent('message', { data: response }));
    });
  }

  crash() {
    this.#listeners['error']?.forEach((listener) => {
      listener(new Event('error'));
    });
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const reader = createPaddleReader(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  const progress: RecognitionProgress[] = [];
  const options = (signal = new AbortController().signal) => ({
    signal,
    onProgress: (step: RecognitionProgress) => progress.push(step),
  });
  return { reader, workers, progress, options };
}

const image = new Blob(['photo']);
const analysis = { size: { width: 10, height: 10 }, blocks: [] };

describe('createPaddleReader', () => {
  it('reads the photo in a worker started on first use, and reports its progress', async () => {
    const { reader, workers, progress, options } = setup();

    const result = reader.analyze(image, options());
    expect(workers).toHaveLength(1);
    expect(workers[0]?.requests).toEqual([{ id: 1, kind: 'analyze', image }]);
    workers[0]?.answer({ id: 1, kind: 'progress', progress: { step: 'loading', progress: 0.5 } });
    workers[0]?.answer({ id: 1, kind: 'done', result: analysis });

    expect(await result).toEqual(analysis);
    expect(progress).toEqual([{ step: 'loading', progress: 0.5 }]);
  });

  it('keeps the same worker, and its models, for the following requests', async () => {
    const { reader, workers, options } = setup();

    const regions = reader.readRegions(
      image,
      [{ box: { x: 0, y: 0, width: 1, height: 1 }, script: 'latin' }],
      options(),
    );
    const meanings = reader.correctFrench(['pome'], options());
    workers[0]?.answer({ id: 2, kind: 'done', result: [{ text: 'pomme', certain: true }] });
    workers[0]?.answer({ id: 1, kind: 'done', result: [{ text: 'a', confidence: 1 }] });

    expect(await meanings).toEqual([{ text: 'pomme', certain: true }]);
    expect(await regions).toEqual([{ text: 'a', confidence: 1 }]);
    expect(workers).toHaveLength(1);
    expect(workers[0]?.requests.map(({ kind }) => kind)).toEqual(['readRegions', 'correctFrench']);
  });

  it('stops the worker and frees its memory when the reading is cancelled', async () => {
    const { reader, workers, options } = setup();
    const controller = new AbortController();

    const result = reader.analyze(image, options(controller.signal));
    controller.abort();

    await expect(result).rejects.toBeInstanceOf(RecognitionCancelled);
    expect(workers[0]?.terminated).toBe(true);
    void reader.analyze(image, options());
    expect(workers).toHaveLength(2);
  });

  it('does not start when cancelled already', async () => {
    const { reader, workers, options } = setup();
    const controller = new AbortController();
    controller.abort();

    await expect(reader.analyze(image, options(controller.signal))).rejects.toBeInstanceOf(
      RecognitionCancelled,
    );
    expect(workers).toHaveLength(0);
  });

  it('reports a reading that failed in the worker', async () => {
    const { reader, workers, options } = setup();

    const result = reader.analyze(image, options());
    workers[0]?.answer({ id: 1, kind: 'failed', message: 'offline' });

    await expect(result).rejects.toThrow('offline');
  });

  it('reports a worker that cannot start, and starts a new one next time', async () => {
    const { reader, workers, options } = setup();

    const result = reader.analyze(image, options());
    workers[0]?.crash();

    await expect(result).rejects.toThrow('The photo reader stopped');
    void reader.analyze(image, options());
    expect(workers).toHaveLength(2);
  });

  it('ignores the answers to other requests, and frees the worker when disposed', () => {
    const { reader, workers, options } = setup();

    const result = reader.analyze(image, options()).catch((error: unknown) => error);
    workers[0]?.answer({ id: 99, kind: 'done', result: analysis });
    reader.dispose();
    reader.dispose();

    expect(workers[0]?.terminated).toBe(true);
    return expect(result).resolves.toBeInstanceOf(RecognitionCancelled);
  });

  it('keeps the worker when cancelled after the reading is done', async () => {
    const { reader, workers, options } = setup();
    const controller = new AbortController();

    const result = reader.analyze(image, options(controller.signal));
    workers[0]?.answer({ id: 1, kind: 'done', result: analysis });
    await result;
    controller.abort();

    expect(workers[0]?.terminated).toBe(false);
  });
});
