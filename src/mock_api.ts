import type { GDBAPI, Breakpoint, Variable, StackFrame, StoppedInfo } from './types';

const DEMO_SOURCE = `#include <stdio.h>

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int main(int argc, char **argv) {
    int x = 5;
    int result = factorial(x);
    printf("Factorial of %d is %d\n", x, result);
    return 0;
}
`;

const DEMO_VARIABLES: Variable[] = [
  { name: 'argc', value: '1', type: 'int' },
  { name: 'argv', value: '0x7fffffffde38', type: 'char **' },
  { name: 'x', value: '5', type: 'int' },
  { name: 'result', value: '120', type: 'int' },
];

const DEMO_STACK: StackFrame[] = [
  { level: 0, func: 'main', file: 'demo.c', line: 13 },
  { level: 1, func: '__libc_start_main', file: 'libc-start.c', line: 308 },
];

const DEMO_BREAKPOINTS: Breakpoint[] = [
  { id: '1', file: 'demo.c', line: 9, enabled: true },
  { id: '2', file: 'demo.c', line: 14, enabled: true },
];

type Listener = (...args: any[]) => void;

class MockGDBAPI implements GDBAPI {
  private listeners: Map<string, Listener[]> = new Map();
  private bp: Breakpoint[] = [...DEMO_BREAKPOINTS];
  private bp_lines = new Set(DEMO_BREAKPOINTS.map(b => b.line));
  private watchpoints: { id: string; expression: string; type: string }[] = [
    { id: 'wp_1', expression: 'x', type: 'hw watchpoint' },
  ];

  async start(_program_path: string): Promise<boolean> {
    console.log('[Mock] GDB started');
    return true;
  }

  async stop(): Promise<void> {
    console.log('[Mock] GDB stopped');
    this.emit('exited');
  }

  async run(): Promise<void> {
    console.log('[Mock] Running...');
    this.emit('running');
    setTimeout(() => {
      this.emit('stopped', {
        reason: 'breakpoint-hit',
        file: 'demo.c',
        line: 9,
      } as StoppedInfo);
    }, 500);
  }

  async pause(): Promise<void> {
    console.log('[Mock] Paused');
  }

  async continue(): Promise<void> {
    console.log('[Mock] Continuing...');
    this.emit('running');
    setTimeout(() => {
      this.emit('stopped', {
        reason: 'end-stepping-range',
        file: 'demo.c',
        line: 14,
      } as StoppedInfo);
    }, 300);
  }

  async step_over(): Promise<void> {
    console.log('[Mock] Step over');
    this.emit('running');
    setTimeout(() => {
      this.emit('stopped', {
        reason: 'end-stepping-range',
        file: 'demo.c',
        line: 10,
      } as StoppedInfo);
    }, 200);
  }

  async step_into(): Promise<void> {
    console.log('[Mock] Step into');
    this.emit('running');
    setTimeout(() => {
      this.emit('stopped', {
        reason: 'end-stepping-range',
        file: 'demo.c',
        line: 4,
      } as StoppedInfo);
    }, 200);
  }

  async step_out(): Promise<void> {
    console.log('[Mock] Step out');
  }

  async set_breakpoint(file: string, line: number, _condition?: string):
      Promise<{ id: string; file: string; line: number } | null> {
    const id = 'bp_' + line;
    this.bp.push({ id, file, line, enabled: true });
    this.bp_lines.add(line);
    return { id, file, line };
  }

  async remove_breakpoint(bp_id: string): Promise<void> {
    const bp_idx = this.bp.findIndex(b => b.id === bp_id);
    if (bp_idx >= 0) {
      this.bp_lines.delete(this.bp[bp_idx].line);
      this.bp.splice(bp_idx, 1);
    }
    const wp_idx = this.watchpoints.findIndex(w => w.id === bp_id);
    if (wp_idx >= 0) {
      this.watchpoints.splice(wp_idx, 1);
    }
  }

  async list_breakpoints(): Promise<Breakpoint[]> {
    return [...this.bp];
  }

  async get_variables(): Promise<Variable[]> {
    return [...DEMO_VARIABLES];
  }

  async evaluate_expression(expression: string): Promise<{ value: string; type: string } | null> {
    const mock_values: Record<string, string> = {
      'x': '5', 'y': '20', 'z': '45',
      'a': '3', 'b': '4', 'c': '5',
      'argc': '1', 'result': '120',
      'counter': '2', 'global_counter': '2',
      'sum': '15', 'm': '12', 's': '17',
    };
    return { value: mock_values[expression] || '42', type: 'int' };
  }

  async get_stack_frames(): Promise<StackFrame[]> {
    return [...DEMO_STACK];
  }

  async get_source(_file_path: string): Promise<string> {
    return DEMO_SOURCE;
  }

  async get_current_location(): Promise<{ file: string; line: number } | null> {
    return { file: 'demo.c', line: 9 };
  }

  async read_memory(_address: string, _length: number): Promise<string> {
    return '0x400000: 48 65 6c 6c 6f 20 57 6f 72 6c 64 00\n0x40000c: 00 00 00 00 00 00 00 00';
  }

  async disassemble(_address: string, _length: number): Promise<string> {
    return '0x400000 <main>:     push   rbp\n0x400001 <main+1>:   mov    rbp,rsp\n0x400004 <main+4>:   sub    rsp,0x10';
  }

  async get_source_file_path(): Promise<string | null> {
    return 'demo.c';
  }

  async get_breakpoint_locations(): Promise<Set<number>> {
    return new Set(this.bp_lines);
  }

  on_output(callback: (data: string) => void): () => void {
    return this.add_listener('output', callback);
  }

  on_stopped(callback: (info: StoppedInfo) => void): () => void {
    return this.add_listener('stopped', callback);
  }

  on_running(callback: () => void): () => void {
    return this.add_listener('running', callback);
  }

  on_exited(callback: () => void): () => void {
    return this.add_listener('exited', callback);
  }

  async open_file_dialog(): Promise<string | null> {
    console.log('[Mock] Open file dialog - returning demo');
    return 'demo_program';
  }

  async send_cli_command(command: string): Promise<string> {
    console.log('[Mock] CLI command:', command);
    return '(mock) ' + command + '\n= 42';
  }

  async set_watchpoint(expression: string): Promise<{ id: string; expression: string } | null> {
    console.log('[Mock] Watch:', expression);
    const id = 'wp_' + Date.now();
    this.watchpoints.push({ id, expression, type: 'hw watchpoint' });
    return { id, expression };
  }

  async list_watchpoints(): Promise<{ id: string; expression: string; type: string }[]> {
    return [...this.watchpoints];
  }

  private add_listener(event: string, callback: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    return () => {
      const arr = this.listeners.get(event);
      if (arr) {
        const idx = arr.indexOf(callback);
        if (idx >= 0) arr.splice(idx, 1);
      }
    };
  }

  private emit(event: string, ...args: any[]): void {
    const arr = this.listeners.get(event);
    if (arr) {
      arr.forEach(cb => cb(...args));
    }
  }
}

export function create_mock_api(): GDBAPI {
  return new MockGDBAPI();
}
