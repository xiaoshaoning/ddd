// Dev server launcher — sets console to UTF-8 and filters known-harmless
// process-not-found noise from vite-plugin-electron on Windows restarts.

const { spawn } = require('child_process');
const os = require('os');

if (os.platform() === 'win32') {
  const child = spawn('cmd', ['/c', 'chcp 65001 >nul && npx vite'], {
    stdio: ['inherit', 'inherit', 'pipe'],
    shell: false,
  });
  // Filter out vite-plugin-electron process-not-found noise
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
