import React, { useState, useRef, useEffect } from 'react';

interface GDBShellProps {
  on_send_command: (command: string) => Promise<string>;
  gdb_output: string[];
}

export function GDBShell(props: GDBShellProps): React.ReactElement {
  const { on_send_command, gdb_output } = props;
  const [input, set_input] = useState('');
  const [history, set_history] = useState<string[]>([]);
  const [cmd_history, set_cmd_history] = useState<string[]>([]);
  const [history_idx, set_history_idx] = useState(-1);
  const [collapsed, set_collapsed] = useState(false);
  const input_ref = useRef<HTMLInputElement>(null);
  const output_ref = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (output_ref.current) {
      output_ref.current.scrollTop = output_ref.current.scrollHeight;
    }
  }, [history, gdb_output]);

  const execute_command = async () => {
    let cmd = input.trim();
    // Empty input repeats the last command (standard GDB behavior)
    if (!cmd) {
      if (cmd_history.length === 0) return;
      cmd = cmd_history[cmd_history.length - 1];
    }

    set_history(prev => [...prev, `(gdb) ${cmd}`]);
    // Only add to history if different from the last command
    if (cmd_history.length === 0 || cmd_history[cmd_history.length - 1] !== cmd) {
      set_cmd_history(prev => [...prev, cmd]);
    }
    set_history_idx(-1);
    set_input('');

    try {
      const result = await on_send_command(cmd);
      set_history(prev => [...prev, result]);
    } catch (err: unknown) {
      set_history(prev => [...prev, 'Error: ' + (err as Error).message]);
    }
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      execute_command();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmd_history.length > 0) {
        const new_idx = history_idx < cmd_history.length - 1
          ? history_idx + 1 : history_idx;
        set_history_idx(new_idx);
        set_input(cmd_history[cmd_history.length - 1 - new_idx] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (history_idx > 0) {
        const new_idx = history_idx - 1;
        set_history_idx(new_idx);
        set_input(cmd_history[cmd_history.length - 1 - new_idx] || '');
      } else {
        set_history_idx(-1);
        set_input('');
      }
    }
  };

  if (collapsed) {
    return (
      <div className="gdb-shell collapsed">
        <div className="gdb-shell-header" onClick={() => set_collapsed(false)}>
          <span className="arrow">▶</span>
          <span>GDB Shell</span>
        </div>
      </div>
    );
  }

  return (
    <div className="gdb-shell">
      <div className="gdb-shell-header" onClick={() => set_collapsed(true)}>
        <span className="arrow expanded">▼</span>
        <span>GDB Shell</span>
        <button
          className="gdb-shell-clear-btn"
          onClick={(e) => { e.stopPropagation(); set_history([]); }}
          title="Clear output"
        >
          Clear
        </button>
      </div>
      <div className="gdb-shell-output" ref={output_ref}>
        {history.length === 0 && gdb_output.length === 0 && (
          <div className="gdb-shell-hint">
            Type a GDB command and press Enter. Examples: info locals, print x, disassemble main, info breakpoints
          </div>
        )}
        {history.map((line, i) => (
          <div key={i} className={line.startsWith('(gdb)') ? 'gdb-shell-input-line' : 'gdb-shell-output-line'}>
            {line}
          </div>
        ))}
      </div>
      <div className="gdb-shell-input-row">
        <span className="gdb-shell-prompt">(gdb)</span>
        <input
          ref={input_ref}
          type="text"
          className="gdb-shell-input"
          value={input}
          onChange={(e) => set_input(e.target.value)}
          onKeyDown={handle_key_down}
          placeholder="Type GDB command..."
          spellCheck={false}
        />
      </div>
    </div>
  );
}
