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
# Clone the repository
git clone <repository-url>
cd ddd

# Install dependencies
npm install

# If Electron binary download fails due to network restrictions,
# use the Chinese mirror:
# ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

## Quick Start

### Browser Mode (no GDB required)

Run the React UI in your browser with a mock debug session:

```bash
npm run dev
```

Open **http://localhost:5173** in your browser. The app loads with demo C source code, simulated variables, and mock breakpoints. Use this mode for UI development and testing.

### Desktop Mode (with GDB)

Launch the full Electron desktop application:

```bash
npx vite
```

This command:
1. Starts the Vite dev server for hot-reload
2. Builds the Electron main process
3. Launches the Electron window

## Loading a Program

1. Click the **Open** button in the toolbar
2. Select an executable compiled with debug symbols (use `-g` flag with gcc/clang)
3. The source code appears in the main editor panel

Example: compile a C program for debugging:

```bash
gcc -g -o my_program my_program.c
```

## Interface Layout

```
+-----------------------------------------------------------+
| Open  Stop  |  Run  Pause  Continue                        |
|             |  Step Over  Step Into  Step Out              |
+-----------------------------------------------------------+
|                        |  [Variables | Breakpoints | Mem]  |
|    Source Code         |  ---------------------------------|
|    (Monaco Editor)     |  Local variables and call stack   |
|                        |  or breakpoint list               |
|                        |  or memory viewer                 |
+-----------------------------------------------------------+
| (status indicator) Ready. Open a program to start.         |
+-----------------------------------------------------------+
```

- **Toolbar** (top): All debug control buttons
- **Source Viewer** (left, ~70%): Monaco Editor with syntax highlighting, line numbers, and breakpoint gutter
- **Side Panel** (right, ~30%): Tabbed view for variables, breakpoints, and memory
- **Status Bar** (bottom): Current debug state indicator
- **Resize Handle**: Drag the divider between panels to resize

## Debug Controls

| Button | Shortcut | Description |
|---|---|---|
| Run | F5 | Start program execution until a breakpoint or exit |
| Pause | - | Interrupt a running program |
| Continue | F5 | Resume execution after a breakpoint |
| Step Over | F10 | Execute current line; step over function calls |
| Step Into | F11 | Step into function calls on the current line |
| Step Out | Shift+F11 | Run until the current function returns |
| Stop | - | End the debug session |

## Breakpoints

### Setting Breakpoints

Click in the **line number gutter** (left margin of the source editor) to toggle a breakpoint on that line. A red circle glyph appears in the gutter.

### Managing Breakpoints

Switch to the **Breakpoints** tab in the side panel to:
- View all breakpoints with file name, line number, and condition
- Remove individual breakpoints by clicking the remove button

### Conditional Breakpoints

Conditional breakpoint support is planned for a future release.

## Variable Inspection

When the program is paused at a breakpoint:

1. Switch to the **Variables** tab in the side panel
2. Local variables are displayed in a table with **Name**, **Value**, and **Type** columns
3. The **Call Stack** section shows the current execution stack with function names and file locations

Click the call stack section header to collapse or expand it.

## Memory Viewer

Inspect raw memory and disassembly:

1. Switch to the **Memory** tab
2. Enter an address (e.g., `0x400000` or `&variable_name`)
3. Set the length (number of bytes for hex dump, or instructions for disassembly)
4. Choose mode: **Hex Dump** or **Disassembly**
5. Click **Read**

## Syntax Highlighting

Monaco Editor automatically detects the language based on the source file extension:

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
| `.rb` | Ruby |

## Current Line Indicator

When execution pauses, the current line is highlighted in yellow. A blue arrow glyph appears in the gutter pointing to the current line. The editor automatically scrolls to keep this line centered.

## Status Bar Indicators

| Color | State | Description |
|---|---|---|
| Gray | idle | No program loaded, or program loaded but not running |
| Green (pulsing) | running | Program is executing |
| Yellow | paused | Program stopped at breakpoint or after stepping |
| Red | exited | Program has terminated |

## Building for Distribution

```bash
# Build the renderer and Electron main process
npm run build

# Package as a desktop application
npx electron-builder
```

Output is placed in the `release/` directory.

## Project Architecture

```
ddd/
├── electron/              # Electron main process
│   ├── main.ts            # Window creation, IPC handlers
│   ├── preload.ts         # Context bridge API (gdbAPI)
│   └── gdb/
│       └── gdb-controller.ts  # GDB/MI protocol communication
├── src/                   # React renderer process
│   ├── main.tsx           # Entry point with mock API injection
│   ├── App.tsx            # Main layout and state management
│   ├── mock_api.ts        # Mock GDB API for browser development
│   ├── types.ts           # TypeScript interface definitions
│   ├── components/
│   │   ├── Toolbar.tsx         # Debug control buttons
│   │   ├── SourceViewer.tsx    # Monaco Editor wrapper
│   │   ├── BreakpointManager.tsx  # Breakpoint list table
│   │   ├── VariableInspector.tsx  # Variable and stack display
│   │   └── MemoryViewer.tsx    # Memory hex dump / disassembly
│   └── styles/
│       └── index.css      # Dark theme stylesheet
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## GDB / MI Protocol

The GDB controller communicates with GDB using the Machine Interface (MI) protocol. Key commands used:

| MI Command | Purpose |
|---|---|
| `-exec-run` | Start program execution |
| `-exec-continue` | Continue after breakpoint |
| `-exec-next` | Step over current line |
| `-exec-step` | Step into function call |
| `-exec-finish` | Step out of current function |
| `-exec-interrupt` | Pause running program |
| `-break-insert` | Set a breakpoint |
| `-break-delete` | Remove a breakpoint |
| `-break-list` | List all breakpoints |
| `-stack-list-frames` | Get call stack |
| `-stack-list-variables` | Get local variables |
| `-data-evaluate-expression` | Evaluate an expression |
| `-data-read-memory` | Read raw memory |

## Troubleshooting

### Electron fails to download

If the Electron binary download fails with a certificate error, use a mirror:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install electron
```

### GDB not found

Ensure GDB is installed and available in your system PATH:

```bash
where gdb          # Windows
which gdb          # Linux / macOS
```

### Source code not displayed

Make sure your program is compiled with debug symbols:

```bash
gcc -g -o program program.c      # C
g++ -g -o program program.cpp    # C++
```

### Port already in use

If port 5173 is occupied, Vite automatically uses the next available port (5174, 5175, etc.). Check the terminal output for the actual URL.

## Coding Standards

- **snake_case** for all variables, function names, and method names
- **PascalCase** for React component names and TypeScript interfaces
- No Chinese characters in comments or console output
- All public GDB API methods use snake_case (e.g., `step_over`, `set_breakpoint`)

## License

GNU General Public License v3.0
