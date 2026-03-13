import type { Buffer } from 'buffer';
import type process from 'process';

declare global {
  interface Window {
    Buffer?: typeof Buffer;
    process?: typeof process;
  }

  // eslint-disable-next-line no-var
  var Buffer: typeof Buffer;
  // eslint-disable-next-line no-var
  var process: typeof process;
}
