# Step Button Behavior Specification

## State Machine

```
                  Open Program
                       |
                       v
   ┌──────────────── IDLE ─────────────────┐
   │  (program loaded, not started)        │
   │  Run: enabled   Step: disabled        │
   └────────────┬──────────────────────────┘
                | click Run
                v
   ┌────────── RUNNING ────────────────────┐
   │  (program executing)                  │
   │  Pause: enabled                       │
   │  Run/Continue: disabled               │
   │  Step: disabled                       │
   └────────────┬──────────────────────────┘
                | breakpoint hit / step complete
                v
   ┌────────── PAUSED ─────────────────────┐
   │  (stopped at a source line)           │
   │  Continue: enabled                    │
   │  Step Over: enabled                   │
   │  Step Into: enabled                   │
   │  Step Out: enabled                    │
   └────────────┬──────────────────────────┘
                | step / continue past end
                v
   ┌────────── EXITED ─────────────────────┐
   │  (program finished)                   │
   │  Run: enabled (restart)               │
   │  Step: disabled                       │
   │  Variables cleared, highlight removed │
   └───────────────────────────────────────┘
```

## Button Definitions

### Run / Continue (combined)
A single button that changes label and behavior based on state.

| State | Label | Action | GDB Command |
|---|---|---|---|
| IDLE | Run | Start program from beginning | `-exec-run` |
| RUNNING | Run (disabled) | — | — |
| PAUSED | Continue | Resume execution | `-exec-continue` |
| EXITED | Run | Restart program | `-exec-run` |

### Pause
Only enabled when program is RUNNING. Sends SIGINT / `-exec-interrupt`.

### Step Over
Only enabled when PAUSED. Executes the current line. If the line calls a function, runs the entire call and stops at the next line in the current function.

| Scenario | GDB Command |
|---|---|
| Any source line | `-exec-next` |

After stepping:
- If the new line is a closing brace `}` (any function): **auto-continue** to return to caller
- If the new line is past the end of the source file: **auto-continue** to exit
- If the new line is in a system/CRT file: **treat as exited**

### Step Into
Only enabled when PAUSED. Executes the current line. If the line calls a function, steps into that function and stops at its first executable line.

| Scenario | GDB Command |
|---|---|
| Any source line | `-exec-step` |

After stepping:
- If the new location is in a **system/library file** (no user source): **auto Step Out** to return to user code
- If the new location is on a closing brace `}`: **auto-continue** to return to caller

### Step Out
Only enabled when PAUSED. Runs until the current function returns to its caller.

| Scenario | Behavior | GDB Command |
|---|---|---|
| Inside a called function (stack depth > 1) | Run until return | `-exec-finish` |
| In outermost frame (main) | Fall back to step over | `-exec-next` |

After stepping out:
- If the return location is on a closing brace `}`: **auto-continue**
- If the return location is in a system file: **treat as exited**

## Auto-Behaviors

### Auto-Continue on closing brace
When any step action lands on a line that is only `}` (after trimming whitespace), the debugger automatically sends Continue. This prevents pausing on function epilogues.

### System File Detection
A file is considered a "system file" if its path contains any of:
- `msys64`
- `mingw`
- `/crt/`
- `/build/`
- `/usr/`

When landing in a system file:
- After Step Into: auto Step Out (library function, no source to show)
- After Step Over / Continue: treat as program exit

### Auto-Continue past end of file
When stepping lands on or past the last line of the source file, auto-continue to let the program exit.

## On Program Exit
- State changes to EXITED
- Current line highlight is cleared (`current_line = -1`)
- Variable list is emptied
- Stack frame list is emptied
- Source code remains visible
- Run button is enabled (allows restart)
