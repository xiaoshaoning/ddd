import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { GDBController } from './gdb/gdb-controller';

// Prevent multiple instances
const got_lock = app.requestSingleInstanceLock();
if (!got_lock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;
let gdbController: GDBController | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'DDD TypeScript - GDB Debugger',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: undefined,
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---- GDB IPC handlers ----

ipcMain.handle('gdb:start', async (_event, programPath: string) => {
  if (gdbController) {
    gdbController.stop();
  }
  gdbController = new GDBController();
  gdbController.on('output', (data) => {
    mainWindow?.webContents.send('gdb:output', data);
  });
  gdbController.on('stopped', (info) => {
    mainWindow?.webContents.send('gdb:stopped', info);
  });
  gdbController.on('running', () => {
    mainWindow?.webContents.send('gdb:running');
  });
  gdbController.on('exited', () => {
    mainWindow?.webContents.send('gdb:exited');
  });
  return gdbController.start(programPath);
});

ipcMain.handle('gdb:stop', async () => {
  gdbController?.stop();
  gdbController = null;
});

ipcMain.handle('gdb:run', async () => {
  try { return await gdbController?.run(); } catch { /* ignore */ }
});

ipcMain.handle('gdb:pause', async () => {
  try { return await gdbController?.pause(); } catch { /* ignore */ }
});

ipcMain.handle('gdb:continue', async () => {
  try { return await gdbController?.continue_command(); } catch { /* ignore */ }
});

ipcMain.handle('gdb:step_over', async () => {
  try { return await gdbController?.step_over(); } catch { /* ignore */ }
});

ipcMain.handle('gdb:step_into', async () => {
  try { return await gdbController?.step_into(); } catch { /* ignore */ }
});

ipcMain.handle('gdb:step_out', async () => {
  try { return await gdbController?.step_out(); } catch { /* ignore */ }
});

ipcMain.handle('gdb:set_breakpoint', async (_event, file: string, line: number, condition?: string) => {
  try { return await gdbController?.set_breakpoint(file, line, condition); } catch { return null; }
});

ipcMain.handle('gdb:remove_breakpoint', async (_event, bpId: string) => {
  try { return await gdbController?.remove_breakpoint(bpId); } catch { /* ignore */ }
});

ipcMain.handle('gdb:list_breakpoints', async () => {
  try { return await gdbController?.list_breakpoints(); } catch { return []; }
});

ipcMain.handle('gdb:get_variables', async () => {
  try { return await gdbController?.get_variables(); } catch { return []; }
});

ipcMain.handle('gdb:evaluate_expression', async (_event, expression: string) => {
  try { return await gdbController?.evaluate_expression(expression); } catch { return null; }
});

ipcMain.handle('gdb:get_stack_frames', async () => {
  try { return await gdbController?.get_stack_frames(); } catch { return []; }
});

ipcMain.handle('gdb:get_source', async (_event, filePath: string) => {
  return gdbController?.get_source(filePath);
});

ipcMain.handle('gdb:get_current_location', async () => {
  return gdbController?.get_current_location();
});

ipcMain.handle('gdb:read_memory', async (_event, address: string, length: number) => {
  return gdbController?.read_memory(address, length);
});

ipcMain.handle('gdb:disassemble', async (_event, address: string, length: number) => {
  return gdbController?.disassemble(address, length);
});

ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Executable',
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Executables', extensions: ['exe', 'out', 'app'] },
    ],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('gdb:get_source_file_path', async () => {
  return gdbController?.get_source_file_path();
});

ipcMain.handle('gdb:send_cli_command', async (_event, command: string) => {
  return gdbController?.send_cli_command(command) || 'GDB not running';
});

ipcMain.handle('gdb:get_breakpoint_locations', async () => {
  return gdbController?.breakpoint_locations;
});

// ---- App lifecycle ----

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  gdbController?.stop();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
