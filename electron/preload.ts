import { contextBridge, ipcRenderer } from 'electron';
import type { GDBAPI, StoppedInfo } from './gdb-api';

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
  extract_graph: (expression, max_depth) => ipcRenderer.invoke('gdb:extract_graph', expression, max_depth),
  on_output: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string) => callback(data);
    ipcRenderer.on('gdb:output', handler);
    return () => ipcRenderer.removeListener('gdb:output', handler);
  },
  on_stopped: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, info: StoppedInfo) => callback(info);
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
