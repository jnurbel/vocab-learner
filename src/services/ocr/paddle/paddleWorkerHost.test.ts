import { describe, expect, it, vi } from 'vitest';
import type { PaddleEngine } from './paddleEngine';
import type { PaddleRequest, PaddleResponse } from './paddleProtocol';
import { servePaddleRequests } from './paddleWorkerHost';

function host(engine: Partial<PaddleEngine>) {
  const posted: PaddleResponse[] = [];
  let handler: ((event: MessageEvent<PaddleRequest>) => void) | undefined;
  servePaddleRequests(
    {
      postMessage: (message: PaddleResponse) => posted.push(message),
      addEventListener: (
        _type: 'message',
        listener: (event: MessageEvent<PaddleRequest>) => void,
      ) => {
        handler = listener;
      },
    },
    engine as PaddleEngine,
  );
  const send = async (request: PaddleRequest) => {
    handler?.(new MessageEvent('message', { data: request }));
    await vi.waitFor(() => {
      expect(posted.some(({ id, kind }) => id === request.id && kind !== 'progress')).toBe(true);
    });
  };
  return { posted, send };
}

describe('servePaddleRequests', () => {
  it('reads a photo and answers with the blocks, after the progress', async () => {
    const analysis = { size: { width: 1, height: 1 }, blocks: [] };
    const { posted, send } = host({
      analyze: (_image, onProgress) => {
        onProgress({ step: 'reading', progress: 0.5 });
        return Promise.resolve(analysis);
      },
    });

    await send({ id: 1, kind: 'analyze', image: new Blob(['photo']) });

    expect(posted).toEqual([
      { id: 1, kind: 'progress', progress: { step: 'reading', progress: 0.5 } },
      { id: 1, kind: 'done', result: analysis },
    ]);
  });

  it('reads regions and corrects meanings', async () => {
    const { posted, send } = host({
      readRegions: () => Promise.resolve([{ text: '控制', confidence: 1 }]),
      correctFrench: (texts) => Promise.resolve(texts.map((text) => ({ text, certain: true }))),
    });

    await send({ id: 2, kind: 'readRegions', image: new Blob(['photo']), regions: [] });
    await send({ id: 3, kind: 'correctFrench', texts: ['pomme'] });

    expect(posted).toEqual([
      { id: 2, kind: 'done', result: [{ text: '控制', confidence: 1 }] },
      { id: 3, kind: 'done', result: [{ text: 'pomme', certain: true }] },
    ]);
  });

  it('answers a failure without letting it escape the worker', async () => {
    const { posted, send } = host({ correctFrench: () => Promise.reject(new Error('offline')) });

    await send({ id: 4, kind: 'correctFrench', texts: [] });

    expect(posted).toEqual([{ id: 4, kind: 'failed', message: 'offline' }]);
  });

  it('answers a failure that is not an error, too', async () => {
    const { posted, send } = host({ correctFrench: () => Promise.reject(new Error()) });
    const { posted: other, send: sendOther } = host({
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- a library may
      correctFrench: () => Promise.reject('lost'),
    });

    await send({ id: 5, kind: 'correctFrench', texts: [] });
    await sendOther({ id: 6, kind: 'correctFrench', texts: [] });

    expect(posted).toEqual([{ id: 5, kind: 'failed', message: 'Error' }]);
    expect(other).toEqual([{ id: 6, kind: 'failed', message: 'lost' }]);
  });
});
