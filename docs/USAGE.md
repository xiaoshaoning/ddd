# DDD TypeScript - Usage Guide

## Overview

DDD TypeScript is a graphical debugger frontend for the GNU Debugger (GDB), built with Electron, React, TypeScript, and Monaco Editor. It provides a modern, VS Code-like debugging experience inspired by the classic Data Display Debugger (DDD).

## Prerequisites

- **Node.js** 18 or higher
- **npm** 9 or higher
- **GDB** (GNU Debugger) - required for debugging real programs; not needed for browser-only development

Verify GDB is installed:

```bash
gdb --version
```

## Installation

```bash
git clone <repository-url>
cd ddd
npm install

# If Electron binary download fails due to network restrictions,
# use the Chinese mirror:
# ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

## Quick Start

### Browser Mode (no GDB required)

```bash
npm run dev
```

Open **http://localhost:5173**. Uses a mock debug session with demo C code. Ideal for UI development and testing.

### Desktop Mode (with GDB)

```bash
npm run dev:electron
```

This starts the Vite dev server, builds the Electron main process, and launches the desktop window with full GDB integration.

## Running Tests

```bash
npm test                # Run all 25 headless browser tests
npx playwright test --ui  # Run with Playwright UI
```

## Loading a Program

1. Click the **Open** button in the toolbar
2. Select an executable compiled with debug symbols (`-g` flag)
3. Source code appears in the editor; set breakpoints, then click Run

```bash
gcc -g -o my_program my_program.c
```

Test programs are provided in `tests/`:
- `hello.exe` - simple arithmetic and printf
- `func_test.exe` - nested function calls (multiply, add, compute)
- `recurse_test.exe` - recursive functions (factorial, fibonacci)

## Interface Layout

```
+------------------------------------------------------------------+
| Open  Stop  |  Run/Continue  Pause  |  Step Over  Step Into  Step Out |
+------------------------------------------------------------------+
| Font: [-] 24px [+]  ☀️  |  [Variables | Breakpoints | Memory]      |
+--------------------------+----------------------------------------+
|                          |  Local variables:                      |
|   Source Code            |    a = 10     int                      |
|   (Monaco Editor)        |    b = 20     int                      |
|                          |  Call Stack:                          |
|                          |    #0 main  at hello.c:10             |
+--------------------------+----------------------------------------+
| ● Ready. Open a program to start.                                 |
+------------------------------------------------------------------+
```

- **Toolbar** (top): Debug control buttons
- **Source Toolbar**: Font size controls and theme toggle
- **Source Viewer** (left, ~70%): Monaco Editor with syntax highlighting, line numbers, breakpoint gutter, and hover tooltips
- **Side Panel** (right, ~30%): Tabbed view for variables, breakpoints, and memory
- **Status Bar** (bottom): Debug state indicator with color-coded status
- **Resize Handle**: Drag the divider between panels

## Debug Controls

Run and Continue are combined into a single button that changes based on debug state:

| State | Button Shows | Action |
|---|---|---|
| Idle (loaded, not started) | Run | Start program |
| Paused (at breakpoint) | Continue | Resume execution |
| Running | Run (disabled) | - |
| Exited | Run | Restart program |

| Button | Description | GDB Command |
|---|---|---|
| Pause | Interrupt running program | `-exec-interrupt` (Ctrl+C) |
| Step Over | Execute current line; step over function calls | `-exec-next` |
| Step Into | Step into function calls | `-exec-step` |
| Step Out | Run until current function returns | `-exec-finish` |
| Stop | End debug session, clear all state | `-gdb-exit` |

### Step Button Behaviors

**Step Over** on a `return` statement auto-skips the closing brace and returns to the caller. No need to click twice.

**Step Into** on library calls (like `printf`): If GDB lands in system code without source, the debugger automatically steps back out to your code.

**Step Out** inside `main()`: Since there is no caller, falls back to Step Over.

Full specification: `docs/STEP_BEHAVIOR_SPEC.md`

## Breakpoints

### Setting Breakpoints

Click in the **line number gutter** to toggle a breakpoint. A red circle glyph appears.

### Managing Breakpoints

Switch to the **Breakpoints** tab to:
- View all breakpoints with file name, line number, and condition
- Remove individual breakpoints

Breakpoints are cleared when you Stop or open a new program.

## Variable Inspection

When paused at a breakpoint:

1. Switch to the **Variables** tab
2. Local variables shown with **Name**, **Value**, and **Type** columns
3. **Call Stack** shows current execution stack; click header to collapse/expand
4. **Hover** over any variable name in the source editor to see its value in a tooltip, including type information and first elements of arrays

## Memory Viewer

1. Switch to the **Memory** tab
2. Enter an address (`0x400000` or `&variable_name`)
3. Set length and choose **Hex Dump** or **Disassembly**
4. Click **Read**

## Editor Customization

### Font Size

Use the **[-] / [+]** buttons in the source toolbar to adjust font size (10-72px, default 24px). Click the number to reset to default.

### Theme

Click the **☀️/🌙** button in the source toolbar to toggle between dark and light themes. Preference is saved.

## Syntax Highlighting

Monaco Editor auto-detects language by file extension:

| Extension | Language |
|---|---|
| `.c`, `.h` | C |
| `.cpp`, `.cc`, `.cxx`, `.hpp` | C++ |
| `.rs` | Rust |
| `.go` | Go |
| `.py` | Python |
| `.js`, `.ts` | JavaScript / TypeScript |
| `.java` | Java |
| `.cs` | C# |

## Status Bar Indicators

| Color | State | Description |
|---|---|---|
| Gray | idle | No program loaded |
| Green (pulsing) | running | Program executing |
| Yellow | paused | Stopped at breakpoint or after step |
| Red | exited | Program finished |

## Building for Distribution

```bash
npm run build
npx electron-builder
```

Output: `release/` directory.

## Project Architecture

```
ddd/
├── electron/                  # Electron main process
│   ├── main.ts                # Window, IPC handlers, single-instance lock
│   ├── preload.ts             # contextBridge API (gdbAPI)
│   └── gdb/
│       └── gdb-controller.ts  # GDB/MI protocol, spawn, parse, commands
├── src/                       # React renderer
│   ├── main.tsx               # Entry point, mock API injection
│   ├── App.tsx                # Layout, state machine, event wiring
│   ├── mock_api.ts            # Mock GDB for browser dev
│   ├── types.ts               # TypeScript interfaces
│   ├── components/
│   │   ├── Toolbar.tsx             # Combined Run/Continue, debug buttons
│   │   ├── SourceViewer.tsx        # Monaco Editor, hover tooltips, font/theme
│   │   ├── BreakpointManager.tsx   # Breakpoint table
│   │   ├── VariableInspector.tsx   # Variables + call stack
│   │   └── MemoryViewer.tsx        # Hex dump / disassembly
│   └── styles/
│       └── index.css          # Dark + light theme, CSS variables
├── scripts/                   # Dev launchers with stderr filtering
│   ├── dev.js                 # Browser mode
│   └── dev-electron.js        # Electron desktop mode
├── tests/                     # Test suite
│   ├── debug-gui.spec.ts      # 10 core UI tests
│   ├── step-behavior.spec.ts  # 15 step button behavior tests
│   ├── hello.c / hello.exe
│   ├── func_test.c / func_test.exe
│   └── recurse_test.c / recurse_test.exe
├── docs/
│   ├── USAGE.md               # This document
│   └── STEP_BEHAVIOR_SPEC.md  # Step button specification
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## GDB / MI Protocol

