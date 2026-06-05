// Electron dev launcher — same as dev.js but for the full Electron app.
// Filters out "process not found" noise from vite-plugin-electron.

const { spawn } = require('child_process');
const os = require('os');

if (os.platform() === 'win32') {
  const child = spawn('cmd', ['/c', 'chcp 65001 >nul && npx vite'], {
    stdio: ['inherit', 'inherit', 'pipe'],
    shell: false,
  });
  child.stderr.on('data', (data) => {
    const text = data.toString();
    if (!text.includes('process') || !text.includes('not found')) {
      process.stderr.write(text);
    }
  });
  child.on('exit', (code) => process.exit(code || 0));
} else {
  const child = spawn('npx', ['vite'], {
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code) => process.exit(code || 0));
}
