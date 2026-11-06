import type { PinyinGenerator } from '../domain/pinyinGeneration';

/**
 * The pinyin generator, loaded in the background the first time a form needs it.
 * Until then (or if loading fails, e.g. offline) no pinyin is proposed; the learner may type it.
 */
export class PinyinSource {
  generator = $state<PinyinGenerator | undefined>();
  readonly #load: () => Promise<PinyinGenerator>;

  constructor(load: () => Promise<PinyinGenerator>) {
    this.#load = load;
  }

  /** Starts loading without waiting; call it from an effect. */
  request(): void {
    void this.ready();
  }

  /** The generator once loaded, or undefined when it cannot be loaded. */
  async ready(): Promise<PinyinGenerator | undefined> {
    if (this.generator === undefined) {
      try {
        this.generator = await this.#load();
      } catch {
        return undefined;
      }
    }
    return this.generator;
  }
}
