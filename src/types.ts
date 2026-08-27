// Shared GDB API types live in electron/gdb-api.ts so the preload bridge
// and the renderer can't drift apart; re-export them here for components.
import type { GDBAPI } from '../electron/gdb-api';
export type * from '../electron/gdb-api';

declare global {
  interface Window {
    gdbAPI: GDBAPI;
  }
}
