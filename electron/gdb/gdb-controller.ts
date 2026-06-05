import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';

interface Breakpoint {
  id: string;
  file: string;
  line: number;
  enabled: boolean;
  condition?: string;
}

interface Variable {
  name: string;
  value: string;
  type: string;
}

interface StackFrame {
  level: number;
  func: string;
  file: string;
  line: number;
}

interface StoppedInfo {
  reason: string;
  file?: string;
  line?: number;
}

interface PendingCommand {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  capture_raw?: (raw: string) => void;
}

export class GDBController extends EventEmitter {
  private process: ChildProcess | null = null;
  private token_counter = 0;
  private pending_commands = new Map<number, PendingCommand>();
  private buffer = '';
  public breakpoint_locations = new Set<number>();
  private breakpoints = new Map<string, Breakpoint>();
  private source_file_path: string | null = null;
  private current_line = -1;

  async start(program_path: string): Promise<boolean> {
    this.stop();

    const resolved_path = path.resolve(program_path);
    if (!fs.existsSync(resolved_path)) {
      console.error('Program not found: ' + resolved_path);
      return false;
    }

    try {
      this.process = spawn('gdb', ['-q', '--interpreter=mi', resolved_path], {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.buffer += data.toString();
        this.process_buffer();
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        this.emit('output', '[stderr] ' + data.toString());
      });

      this.process.on('close', (code) => {
        this.emit('output', 'GDB process exited with code ' + code);
        this.emit('exited');
        this.process = null;
      });

      this.process.on('error', (err) => {
        this.emit('output', 'GDB process error: ' + err.message);
      });

      await this.send_command('-gdb-set mi-async on');
      await this.send_command('-gdb-set breakpoint pending on');
      await this.detect_source_file_path();

      return true;
    } catch (err) {
      console.error('Failed to start GDB:', err);
      return false;
    }
  }

  private async detect_source_file_path(): Promise<void> {
    try {
      // Get raw response text from -file-list-exec-source-files
      const raw = await this.send_command_raw('-file-list-exec-source-files');

      // Extract all fullname values from the raw response
      const fullname_regex = /fullname="([^"]*)"/g;
      const fullnames: string[] = [];
      let match: RegExpExecArray | null;
      while ((match = fullname_regex.exec(raw)) !== null) {
        fullnames.push(match[1]);
      }

      // Pick the user's source file (not from system directories)
      const system_dirs = ['/usr/', '/build/', 'msys64', 'mingw', 'crt', 'dllcrt'];
      for (const name of fullnames) {
        // Unescape MI C-string first to get the real path
        const unescaped = this.parse_string('"' + name + '"');
        // Normalize to forward slashes for system-dir check
        const normalized = unescaped.replace(/\\/g, '/');
        const is_system = system_dirs.some(d => normalized.includes(d));
        if (!is_system) {
          this.source_file_path = unescaped;
          this.emit('output', 'Detected source file: ' + unescaped);
          return;
        }
      }

