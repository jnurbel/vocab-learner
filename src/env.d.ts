/// <reference types="vite-plugin-pwa/vanillajs" />

/** Replaced at build time by the version of package.json (see `define` in vite.config.ts). */
declare const __APP_VERSION__: string;

/**
 * Replaced at build time by the origin of the worker that has photos read by Claude, from
 * VITE_PHOTO_WORKER_URL (see vite.config.ts); empty when the option is not offered.
 */
declare const __PHOTO_WORKER_ORIGIN__: string;
