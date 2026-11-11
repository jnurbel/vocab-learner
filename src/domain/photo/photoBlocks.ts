/** A rectangle on the photo, in pixels of the photo as read. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a recognition model read in a box, with its confidence from 0 to 1. */
export interface Reading {
  text: string;
  confidence: number;
}

/**
 * A text block found on the photo, read by both recognition models: the Chinese one (hanzi, and
 * printed Latin text) and the Latin one (handwritten French or pinyin, with their accents).
 */
export interface DetectedBlock {
  box: Box;
  chinese: Reading;
  latin: Reading;
}

/** The model a region is read with. */
export type Script = 'chinese' | 'latin';