      // Fallback: take the first file if nothing matched
      if (fullnames.length > 0) {
        this.source_file_path = this.parse_string('"' + fullnames[0] + '"');
      }
    } catch {
      // ignore
    }
  }

  stop(): void {
    if (this.process) {
      try {
        this.process.stdin?.write('-gdb-exit\n');
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (this.process) {
          this.process.kill();
          this.process = null;
        }
      }, 1000);
    }
    this.pending_commands.clear();
    this.breakpoints.clear();
    this.breakpoint_locations.clear();
  }

  get_source_file_path(): string | null {
    return this.source_file_path;
  }

  private send_command(command: string, ...args: string[]): Promise<unknown> {
    return this.send_command_internal(command, args, undefined);
  }

  private send_command_raw(command: string, ...args: string[]): Promise<string> {
    let raw_text = '';
    return new Promise((resolve, reject) => {
      this.send_command_internal(command, args, (raw: string) => {
        raw_text = raw;
      }).then(() => resolve(raw_text)).catch(reject);
    });
  }

  private send_command_internal(
    command: string,
    args: string[],
    capture_raw: ((raw: string) => void) | undefined
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error('GDB process not running'));
        return;
      }

      const token = ++this.token_counter;
      const cmd_line = args.length > 0
        ? token + command + ' ' + args.join(' ') + '\n'
        : token + command + '\n';

      this.pending_commands.set(token, { resolve, reject, capture_raw });

      try {
        this.process.stdin.write(cmd_line);
      } catch (err) {
        this.pending_commands.delete(token);
        reject(err);
      }

      setTimeout(() => {
        if (this.pending_commands.has(token)) {
          this.pending_commands.delete(token);
          reject(new Error('Command timed out: ' + command));
        }
      }, 30000);
    });
  }

  private process_buffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      this.process_line(line.trim());
    }
  }

  private process_line(line: string): void {
    if (line === '(gdb)') return;

    if (line.startsWith('~"')) {
      const text = this.parse_string(line.substring(1));
      this.emit('output', text);
      return;
    }

    if (line.startsWith('&"')) {
      const text = this.parse_string(line.substring(1));
      this.emit('output', text);
      return;
    }

    if (line.startsWith('*stopped')) {
      const info = this.parse_stopped_record(line);
      this.emit('stopped', info);
      return;
    }

    if (line.startsWith('*running')) {
      this.emit('running');
      return;
    }

    const token_match = line.match(/^(\d+)(\^.+)/);
    if (token_match) {
      const token = parseInt(token_match[1]);
      const record = token_match[2];
      const handler = this.pending_commands.get(token);

      if (handler) {
        this.pending_commands.delete(token);

        // Capture raw response if requested
        if (handler.capture_raw) {
          handler.capture_raw(record);
        }

        if (record.startsWith('^done')) {
          handler.resolve(this.parse_result(record.substring(5)));
        } else if (record.startsWith('^error')) {
          handler.reject(new Error(this.parse_error(record.substring(6))));
        } else if (record.startsWith('^running')) {
          handler.resolve(null);
        } else {
          handler.resolve(record);
        }
      }
    }
  }

  private parse_string(str: string): string {
    let result = '';
    let i = 0;
    if (str[i] === '"') i++;
    while (i < str.length && str[i] !== '"') {
      if (str[i] === '\\' && i + 1 < str.length) {
        const next = str[i + 1];
        switch (next) {
          case 'n': result += '\n'; break;
          case 't': result += '\t'; break;
          case '\\': result += '\\'; break;
          case '"': result += '"'; break;
          case 'r': result += '\r'; break;
          default:
            if (next >= '0' && next <= '9') {
              let octal = '';
              let j = 0;
              while (j < 3 && i + 1 + j < str.length && str[i + 1 + j] >= '0' && str[i + 1 + j] <= '9') {
                octal += str[i + 1 + j];
                j++;
              }
              result += String.fromCharCode(parseInt(octal, 8));
              i += octal.length;
            } else {
              result += next;
            }
            break;
        }
        i++;
      } else {
        result += str[i];
      }
      i++;
    }
    return result;
  }

  private parse_stopped_record(line: string): StoppedInfo {
    const info: StoppedInfo = { reason: 'unknown' };

    const reason_match = line.match(/reason="([^"]*)"/);
    if (reason_match) info.reason = reason_match[1];

    // Parse frame, handling nested braces in args=[{...},{...}]
    const frame_match = line.match(/frame=\{([\s\S]*)\},thread-id=/);
    if (frame_match) {
      const frame_str = frame_match[1];
      const file_match = frame_str.match(/fullname="([^"]*)"/);
      const short_file = frame_str.match(/file="([^"]*)"/);
      const line_match = frame_str.match(/line="([^"]*)"/);
      if (file_match) info.file = file_match[1];
      else if (short_file) info.file = short_file[1];
      if (line_match) info.line = parseInt(line_match[1]);
    }

    // Fallback: search entire line
    if (!info.file) {
      const fm = line.match(/file="([^"]*)"/);
      if (fm) info.file = fm[1];
    }
    if (!info.line) {
      const lm = line.match(/line="(\d+)"/);
      if (lm) info.line = parseInt(lm[1]);
    }

    if (info.line) this.current_line = info.line;

    return info;
  }

  private parse_result(result: string): unknown {
    if (!result || result.trim() === '') return null;

    const parsed: Record<string, unknown> = {};

    const bkpt_match = result.match(/bkpt=\\\{([^}]*(?:\\{[^}]*\\}[^}]*)*)\\\}/);
    if (bkpt_match) {
      parsed.bkpt = this.parse_tuple(bkpt_match[1]);
    }

    const pair_regex = /(\w+)="([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = pair_regex.exec(result)) !== null) {
      parsed[match[1]] = match[2];
    }

    const simple_regex = /(\w+)=([^,\s}]+)/g;
    while ((match = simple_regex.exec(result)) !== null) {
      if (!(match[1] in parsed)) {
        parsed[match[1]] = match[2];
      }
    }

    if (result.startsWith('[')) {
      return this.parse_list(result);
    }

    return Object.keys(parsed).length > 0 ? parsed : result;
  }

  private parse_tuple(str: string): Record<string, string> {
    const result: Record<string, string> = {};
    const pair_regex = /(\w+)="([^"]*)"/g;
    let match: RegExpExecArray | null;
    while ((match = pair_regex.exec(str)) !== null) {
      result[match[1]] = match[2];
    }
    return result;
  }

  private parse_list(str: string): unknown[] {
    const results: unknown[] = [];
    const inner = str.substring(1, str.length - 1);
    const items = inner.split(/,(?![^{]*\})/);
    for (const item of items) {
      const trimmed = item.trim();
      if (trimmed.startsWith('{')) {
        results.push(this.parse_tuple(trimmed.substring(1, trimmed.length - 1)));
      } else if (trimmed.startsWith('"')) {
        results.push(this.parse_string(trimmed));
      }
    }
    return results;
  }

  private parse_error(error_str: string): string {
    const msg_match = error_str.match(/msg="([^"]*)"/);
    return msg_match ? msg_match[1] : error_str;
  }

  // ---- GDB Operations ----

  async run(): Promise<void> {
    await this.send_command('-exec-run');
  }

  async pause(): Promise<void> {
    if (this.process) {
      if (process.platform === 'win32') {
        this.process.stdin?.write('-exec-interrupt\n');
      } else {
        this.process.kill('SIGINT');
      }
    }
  }

  async continue_command(): Promise<void> {
    await this.send_command('-exec-continue');
  }

  async step_over(): Promise<void> {
    await this.send_command('-exec-next');
  }

  async step_into(): Promise<void> {
    await this.send_command('-exec-step');
  }

  async step_out(): Promise<void> {
    try {
      await this.send_command('-exec-finish');
    } catch {
      // -exec-finish fails in outermost frame (e.g. main)
      // Fall back to step-over instead
      await this.send_command('-exec-next');
    }
  }

  async set_breakpoint(file: string, line: number, condition?: string):
      Promise<{ id: string; file: string; line: number } | null> {
    try {
      // Escape the file path for GDB/MI: use forward slashes and quote as "file:line"
      const escaped_file = file.replace(/\\/g, '/');
      const location = '"' + escaped_file + ':' + line + '"';
      const args = [location];
      if (condition) {
        args.push('-c', '"' + condition + '"');
      }
      const result = await this.send_command('-break-insert', ...args) as Record<string, unknown> | null;

      if (result && result.bkpt) {
        const bkpt = result.bkpt as Record<string, string>;
        const bp: Breakpoint = {
          id: bkpt.number,
          file: bkpt.file || file,
          line: parseInt(bkpt.line || line.toString()),
          enabled: bkpt.enabled !== 'n',
          condition,
        };
        this.breakpoints.set(bp.id, bp);
        this.breakpoint_locations.add(bp.line);
        return { id: bp.id, file: bp.file, line: bp.line };
      }
      return null;
    } catch (err) {
      console.error('Failed to set breakpoint:', err);
      return null;
    }
  }

  async remove_breakpoint(bp_id: string): Promise<void> {
    try {
      await this.send_command('-break-delete', bp_id);
      const bp = this.breakpoints.get(bp_id);
      if (bp) {
        this.breakpoint_locations.delete(bp.line);
        this.breakpoints.delete(bp_id);
      }
    } catch (err) {
      console.error('Failed to remove breakpoint:', err);
    }
  }

  async list_breakpoints(): Promise<Breakpoint[]> {
    try {
      const raw = await this.send_command_raw('-break-list');
      const breakpoints: Breakpoint[] = [];

      // Parse each bkpt block from the raw response
      // Format: bkpt={number="1",type="breakpoint",enabled="y",file="...",line="6",...}
      const bkpt_regex = /bkpt=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
      let match: RegExpExecArray | null;
      while ((match = bkpt_regex.exec(raw)) !== null) {
        const block = match[1];
        const number = this.extract_field(block, 'number');
        const file = this.extract_field(block, 'fullname') || this.extract_field(block, 'file') || '';
        const line = this.extract_field(block, 'line');
        const enabled = this.extract_field(block, 'enabled');
        const cond = this.extract_field(block, 'cond');

        if (number) {
          breakpoints.push({
            id: number,
            file: file,
            line: parseInt(line || '0'),
            enabled: enabled !== 'n',
            condition: cond || undefined,
          });
        }
      }

      return breakpoints;
    } catch {
      return [];
    }
  }

  async get_variables(): Promise<Variable[]> {
    try {
      const raw = await this.send_command_raw('-stack-list-variables', '--simple-values');
      const variables: Variable[] = [];

      // Parse each variable tuple directly from the raw response
      // Format: {name="a",type="int",value="10"}
      const var_regex = /\{name="([^"]*)",type="([^"]*)",value="([^"]*)"\}/g;
      let match: RegExpExecArray | null;
      while ((match = var_regex.exec(raw)) !== null) {
        variables.push({
          name: match[1],
          type: match[2],
          value: match[3],
        });
      }

      return variables;
    } catch {
      return [];
    }
  }

  async evaluate_expression(expression: string): Promise<{ value: string; type: string } | null> {
    try {
      // Use -var-create to get both value and type
      const create_result = await this.send_command(
        '-var-create', '-', '*', '"' + expression + '"'
      ) as Record<string, string> | null;

      if (create_result && create_result.value !== undefined) {
        const var_name = create_result.name;
        const result = {
          value: create_result.value || '',
          type: create_result.type || 'unknown',
        };

        // Clean up the variable object
        if (var_name) {
          try {
            await this.send_command('-var-delete', var_name);
          } catch { /* ignore cleanup errors */ }
        }

        return result;
      }
      return null;
    } catch {
      return null;
    }
  }

  async get_stack_frames(): Promise<StackFrame[]> {
    try {
      const raw = await this.send_command_raw('-stack-list-frames');
      const frames: StackFrame[] = [];

      // Parse each frame block from the raw response
      // Format: frame={level="0",func="main",file="hello.c",fullname="...",line="6"}
      const frame_regex = /frame=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
      let match: RegExpExecArray | null;
      while ((match = frame_regex.exec(raw)) !== null) {
        const block = match[1];
        const level = this.extract_field(block, 'level');
        const func = this.extract_field(block, 'func') || '??';
        const file = this.extract_field(block, 'fullname') || this.extract_field(block, 'file') || '';
        const line = this.extract_field(block, 'line');

        frames.push({
          level: parseInt(level || '0'),
          func: func,
          file: file,
          line: parseInt(line || '0'),
        });
      }

      return frames;
    } catch {
      return [];
    }
  }

  private extract_field(block: string, field_name: string): string {
    const regex = new RegExp(field_name + '="([^"]*)"');
    const match = block.match(regex);
    return match ? match[1] : '';
  }

  async get_source(file_path: string): Promise<string> {
    try {
      if (fs.existsSync(file_path)) {
        return fs.readFileSync(file_path, 'utf-8');
      }
      const result = await this.send_command('-file-list-exec-source-file') as Record<string, string> | null;
      if (result && result.fullname) {
        return fs.readFileSync(result.fullname, 'utf-8');
      }
      return '';
    } catch {
      return '';
    }
  }

  async get_current_location(): Promise<{ file: string; line: number } | null> {
    try {
      const frames = await this.get_stack_frames();
      if (frames.length > 0) {
        return { file: frames[0].file, line: frames[0].line };
      }
    } catch {
      // ignore
    }

    if (this.source_file_path && this.current_line > 0) {
      return { file: this.source_file_path, line: this.current_line };
    }

    return null;
  }

  async read_memory(address: string, length: number): Promise<string> {
    try {
      const result = await this.send_command(
        '-data-read-memory', address, 'x', '1', '1', length.toString()
      ) as Record<string, unknown> | null;
      if (result && result.memory) {
        let output = '';
        const memories = Array.isArray(result.memory) ? result.memory : [result.memory];
        for (const mem of memories as Record<string, unknown>[]) {
          const addr = mem.addr || '???';
          const data = mem.data as string[] | undefined;
          output += addr + ': ' + (data ? data.join(' ') : '') + '\n';
        }
        return output;
      }
      return '';
    } catch (err: unknown) {
      return 'Error: ' + (err as Error).message;
    }
  }

  async disassemble(address: string, length: number): Promise<string> {
    try {
      await this.send_command(
        '-interpreter-exec',
        'console',
        '"disassemble ' + address + ',+' + length + '"'
      );
      return '';
    } catch (err: unknown) {
      return 'Error: ' + (err as Error).message;
    }
  }
}
