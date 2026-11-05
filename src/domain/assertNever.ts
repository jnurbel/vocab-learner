/**
 * Exhaustiveness guard for discriminated unions: calling it in the `default`
 * branch of a switch fails to compile as soon as a case is left unhandled.
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
