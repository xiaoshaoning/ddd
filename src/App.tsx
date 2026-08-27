import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Toolbar } from './components/Toolbar';
import { SourceViewer } from './components/SourceViewer';
import { BreakpointManager } from './components/BreakpointManager';
import { VariableInspector } from './components/VariableInspector';
import { MemoryViewer } from './components/MemoryViewer';
import { WatchpointManager } from './components/WatchpointManager';
import { GraphViewer } from './components/GraphViewer';
import { GDBShell } from './components/GDBShell';
import type { StoppedInfo, Breakpoint, Variable, StackFrame, DataGraph } from './types';

type DebugState = 'idle' | 'running' | 'paused' | 'exited';

type Theme = 'biogoo' | 'dark';

function get_initial_theme(): Theme {
  const saved = localStorage.getItem('ddd-theme');
  if (saved === 'dark') return 'dark';
  return 'biogoo';
}

// Whether a file belongs to system code (library/CRT/OS) rather than the
// user's program. Keep in sync with is_system_path in
// electron/gdb/gdb-controller.ts.
const is_system_path = (file_path: string): boolean => {
  const normalized = file_path.replace(/\\/g, '/').toLowerCase();
  const markers = [
    '/usr/', '/build/', '/crt/',
    '/windows/system32/', '/windows/syswow64/',
    'mingw', 'msys', 'dllcrt',
  ];
  return markers.some(m => normalized.includes(m)) || normalized.endsWith('.dll');
};

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
  const [active_tab, set_active_tab] = useState<'variables' | 'breakpoints' | 'memory' | 'watch' | 'viz'>('variables');
  const [graph_data, set_graph_data] = useState<DataGraph | null>(null);
  const [graph_loading, set_graph_loading] = useState(false);
  const [graph_expr, set_graph_expr] = useState('');
  const [graph_layout, set_graph_layout] = useState<'auto' | 'tree' | 'force'>('auto');
  const [graph_depth, set_graph_depth] = useState(10);
  const [graph_error, set_graph_error] = useState('');
  const [status_text, set_status_text] = useState('Ready. Open a program to start debugging.');
  const [gdb_output_lines, set_gdb_output_lines] = useState<string[]>([]);
  const [refresh_counter, set_refresh_counter] = useState(0);

  const api = window.gdbAPI;

  // Ref for source_code so the event callback always sees the latest value
  const source_code_ref = useRef(source_code);
  source_code_ref.current = source_code;

  // Track last debug action to distinguish step-into from step-over
  const last_action_ref = useRef<'step_into' | 'other'>('other');

  // Last successfully visualized expression, so the graph can auto-refresh
  // after each stop without depending on the (possibly edited) input box
  const last_viz_expr_ref = useRef('');
  const graph_depth_ref = useRef(graph_depth);
  graph_depth_ref.current = graph_depth;
  const extract_graph_ref = useRef<(expr?: string) => Promise<void>>(async () => {});

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ddd-theme', theme);
  }, [theme]);

  const toggle_theme = () => {
    set_theme(prev => prev === 'biogoo' ? 'dark' : 'biogoo');
  };

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

  // ---- Event listeners ----
  useEffect(() => {
    const unsub_output = api.on_output((data: string) => {
      console.log('[GDB]', data);
      set_gdb_output_lines(prev => [...prev.slice(-200), data]);
    });

    const unsub_stopped = api.on_stopped(async (info: StoppedInfo) => {
      // Check if program exited vs paused at breakpoint
      if (info.reason.includes('exited')) {
        set_debug_state('exited');
        set_status_text('Program exited: ' + info.reason);
        set_current_line(-1);
        set_variables([]);
        set_stack_frames([]);
        return;
      }

      // Detect if we stepped into system code (library/CRT/OS)
      const is_system_file = info.file ? is_system_path(info.file) : false;

      if (is_system_file) {
        if (last_action_ref.current === 'step_into') {
          // Stepped into library code — step back out
          set_status_text('Stepped into library function, stepping out...');
          last_action_ref.current = 'other';
          setTimeout(() => api.step_out(), 50);
          return;
        }
        // Stepped past end of user program into CRT — program is done
        set_debug_state('exited');
        set_status_text('Program finished.');
        set_current_line(-1);
        set_variables([]);
        set_stack_frames([]);
        return;
      }
      last_action_ref.current = 'other';

      set_debug_state('paused');
      set_status_text('Program stopped: ' + info.reason);
      set_refresh_counter(c => c + 1);

      if (info.line && info.line > 0) {
        set_current_line(info.line);
      }

      // Auto-continue if we stepped onto a closing brace or past the last line.
      // This makes step-over on "return" go back to the caller instead of
      // stopping on the "}" of the current function.
      const src = source_code_ref.current;
      if (src && info.reason === 'end-stepping-range' && info.line && info.line > 0) {
        const lines = src.split('\n');
        const total_lines = lines.length;
        const idx = info.line - 1;
        const raw_line = (idx >= 0 && idx < total_lines) ? lines[idx] : '';
        const trimmed = raw_line.trim();
        const is_closing_brace = trimmed === '}' || trimmed === '};' || trimmed === '';

        if (info.line > total_lines || is_closing_brace) {
          set_status_text('Stepping out of function...');
          // Use step_over to advance from "}" to the caller's next line,
          // rather than continue which runs to next breakpoint or exit
          api.step_over();
          return;
        }
      }

      // Refresh state after stopping at breakpoint
      try {
        const loc = await api.get_current_location();
        if (loc && loc.file && loc.file !== source_file && !is_system_path(loc.file)) {
          set_source_file(loc.file);
          const code = await api.get_source(loc.file);
          if (code) {
            set_source_code(code);
          }
        }
        if (loc && loc.line && loc.line > 0) set_current_line(loc.line);
      } catch { /* ignore */ }

      refresh_debug_info();

      // Auto-refresh a displayed data structure graph after each stop
      if (last_viz_expr_ref.current) {
        extract_graph_ref.current(last_viz_expr_ref.current);
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
  }, [source_file, refresh_debug_info, api]);

  // ---- Actions ----
  const handle_open_program = async () => {
    const file_path = await api.open_file_dialog();
    if (!file_path) return;

    set_status_text('Loading program: ' + file_path);
    // Clear state from previous session
    set_breakpoints([]);
    set_breakpoint_lines(new Set());
    set_variables([]);
    set_stack_frames([]);
    set_current_line(-1);

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
    last_action_ref.current = 'other';
    set_status_text('Starting program...');
    await api.run();
  };

  const handle_pause = async () => {
    await api.pause();
  };

  const handle_continue = async () => {
    last_action_ref.current = 'other';
    set_current_line(-1);
    await api.continue();
  };

  const handle_step_over = async () => {
    last_action_ref.current = 'other';
    await api.step_over();
  };

  const handle_step_into = async () => {
    last_action_ref.current = 'step_into';
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
    set_source_file('');
    set_current_line(-1);
    set_breakpoints([]);
    set_breakpoint_lines(new Set());
    set_variables([]);
    set_stack_frames([]);
    set_graph_data(null);
    set_graph_expr('');
    set_graph_error('');
    last_viz_expr_ref.current = '';
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

  const extract_graph_data = async (expr_override?: string) => {
    const expr = (expr_override ?? graph_expr).trim();
    if (!expr) return;
    set_graph_loading(true);
    set_graph_error('');
    try {
      const data = await api.extract_graph(expr, graph_depth_ref.current);
      set_graph_data(data);
      if (!data || data.nodes.length === 0) {
        set_graph_error('No structure found for: ' + expr);
      } else {
        last_viz_expr_ref.current = expr;
      }
    } catch {
      set_graph_error('Failed to extract graph');
      set_graph_data(null);
    }
    set_graph_loading(false);
  };
  extract_graph_ref.current = extract_graph_data;

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const on_key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'F5') {
        e.preventDefault();
        if (debug_state === 'paused') handle_continue();
        else if (program_loaded && debug_state !== 'running') handle_run();
      } else if (e.key === 'F10' && debug_state === 'paused') {
        e.preventDefault();
        handle_step_over();
      } else if (e.key === 'F11' && debug_state === 'paused') {
        e.preventDefault();
        if (e.shiftKey) handle_step_out();
        else handle_step_into();
      }
    };
    window.addEventListener('keydown', on_key);
    return () => window.removeEventListener('keydown', on_key);
  }, [debug_state, program_loaded]);

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
            editor_theme={theme === 'dark' ? 'vs-dark' : 'biogoo'}
            on_toggle_theme={toggle_theme}
            on_evaluate_expression={(expr: string) => api.evaluate_expression(expr)}
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
              <button
                className={'tab-btn' + (active_tab === 'watch' ? ' active' : '')}
                onClick={() => set_active_tab('watch')}
              >
                Watch
              </button>
              <button
                className={'tab-btn' + (active_tab === 'viz' ? ' active' : '')}
                onClick={() => set_active_tab('viz')}
              >
                Viz
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
              {active_tab === 'watch' && (
                <WatchpointManager api={api} refresh_signal={refresh_counter} />
              )}
              {active_tab === 'viz' && (
                <div className="graph-viewer">
                  <div className="graph-controls">
                    <input
                      type="text"
                      className="graph-expr-input"
                      value={graph_expr}
                      onChange={(e) => set_graph_expr(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && extract_graph_data()}
                      placeholder="Expression, e.g. root, head, tree"
                      spellCheck={false}
                    />
                    <select
                      className="graph-layout-select"
                      value={graph_layout}
                      onChange={(e) => set_graph_layout(e.target.value as 'auto' | 'tree' | 'force')}
                      title="Layout algorithm"
                    >
                      <option value="auto">Auto</option>
                      <option value="tree">Tree</option>
                      <option value="force">Force</option>
                    </select>
                    <input
                      type="number"
                      className="graph-depth-input"
                      min={1}
                      max={50}
                      value={graph_depth}
                      onChange={(e) => set_graph_depth(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
                      title="Max depth"
                    />
                    <button
                      className="graph-viz-btn"
                      onClick={() => extract_graph_data()}
                      disabled={graph_loading || !graph_expr.trim()}
                    >
                      {graph_loading ? '...' : 'Visualize'}
                    </button>
                  </div>
                  {graph_error && (
                    <div className="graph-empty"><p>{graph_error}</p></div>
                  )}
                  <GraphViewer graph={graph_data} loading={graph_loading} layout={graph_layout} />
                </div>
              )}
            </div>
          </div>
        </Panel>
      </PanelGroup>

      <GDBShell
        on_send_command={(cmd: string) => api.send_cli_command(cmd)}
        gdb_output={gdb_output_lines}
      />

      <div className="status-bar">
        <span className={'status-indicator ' + debug_state}></span>
        <span>{status_text}</span>
      </div>
    </div>
  );
}

export default App;
