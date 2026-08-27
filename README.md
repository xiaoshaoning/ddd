# ddd for Windows

A graphical debugger frontend for [GDB](https://www.gnu.org/software/gdb/) (GNU Debugger), inspired by the classic [Data Display Debugger (DDD)](https://www.gnu.org/software/ddd/). Built with Electron, React, TypeScript, and Monaco Editor.

## Features

- **Source Code Viewer** — Syntax-highlighted editor powered by Monaco Editor (VS Code engine)
- **Breakpoints** — Click the line gutter to toggle; manage in the Breakpoints tab
- **Step Debugging** — Step Over, Step Into, Step Out with smart auto-behaviors
  - Step Over on `return` auto-skips the closing brace back to the caller
  - Step Into on library calls auto-steps back out
  - Step Out in `main()` falls back to Step Over
- **Run/Continue Combined Button** — Changes label based on debug state
- **Variable Inspection** — Local variables with Name/Value/Type columns and Call Stack
- **Variable Hover Tooltips** — Hover any variable name to see its value and type
- **Watchpoints** — Watch variables and auto-refresh values on every stop
- **Memory Viewer** — Hex dump and disassembly at arbitrary addresses
- **Data Structure Visualization** — Visualize linked structures (linked lists, trees, graphs) as an interactive graph with pan/zoom, drag, and hover tooltips showing field details; auto-refreshes on every stop
- **GDB CLI Shell** — Interactive GDB command input at the bottom of the window
- **biogoo Color Scheme** — Default light theme based on the [biogoo Vim color scheme](https://github.com/bdesham/biogoo); toggle to dark mode
- **Font Size Controls** — Adjustable from 10-72px (default 24px)
- **Resizable Panels** — Drag to resize source editor and side panel

## Screenshots

<!-- TODO: add screenshots -->

## Prerequisites

- **Windows** (primary target; also runs on Linux/macOS)
- **GDB** (GNU Debugger) with MinGW or MSYS2
- **Node.js** 18+

## Quick Start

### Download (Windows)

Download the latest release from [Releases](../../releases) and run `ddd for Windows.exe`.

### Run from Source

```bash
git clone https://github.com/xiaoshaoning/ddd.git
cd ddd
npm install

# Browser mode (no GDB needed, mock debug session)
npm run dev

# Desktop mode (with GDB)
npm run dev:electron
```

## Usage

### Opening a Program

1. Click **Open** and select a compiled executable
2. Source code loads automatically from debug symbols
3. Click the gutter to set breakpoints
4. Click **Run** (or **Continue**) to start debugging

Compile your C program with debug symbols:

```bash
gcc -g -o my_program my_program.c
```

### Debug Controls

| State | Button | Action |
|---|---|---|
| Idle | ▶ Run | Start program |
| Paused | ⏭ Continue | Resume |
| Running | — (disabled) | — |
| Exited | ▶ Run | Restart |

| Button | Description |
|---|---|
| ⏸ Pause | Interrupt running program |
| ↷ Step Over | Execute current line |
| ↓ Step Into | Step into function call |
| ↑ Step Out | Run until function returns |
| ⏹ Stop | End debug session |

### Side Panel Tabs

| Tab | Content |
|---|---|
| **Variables** | Local variables + Call Stack |
| **Breakpoints** | Breakpoint list with file and line |
| **Memory** | Hex dump / disassembly viewer |
| **Watch** | Watch expressions with auto-refreshing values |
| **Viz** | Data structure graph (enter an expression, pick Tree/Force layout and max depth)

### GDB Shell

Type GDB commands directly at the bottom panel. Press Enter to execute, Up/Down for history, empty Enter repeats last command.

### Keyboard Shortcuts

| Key | Action |
|---|---|
| F5 | Run / Continue |
| F10 | Step Over |
| F11 | Step Into |
| Shift+F11 | Step Out |

## Test Programs

Pre-compiled test programs in `tests/`:

| Program | Description |
|---|---|
| `hello.exe` | Simple arithmetic and printf |
| `func_test.exe` | Nested function calls (multiply, add, compute) |
| `recurse_test.exe` | Recursive functions (factorial, fibonacci) |
| `watch_test.exe` | Variable modifications for watchpoint testing |

## Running Tests

```bash
npm test                # 42 headless browser tests
npx playwright test --ui  # Interactive test runner
```

On a fresh machine, install the Playwright browsers first (the CDN can be slow,
so be patient):

```bash
npx playwright install chromium
```

## Build from Source

```bash
npm install
npm run build
npx electron-builder    # Package as Windows installer
```

## Project Structure

```
ddd/
├── electron/                  # Electron main process
│   ├── main.ts                # Window, IPC, single-instance lock
│   ├── preload.ts             # contextBridge API
│   ├── gdb-api.ts             # Shared GDB API types (also used by renderer)
│   └── gdb/gdb-controller.ts  # GDB/MI protocol engine
├── src/                       # React renderer
│   ├── App.tsx                # Layout and state machine
│   ├── main.tsx               # Entry with mock API injection
│   ├── mock_api.ts            # Mock GDB for browser dev
│   └── components/
│       ├── Toolbar.tsx             # Combined Run/Continue, debug buttons
│       ├── SourceViewer.tsx        # Monaco Editor with hover tooltips
│       ├── BreakpointManager.tsx   # Breakpoint list
│       ├── VariableInspector.tsx   # Variables + call stack
│       ├── MemoryViewer.tsx        # Hex dump / disassembly
│       ├── WatchpointManager.tsx   # Watch expressions
│       ├── GraphViewer.tsx         # D3 graph with pan/zoom and tooltips
│       └── GDBShell.tsx            # Interactive GDB CLI
├── scripts/                   # Dev launchers
├── tests/                     # Playwright tests + C test programs
├── docs/                      # Usage guide + step behavior spec + data viz design
└── package.json
```

## Documentation

- [Usage Guide](docs/USAGE.md)
- [Step Button Behavior Specification](docs/STEP_BEHAVIOR_SPEC.md)
- [Data Structure Visualization Design](docs/DATA_VIZ_DESIGN.md)

## Coding Standards

- **snake_case** for all variables, functions, and methods
- **PascalCase** for React components and TypeScript interfaces
- No Chinese characters in comments or console output

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE)

## Acknowledgments

- [DDD](https://www.gnu.org/software/ddd/) — the original Data Display Debugger
- [biogoo](https://github.com/bdesham/biogoo) — Vim color scheme (default theme)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — VS Code's editor
