import React, { useState, useCallback, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Toolbar } from './components/Toolbar';
import { SourceViewer } from './components/SourceViewer';
import { BreakpointManager } from './components/BreakpointManager';
import { VariableInspector } from './components/VariableInspector';
import { MemoryViewer } from './components/MemoryViewer';
import type { StoppedInfo, Breakpoint, Variable, StackFrame } from './types';

type DebugState = 'idle' | 'running' | 'paused' | 'exited';

type Theme = 'dark' | 'light';

function get_initial_theme(): Theme {
  const saved = localStorage.getItem('ddd-theme');
  return (saved === 'light') ? 'light' : 'dark';
}

function App(): React.ReactElement {
  const [theme, set_theme] = useState<Theme>(get_initial_theme);
  const [debug_state, set_debug_state] = useState<DebugState>('idle');
  const [program_loaded, set_program_loaded] = useState(false);
  const [source_code, set_source_code] = useState('');
  const [source_file, set_source_file] = useState('');
  const [current_line, set_current_line] = useState(-1);
  const [breakpoints, set_breakpoints] = useState<Breakpoint[]>([]);
  const [breakpoint_lines, set_breakpoint_lines] = useState<Set<number>>(new Set());
  const [variables, set_variables] = useState<Variable[]>([]);
  const [stack_frames, set_stack_frames] = useState<StackFrame[]>([]);
  const [active_tab, set_active_tab] = useState<'variables' | 'breakpoints' | 'memory'>('variables');
  const [status_text, set_status_text] = useState('Ready. Open a program to start debugging.');

  const api = window.gdbAPI;

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ddd-theme', theme);
  }, [theme]);

  const toggle_theme = () => {
    set_theme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // ---- Event listeners ----
  useEffect(() => {
    const unsub_output = api.on_output((data: string) => {
      console.log('[GDB]', data);
    });

    const unsub_stopped = api.on_stopped(async (info: StoppedInfo) => {
      // Check if program exited vs paused at breakpoint
      if (info.reason.includes('exited')) {
        set_debug_state('exited');
        set_status_text('Program exited: ' + info.reason);
      } else {
        set_debug_state('paused');
        set_status_text('Program stopped: ' + info.reason);
        if (info.line) {
          set_current_line(info.line);
        }

        // Refresh state after stopping at breakpoint
        try {
          const loc = await api.get_current_location();
          if (loc && loc.file !== source_file) {
            set_source_file(loc.file);
            const code = await api.get_source(loc.file);
            set_source_code(code);
          }
          if (loc) set_current_line(loc.line);
        } catch { /* ignore */ }

        refresh_debug_info();
      }
    });

    const unsub_running = api.on_running(() => {
      set_debug_state('running');
      set_status_text('Program running...');
    });

    const unsub_exited = api.on_exited(() => {
      set_debug_state('exited');
      set_status_text('Program exited.');
    });

    return () => {
      unsub_output();
      unsub_stopped();
      unsub_running();
      unsub_exited();
    };
  }, [source_file]);

  const refresh_debug_info = useCallback(async () => {
    try {
      const [vars, frames, bps] = await Promise.all([
        api.get_variables(),
        api.get_stack_frames(),
        api.list_breakpoints(),
      ]);
      set_variables(vars);
      set_stack_frames(frames);
      set_breakpoints(bps);
      const bp_set = new Set(bps.map(b => b.line));
      set_breakpoint_lines(bp_set);
    } catch { /* ignore */ }
  }, [api]);

  // ---- Actions ----
  const handle_open_program = async () => {
    const file_path = await api.open_file_dialog();
    if (!file_path) return;

    set_status_text('Loading program: ' + file_path);
    const ok = await api.start(file_path);
    if (ok) {
      set_program_loaded(true);
      set_debug_state('idle');
      set_status_text('Program loaded. Click Run to start.');

      const src_file = await api.get_source_file_path();
      if (src_file) {
        set_source_file(src_file);
        const code = await api.get_source(src_file);
        set_source_code(code);
      }
    } else {
      set_status_text('Failed to load program.');
    }
  };

  const handle_run = async () => {
    set_status_text('Starting program...');
    await api.run();
  };

  const handle_pause = async () => {
    await api.pause();
  };

  const handle_continue = async () => {
    set_current_line(-1);
    await api.continue();
  };

  const handle_step_over = async () => {
    await api.step_over();
  };

  const handle_step_into = async () => {
    await api.step_into();
  };

  const handle_step_out = async () => {
    await api.step_out();
  };

  const handle_stop = async () => {
    await api.stop();
    set_debug_state('idle');
    set_program_loaded(false);
    set_source_code('');
    set_status_text('Debug session ended.');
  };

  const handle_toggle_breakpoint = async (line: number) => {
    if (!source_file) return;

    if (breakpoint_lines.has(line)) {
      // Find and remove the breakpoint
      const bp = breakpoints.find(b => b.line === line);
      if (bp) {
        await api.remove_breakpoint(bp.id);
        set_breakpoint_lines(prev => {
          const next = new Set(prev);
          next.delete(line);
          return next;
        });
        set_breakpoints(prev => prev.filter(b => b.line !== line));
      }
    } else {
      const bp = await api.set_breakpoint(source_file, line);
      if (bp) {
        set_breakpoint_lines(prev => new Set(prev).add(line));
        set_breakpoints(prev => [...prev, { id: bp.id, file: bp.file, line: bp.line, enabled: true }]);
      }
    }
  };

  const is_running = debug_state === 'running';

  return (
    <div className="app-container">
      <Toolbar
        program_loaded={program_loaded}
        is_running={is_running}
        debug_state={debug_state}
        on_open_program={handle_open_program}
        on_run={handle_run}
        on_pause={handle_pause}
        on_continue={handle_continue}
        on_step_over={handle_step_over}
        on_step_into={handle_step_into}
        on_step_out={handle_step_out}
        on_stop={handle_stop}
      />

      <PanelGroup direction="horizontal" className="main-content">
        <Panel defaultSize={70} minSize={30}>
          <SourceViewer
            source_code={source_code}
            source_file={source_file}
            current_line={current_line}
            breakpoint_lines={breakpoint_lines}
            on_toggle_breakpoint={handle_toggle_breakpoint}
            editor_theme={theme === 'dark' ? 'vs-dark' : 'vs'}
            on_toggle_theme={toggle_theme}
          />
        </Panel>
        <PanelResizeHandle className="resize-handle" />
        <Panel defaultSize={30} minSize={20}>
          <div className="side-panel">
            <div className="tab-bar">
              <button
                className={'tab-btn' + (active_tab === 'variables' ? ' active' : '')}
                onClick={() => set_active_tab('variables')}
              >
                Variables
              </button>
              <button
                className={'tab-btn' + (active_tab === 'breakpoints' ? ' active' : '')}
                onClick={() => set_active_tab('breakpoints')}
              >
                Breakpoints
              </button>
              <button
                className={'tab-btn' + (active_tab === 'memory' ? ' active' : '')}
                onClick={() => set_active_tab('memory')}
              >
                Memory
              </button>
            </div>
            <div className="tab-content">
              {active_tab === 'variables' && (
                <VariableInspector variables={variables} stack_frames={stack_frames} />
              )}
              {active_tab === 'breakpoints' && (
                <BreakpointManager
                  breakpoints={breakpoints}
                  on_remove={async (id) => {
                    await api.remove_breakpoint(id);
                    set_breakpoints(prev => prev.filter(b => b.id !== id));
                    set_breakpoint_lines(prev => {
                      const next = new Set(prev);
                      const bp = breakpoints.find(b => b.id === id);
                      if (bp) next.delete(bp.line);
                      return next;
                    });
                  }}
                />
              )}
              {active_tab === 'memory' && (
                <MemoryViewer api={api} />
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

      <div className="status-bar">
        <span className={'status-indicator ' + debug_state}></span>
        <span>{status_text}</span>
      </div>
    </div>
  );
}

export default App;
