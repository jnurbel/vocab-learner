import { browserPaddleDependencies } from './paddleBrowser';
import { createPaddleEngine } from './paddleEngine';
import { servePaddleRequests } from './paddleWorkerHost';

/** The photo reader worker: PaddleOCR runs here, off the page's thread. Tested end to end. */
const appBase = new URL(import.meta.env.BASE_URL, self.location.origin).href;
servePaddleRequests(self, createPaddleEngine(appBase, browserPaddleDependencies(appBase)));
