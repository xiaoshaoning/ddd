import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';
import fs from 'fs';

// End-to-end smoke test driving the real Electron app against real GDB
// (no mock API). The renderer is loaded from the production build, so
// `npm run build` must have run first; the test skips with a hint if not.
const MAIN_JS = path.resolve(__dirname, '../dist-electron/main.js');
const RENDERER = path.resolve(__dirname, '../dist/index.html');
const TEST_EXE = path.resolve(__dirname, 'func_test.exe');
const built = fs.existsSync(MAIN_JS) && fs.existsSync(RENDERER);

test.describe('Electron + real GDB', () => {
  test.skip(!built, 'Production build missing — run `npm run build` first');

  test('loads a real program, sets breakpoints, runs, and reads debug state', async () => {
    const app = await electron.launch({ args: [MAIN_JS] });
    try {
      const win = await app.firstWindow();
      await win.waitForSelector('.app-container', { timeout: 15000 });

      // Start GDB with a real compiled executable
      const started = await win.evaluate((exe) => window.gdbAPI.start(exe), TEST_EXE);
      expect(started).toBe(true);

      const source_path = await win.evaluate(() => window.gdbAPI.get_source_file_path());
      expect(source_path).toContain('func_test.c');

      const bp = await win.evaluate((src) => window.gdbAPI.set_breakpoint(src, 20), source_path);
      expect(bp).not.toBeNull();
      expect(bp!.line).toBe(20);

      await win.evaluate(() => window.gdbAPI.run());

      // Wait until the program pauses at the breakpoint
      await win.waitForFunction(
        async () => (await window.gdbAPI.get_stack_frames()).length > 0,
        undefined,
        { timeout: 15000 }
      );

      const frames = await win.evaluate(() => window.gdbAPI.get_stack_frames());
      expect(frames.length).toBeGreaterThan(0);
      expect(frames[0].func).toBe('main');

      const vars = await win.evaluate(() => window.gdbAPI.get_variables());
      expect(vars.length).toBeGreaterThan(0);

      // Graph extraction exercises the MI result parser through real IPC
      const graph = await win.evaluate(() => window.gdbAPI.extract_graph('a'));
      expect(graph).not.toBeNull();
      expect(graph!.nodes.length).toBe(1);
      expect(graph!.nodes[0].type_name).toBe('int');

      // CLI commands capture real console output
      const cli_out = await win.evaluate(() => window.gdbAPI.send_cli_command('info program'));
      expect(cli_out.length).toBeGreaterThan(0);

      // Disassembly returns real text (was 'No data returned' before the fix)
      const disasm = await win.evaluate(() => window.gdbAPI.disassemble('main', '8'));
      expect(disasm).toContain('<main+0>');

      // Memory reads work via -data-read-memory-bytes
      const mem = await win.evaluate(() => window.gdbAPI.read_memory('&a', 8));
      expect(mem.trim().length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
