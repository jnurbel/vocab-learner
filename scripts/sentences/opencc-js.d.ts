/** The part of opencc-js the generation script uses: it ships no types of its own. */
declare module 'opencc-js' {
  export function Converter(options: { from: string; to: string }): (text: string) => string;
}
