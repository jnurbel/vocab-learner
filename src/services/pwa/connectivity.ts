/** The part of `window` that tells whether the device has a network. */
export interface ConnectivityHost {
  readonly navigator: { readonly onLine: boolean };
  addEventListener(type: 'online' | 'offline', listener: () => void): void;
  removeEventListener(type: 'online' | 'offline', listener: () => void): void;
}

/**
 * Reports the network state now, then at each change; returns the function that stops it.
 * `navigator.onLine` false is reliable (no network at all), true only means "maybe online":
 * the app shows "Hors ligne" on false and never needs the network for its own features.
 */
export function watchConnectivity(
  host: ConnectivityHost,
  onChange: (online: boolean) => void,
): () => void {
  const report = () => {
    onChange(host.navigator.onLine);
  };
  host.addEventListener('online', report);
  host.addEventListener('offline', report);
  report();
  return () => {
    host.removeEventListener('online', report);
    host.removeEventListener('offline', report);
  };
}
