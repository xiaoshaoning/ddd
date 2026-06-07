import { contextBridge, ipcRenderer } from 'electron';

export interface GDBAPI {
  start: (programPath: string) => Promise<boolean>;
  stop: () => Promise<void>;
  run: () => Promise<void>;
  pause: () => Promise<void>;
  continue: () => Promise<void>;
  step_over: () => Promise<void>;
  step_into: () => Promise<void>;
  step_out: () => Promise<void>;
  set_breakpoint: (file: string, line: number, condition?: string) => Promise<{ id: string; file: string; line: number } | null>;
  remove_breakpoint: (bpId: string) => Promise<void>;
  list_breakpoints: () => Promise<Array<{ id: string; file: string; line: number; enabled: boolean; condition?: string }>>;
  set_watchpoint: (expression: string) => Promise<{ id: string; expression: string } | null>;
  list_watchpoints: () => Promise<Array<{ id: string; expression: string; type: string }>>;
  get_variables: () => Promise<Array<{ name: string; value: string; type: string }>>;
  evaluate_expression: (expression: string) => Promise<{ value: string; type: string } | null>;
  get_stack_frames: () => Promise<Array<{ level: number; func: string; file: string; line: number }>>;
  get_source: (filePath: string) => Promise<string>;
  get_current_location: () => Promise<{ file: string; line: number } | null>;
  read_memory: (address: string, length: number) => Promise<string>;
  disassemble: (address: string, length: number) => Promise<string>;
  get_source_file_path: () => Promise<string | null>;
  get_breakpoint_locations: () => Promise<Set<number>>;
  send_cli_command: (command: string) => Promise<string>;
  on_output: (callback: (data: string) => void) => () => void;
  on_stopped: (callback: (info: { reason: string; file?: string; line?: number }) => void) => () => void;
  on_running: (callback: () => void) => () => void;
  on_exited: (callback: () => void) => () => void;
  open_file_dialog: () => Promise<string | null>;
}

const api: GDBAPI = {
  start: (programPath) => ipcRenderer.invoke('gdb:start', programPath),
  stop: () => ipcRenderer.invoke('gdb:stop'),
  run: () => ipcRenderer.invoke('gdb:run'),
  pause: () => ipcRenderer.invoke('gdb:pause'),
  continue: () => ipcRenderer.invoke('gdb:continue'),
  step_over: () => ipcRenderer.invoke('gdb:step_over'),
  step_into: () => ipcRenderer.invoke('gdb:step_into'),
  step_out: () => ipcRenderer.invoke('gdb:step_out'),
  set_breakpoint: (file, line, condition) => ipcRenderer.invoke('gdb:set_breakpoint', file, line, condition),
  remove_breakpoint: (bpId) => ipcRenderer.invoke('gdb:remove_breakpoint', bpId),
  list_breakpoints: () => ipcRenderer.invoke('gdb:list_breakpoints'),
  set_watchpoint: (expression) => ipcRenderer.invoke('gdb:set_watchpoint', expression),
  list_watchpoints: () => ipcRenderer.invoke('gdb:list_watchpoints'),
  get_variables: () => ipcRenderer.invoke('gdb:get_variables'),
  evaluate_expression: (expression) => ipcRenderer.invoke('gdb:evaluate_expression', expression),
  get_stack_frames: () => ipcRenderer.invoke('gdb:get_stack_frames'),
  get_source: (filePath) => ipcRenderer.invoke('gdb:get_source', filePath),
  get_current_location: () => ipcRenderer.invoke('gdb:get_current_location'),
  read_memory: (address, length) => ipcRenderer.invoke('gdb:read_memory', address, length),
  disassemble: (address, length) => ipcRenderer.invoke('gdb:disassemble', address, length),
  get_source_file_path: () => ipcRenderer.invoke('gdb:get_source_file_path'),
  get_breakpoint_locations: () => ipcRenderer.invoke('gdb:get_breakpoint_locations'),
  send_cli_command: (command: string) => ipcRenderer.invoke('gdb:send_cli_command', command),
  on_output: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on('gdb:output', handler);
    return () => ipcRenderer.removeListener('gdb:output', handler);
  },
  on_stopped: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, info: any) => callback(info);
    ipcRenderer.on('gdb:stopped', handler);
    return () => ipcRenderer.removeListener('gdb:stopped', handler);
  },
  on_running: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('gdb:running', handler);
    return () => ipcRenderer.removeListener('gdb:running', handler);
  },
  on_exited: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('gdb:exited', handler);
    return () => ipcRenderer.removeListener('gdb:exited', handler);
  },
  open_file_dialog: () => ipcRenderer.invoke('dialog:openFile'),
};

contextBridge.exposeInMainWorld('gdbAPI', api);