| MI Command | Purpose |
|---|---|
| `-exec-run` | Start program |
| `-exec-continue` | Continue after breakpoint |
| `-exec-next` | Step over |
| `-exec-step` | Step into |
| `-exec-finish` | Step out |
| `-exec-interrupt` | Pause program |
| `-break-insert` | Set breakpoint |
| `-break-delete` | Remove breakpoint |
| `-break-list` | List breakpoints |
| `-stack-list-frames` | Get call stack |
| `-stack-list-variables` | Get local variables |
| `-var-create` | Evaluate expression with type |
| `-var-delete` | Clean up variable object |
| `-data-read-memory` | Read raw memory |
| `-file-list-exec-source-files` | Detect source files |

## Troubleshooting

### Console noise on Windows

If you see `"The process X not found"` messages on startup, use `npm run dev` or `npm run dev:electron` which filter this harmless vite-plugin-electron noise.

### Electron fails to download

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install electron
```

### GDB not found

```bash
where gdb          # Windows
which gdb          # Linux / macOS
```

### Source code not displayed

Compile with debug symbols:

```bash
gcc -g -o program program.c
```

### Port already in use

Vite auto-uses the next available port (5174, 5175, ...).

## Coding Standards

- **snake_case** for all variables, functions, and methods
- **PascalCase** for React components and TypeScript interfaces
- No Chinese characters in comments or console output
- All public GDB API methods use snake_case (`step_over`, `set_breakpoint`, etc.)

## License

GNU General Public License v3.0
