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
        shell: false,
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
      for (const name of fullnames) {
        // Unescape MI C-string first to get the real path
        const unescaped = this.parse_string('"' + name + '"');
        if (!this.is_system_path(unescaped)) {
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

  /**
   * Whether a file path belongs to system code (library/CRT/OS) rather
   * than the user's program. Keep in sync with is_system_path in
   * src/App.tsx.
   */
  private is_system_path(file_path: string): boolean {
    const normalized = file_path.replace(/\\/g, '/').toLowerCase();
    const markers = [
      '/usr/', '/build/', '/crt/',
      '/windows/system32/', '/windows/syswow64/',
      'mingw', 'msys', 'dllcrt',
    ];
    return markers.some(m => normalized.includes(m)) || normalized.endsWith('.dll');
  }

  stop(): void {
    if (this.process) {
      try {
        this.process.stdin?.write('-gdb-exit\n');
      } catch {
        // ignore
      }
      // Give GDB a moment to exit gracefully, then force kill if needed
      const proc = this.process;
      setTimeout(() => {
        if (proc && proc.exitCode === null) {
          try { proc.kill(); } catch { /* already dead */ }
        }
      }, 1000);
      this.process = null;
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

  /**
   * Parse a GDB/MI result record (the text after ^done / ^error) into a
   * nested structure of objects, arrays, strings and bare scalars.
   *
   * Handles all three MI value forms plus the `name={...}` list items GDB
   * emits (e.g. -var-list-children):
   *   - flat pairs:   name="value"  or  name=123
   *   - tuples:       name={...}
   *   - lists:        name=[...]  (elements: tuples, strings, or name=value)
   */
  private parse_result(result: string): unknown {
    const trimmed = result.trim();
    if (!trimmed) return null;

    // Bare tuple/list at the top level
    if (trimmed.startsWith('[')) {
      const value = this.parse_mi_value(trimmed, 0);
      return value ? value.value : [];
    }
    if (trimmed.startsWith('{')) {
      const value = this.parse_mi_value(trimmed, 0);
      return value ? value.value : {};
    }

    // Skip the status word (e.g. "done" in "done,bkpt={...}") up to the
    // first '=', then parse the remaining name=value assignments. The
    // status word may already be gone, leaving a leading comma.
    const first_eq = trimmed.indexOf('=');
    if (first_eq === -1) return trimmed;
    const status_end = trimmed.lastIndexOf(',', first_eq);
    return this.parse_mi_assignments(trimmed.substring(status_end + 1));
  }

  /** Parse a sequence of `name=value,name=value,...` assignments. */
  private parse_mi_assignments(str: string): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    let i = 0;
    while (i < str.length) {
      if (str[i] === ',') { i++; continue; }
      while (i < str.length && /\s/.test(str[i])) i++;
      if (i >= str.length) break;

      const name_start = i;
      while (i < str.length && /[\w.-]/.test(str[i])) i++;
      const name = str.substring(name_start, i);
      if (!name) { i++; continue; } // malformed input — skip
      while (i < str.length && /\s/.test(str[i])) i++;
      if (str[i] !== '=') { i++; continue; } // skip malformed input
      i++;

      const value = this.parse_mi_value(str, i);
      if (value) {
        out[name] = value.value;
        i = value.next;
      } else {
        i++;
      }
    }
    return out;
  }

  /** Parse a single MI value starting at `start`; returns it and the cursor. */
  private parse_mi_value(
    str: string,
    start: number
  ): { value: unknown; next: number } | undefined {
    let i = start;
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) return undefined;
    const c = str[i];

    if (c === '"') {
      const end = this.find_string_end(str, i);
      return { value: this.parse_string(str.substring(i, end + 1)), next: end + 1 };
    }

    if (c === '{') {
      const end = this.find_balanced(str, i, '{', '}');
      const value = this.parse_mi_assignments(str.substring(i + 1, end));
      return { value, next: end + 1 };
    }

    if (c === '[') {
      const end = this.find_balanced(str, i, '[', ']');
      const value = this.parse_mi_list(str.substring(i + 1, end));
      return { value, next: end + 1 };
    }

    // Bare scalar (number, keyword, ...)
    const val_start = i;
    while (i < str.length && str[i] !== ',' && str[i] !== '}' && str[i] !== ']') i++;
    return { value: str.substring(val_start, i).trim(), next: i };
  }

  /** Parse the comma-separated elements of a [...] list. */
  private parse_mi_list(inner: string): unknown[] {
    const items: unknown[] = [];
    let i = 0;
    while (i < inner.length) {
      if (inner[i] === ',') { i++; continue; }
      while (i < inner.length && /\s/.test(inner[i])) i++;
      if (i >= inner.length) break;

      const c = inner[i];
      if (c === '{' || c === '"' || c === '[') {
        const value = this.parse_mi_value(inner, i);
        if (value) { items.push(value.value); i = value.next; }
        else i++;
      } else {
        // name=value item (e.g. child={...}) or a bare scalar
        const name_start = i;
        while (i < inner.length && /[\w.-]/.test(inner[i])) i++;
        while (i < inner.length && /\s/.test(inner[i])) i++;
        if (inner[i] === '=') {
          i++;
          const value = this.parse_mi_value(inner, i);
          if (value) { items.push(value.value); i = value.next; }
        } else {
          const val_start = name_start;
          while (i < inner.length && inner[i] !== ',') i++;
          items.push(inner.substring(val_start, i).trim());
        }
      }
    }
    return items;
  }

  /** Find the closing quote of a C string, honoring backslash escapes. */
  private find_string_end(str: string, open: number): number {
    for (let i = open + 1; i < str.length; i++) {
      if (str[i] === '\\') { i++; continue; }
      if (str[i] === '"') return i;
    }
    return str.length - 1;
  }

  /** Find the matching close bracket, skipping over quoted strings. */
  private find_balanced(str: string, open: number, open_ch: string, close_ch: string): number {
    let depth = 0;
    for (let i = open; i < str.length; i++) {
      if (str[i] === '"') {
        i = this.find_string_end(str, i);
        continue;
      }
      if (str[i] === open_ch) depth++;
      else if (str[i] === close_ch) {
        depth--;
        if (depth === 0) return i;
      }
    }
    return str.length - 1;
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

  async set_watchpoint(expression: string): Promise<{ id: string; expression: string } | null> {
    try {
      const result = await this.send_command('-break-watch', '"' + expression + '"') as Record<string, unknown> | null;
      if (result && result.wpt) {
        const wpt = result.wpt as Record<string, string>;
        return { id: wpt.number, expression: expression };
      }
      return null;
    } catch (err) {
      console.error('Failed to set watchpoint:', err);
      return null;
    }
  }

  async list_watchpoints(): Promise<{ id: string; expression: string; type: string }[]> {
    try {
      const raw = await this.send_command_raw('-break-list');
      const watchpoints: { id: string; expression: string; type: string }[] = [];
      // Watchpoints have type="watchpoint" or "hw watchpoint" in bkpt blocks
      const bkpt_regex = /bkpt=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
      let match: RegExpExecArray | null;
      while ((match = bkpt_regex.exec(raw)) !== null) {
        const block = match[1];
        const bkpt_type = this.extract_field(block, 'type') || '';
        if (bkpt_type.includes('watchpoint')) {
          const number = this.extract_field(block, 'number');
          const original_loc = this.extract_field(block, 'original-location') ||
                               this.extract_field(block, 'what') || '';
          if (number) {
            watchpoints.push({ id: number, expression: original_loc, type: bkpt_type });
          }
        }
      }
      return watchpoints;
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
        '-data-read-memory-bytes', address, length.toString()
      ) as Record<string, unknown> | null;
      if (result && result.memory) {
        let output = '';
        const memories = Array.isArray(result.memory) ? result.memory : [result.memory];
        for (const mem of memories as Record<string, unknown>[]) {
          const begin = (mem.begin as string) || '???';
          const contents = (mem.contents as string) || '';
          // Format as 16-byte rows: 0x...: 0xf6 0x7f 0x00 ...
          const bytes = contents.match(/.{2}/g) || [];
          const base = parseInt(begin, 16) || 0;
          for (let i = 0; i < bytes.length; i += 16) {
            const row = bytes.slice(i, i + 16);
            const addr = (base + i).toString(16).padStart(16, '0');
            output += '0x' + addr + ': ' + row.map(b => '0x' + b).join(' ') + '\n';
          }
        }
        return output.trimEnd();
      }
      return '';
    } catch (err: unknown) {
      return 'Error: ' + (err as Error).message;
    }
  }

  /**
   * Run a CLI command through -interpreter-exec console and collect the
   * console output. The text of a console command arrives as separate
   * ~"..." (and &"...") records, never embedded in the ^done response,
   * so we capture it by listening to 'output' events while the command
   * is in flight.
   */
  private async send_console_capture(command: string): Promise<string> {
    const output_parts: string[] = [];
    const on_output = (data: string) => {
      output_parts.push(data);
    };
    this.on('output', on_output);
    try {
      await this.send_command(
        '-interpreter-exec', 'console',
        '"' + command.replace(/"/g, '\\"') + '"'
      );
    } finally {
      this.off('output', on_output);
    }
    return output_parts.join('');
  }

  async disassemble(address: string, length: number): Promise<string> {
    try {
      const result = await this.send_console_capture(
        'disassemble ' + address + ',+' + length
      );
      return result || '(no output)';
    } catch (err: unknown) {
      return 'Error: ' + (err as Error).message;
    }
  }

  async send_cli_command(command: string): Promise<string> {
    try {
      const result = await this.send_console_capture(command);
      return result || '(no output)';
    } catch (err: unknown) {
      return 'Error: ' + (err as Error).message;
    }
  }

  // ---- Data Structure Graph Extraction ----

  async extract_graph(
    expression: string,
    max_depth: number = 10,
    max_nodes: number = 200
  ): Promise<{ nodes: { id: string; label: string; fields: { name: string; value: string; type: string }[]; address: string; type_name: string }[]; edges: { source: string; target: string; label: string }[] }> {
    const nodes: Map<string, { id: string; label: string; fields: { name: string; value: string; type: string }[]; address: string; type_name: string }> = new Map();
    const edges: { source: string; target: string; label: string }[] = [];
    const visited = new Set<string>();

    const walk = async (
      var_name: string,
      c_expr: string,
      info: { value: string; type: string; numchild: number },
      depth: number
    ): Promise<string | null> => {
      if (depth > max_depth || nodes.size >= max_nodes) return null;
      if (visited.has(var_name)) return null;
      visited.add(var_name);

      const is_ptr = info.type.includes('*');

      // Node identity: the address of the data this node represents.
      // For pointers that is the pointed-to address (the value itself);
      // for everything else we ask GDB for &(c_expr).
      let address = '';
      if (is_ptr) {
        const hex = info.value.match(/0x[0-9a-fA-F]+/);
        address = hex ? hex[0] : '';
      } else {
        address = await this.get_address_of(c_expr);
      }
      if (!address) address = '?';
      const node_key = address !== '?' ? address.toLowerCase() : 'var:' + var_name;

      // Same address reached twice (shared struct / cycle) is the same node
      const existing = nodes.get(node_key);
      if (existing) return node_key;

      const node_id = 'n' + nodes.size;
      const fields: { name: string; value: string; type: string }[] = [];
      const pending_children: { var_name: string; c_expr: string; info: { value: string; type: string; numchild: number }; label: string }[] = [];

      if (info.numchild > 0) {
        try {
          const raw = await this.send_command_raw(
            '-var-list-children', '--simple-values', var_name
          );
          for (const block of this.parse_child_blocks(raw)) {
            const child_var = this.extract_field(block, 'name');
            const child_exp = this.extract_field(block, 'exp');
            const child_value = this.extract_field(block, 'value');
            const child_type = this.extract_field(block, 'type');
            const child_numchild = parseInt(this.extract_field(block, 'numchild') || '0');
            if (!child_var) continue;

            fields.push({ name: child_exp || child_var, value: child_value, type: child_type });

            // Follow non-NULL pointer fields as edges to other nodes
            const child_ptr = child_value.match(/0x[0-9a-fA-F]+/);
            if (child_type.includes('*') && child_exp && child_ptr && child_ptr[0] !== '0x0') {
              // Build the C expression for this child (used to read addresses
              // of non-pointer descendants): (*(parent)).field for pointer
              // parents, (parent).field otherwise.
              const parent_expr = is_ptr ? '(*(' + c_expr + '))' : '(' + c_expr + ')';
              pending_children.push({
                var_name: child_var,
                c_expr: parent_expr + '.' + child_exp,
                info: { value: child_value, type: child_type, numchild: child_numchild },
                label: child_exp,
              });
            }
          }
        } catch {
          // Skip fields that can't be read
        }
      }

      nodes.set(node_key, {
        id: node_id,
        label: info.value,
        fields,
        address,
        type_name: info.type,
      });

      for (const child of pending_children) {
        const target_key = await walk(child.var_name, child.c_expr, child.info, depth + 1);
        if (target_key) {
          const target = nodes.get(target_key);
          if (target) edges.push({ source: node_id, target: target.id, label: child.label });
        }
      }

      return node_key;
    };

    let root_result: Record<string, string> | null = null;
    try {
      root_result = await this.send_command(
        '-var-create', '-', '*', '"' + expression.replace(/"/g, '\\"') + '"'
      ) as Record<string, string> | null;

      if (!root_result || !root_result.name) {
        return { nodes: [], edges: [] };
      }

      await walk(root_result.name, expression, {
        value: root_result.value || '?',
        type: root_result.type || 'unknown',
        numchild: parseInt(root_result.numchild || '0'),
      }, 0);
    } catch {
      // Expression not readable in the current frame
    } finally {
      if (root_result && root_result.name) {
        try { await this.send_command('-var-delete', root_result.name); } catch { /* ignore */ }
      }
    }

    return { nodes: Array.from(nodes.values()), edges };
  }

  /**
   * Extract the individual child={...} blocks from a
   * -var-list-children response.
   */
  private parse_child_blocks(raw: string): string[] {
    const blocks: string[] = [];
    const child_regex = /child=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
    let match: RegExpExecArray | null;
    while ((match = child_regex.exec(raw)) !== null) {
      blocks.push(match[1]);
    }
    return blocks;
  }

  /**
   * Ask GDB for the address of a C expression via 'print &(expr)' and
   * return the hex address (or '' if it can't be determined).
   */
  private async get_address_of(c_expr: string): Promise<string> {
    try {
      const out = await this.send_console_capture('print &(' + c_expr + ')');
      const addr_match = out.match(/0x[0-9a-fA-F]+/);
      return addr_match ? addr_match[0] : '';
    } catch {
      return '';
    }
  }
}
