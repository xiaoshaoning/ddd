import React from 'react';

interface ToolbarProps {
  program_loaded: boolean;
  is_running: boolean;
  debug_state: string;
  on_open_program: () => void;
  on_run: () => void;
  on_pause: () => void;
  on_continue: () => void;
  on_step_over: () => void;
  on_step_into: () => void;
  on_step_out: () => void;
  on_stop: () => void;
}

export function Toolbar(props: ToolbarProps): React.ReactElement {
  const {
    program_loaded,
    is_running,
    debug_state,
    on_open_program,
    on_run,
    on_pause,
    on_continue,
    on_step_over,
    on_step_into,
    on_step_out,
    on_stop,
  } = props;

  const is_paused = debug_state === 'paused';

  // Combined Run/Continue: Run at idle, Continue when paused
  const run_continue_label = is_paused ? '⏭ Continue' : '▶ Run';
  const run_continue_title = is_paused ? 'Continue (F5)' : 'Run (F5)';
  const run_continue_action = is_paused ? on_continue : on_run;
  const run_continue_disabled = !program_loaded || is_running;

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className="toolbar-btn" onClick={on_open_program} title="Open Program (Ctrl+O)">
          📂 Open
        </button>
        <button
          className="toolbar-btn"
          onClick={on_stop}
          disabled={!program_loaded}
          title="Stop Debugging"
        >
          ⏹ Stop
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="toolbar-btn run-btn"
          onClick={run_continue_action}
          disabled={run_continue_disabled}
          title={run_continue_title}
        >
          {run_continue_label}
        </button>
        <button
          className="toolbar-btn"
          onClick={on_pause}
          disabled={!is_running}
          title="Pause"
        >
          ⏸ Pause
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={on_step_over}
          disabled={!is_paused}
          title="Step Over (F10)"
        >
          ↷ Step Over
        </button>
        <button
          className="toolbar-btn"
          onClick={on_step_into}
          disabled={!is_paused}
          title="Step Into (F11)"
        >
          ↓ Step Into
        </button>
        <button
          className="toolbar-btn"
          onClick={on_step_out}
          disabled={!is_paused}
          title="Step Out (Shift+F11)"
        >
          ↑ Step Out
        </button>
      </div>
    </div>
  );
}
