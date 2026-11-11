import type { Page } from '@playwright/test';

interface FakeBlock {
  box: { x: number; y: number; width: number; height: number };
  text: string;
}

export interface FakeReading {
  size: { width: number; height: number };
  blocks: readonly FakeBlock[];
  /** Meanings the fake dictionary is not sure of: kept as read, to check. */
  unsure?: readonly string[];
}

/**
 * Replaces the on-device photo reader with a fake one, without any hook in the app: the worker
 * script of the build is answered with a worker that speaks the same protocol
 * (src/services/ocr/paddle/paddleProtocol.ts) and reads the given blocks. A region read again
 * with the Latin model gives "gouvernement" when wide, "gouver" when cut narrow, so that a test
 * can see the effect of a separator it moved.
 */
export async function useFakePhotoReader(page: Page, reading: FakeReading): Promise<void> {
  const source = `
    const reading = ${JSON.stringify(reading)};
    const han = /\\p{Script=Han}/u;
    const blocks = reading.blocks.map(({ box, text }) => ({
      box,
      chinese: { text, confidence: 0.99 },
      latin: { text: han.test(text) ? '' : text, confidence: 0.97 },
    }));
    self.addEventListener('message', ({ data }) => {
      const answer = (result) => self.postMessage({ id: data.id, kind: 'done', result });
      if (data.kind === 'analyze') {
        self.postMessage({ id: data.id, kind: 'progress', progress: { step: 'reading', progress: 0.5 } });
        answer({ size: reading.size, blocks });
      } else if (data.kind === 'readRegions') {
        answer(data.regions.map(({ box, script }) => ({
          text: script === 'chinese' ? '政府' : box.width > 300 ? 'gouvernement' : 'gouver',
          confidence: 0.9,
        })));
      } else {
        answer(data.texts.map((text) => ({ text, certain: !(reading.unsure ?? []).includes(text) })));
      }
    });
  `;
  await page.route(/\/paddle\/paddle\.worker-[\w-]+\.js$/, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: source }),
  );
}
