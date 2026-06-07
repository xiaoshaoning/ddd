import React, { useState, useEffect } from 'react';
import type { GDBAPI } from '../types';

interface WatchpointManagerProps {
  api: GDBAPI;
  refresh_signal: number;
}

interface Watchpoint {
  id: string;
  expression: string;
  type: string;
}

export function WatchpointManager(props: WatchpointManagerProps): React.ReactElement {
  const { api, refresh_signal } = props;
  const [watchpoints, set_watchpoints] = useState<Watchpoint[]>([]);
  const [values, set_values] = useState<Record<string, string>>({});
  const [expression, set_expression] = useState('');
  const [adding, set_adding] = useState(false);

  // Refresh list on mount and when refresh_signal changes (program stopped)
  useEffect(() => {
    refresh_watchpoints();
  }, [refresh_signal]);

  const refresh_values = async (wps: Watchpoint[]) => {
    const new_values: Record<string, string> = {};
    for (const wp of wps) {
      try {
        const result = await api.evaluate_expression(wp.expression);
        new_values[wp.id] = result ? result.value : '?';
      } catch {
        new_values[wp.id] = '?';
      }
    }
    set_values(new_values);
  };

  const refresh_watchpoints = async () => {
    try {
      const wps = await api.list_watchpoints();
      set_watchpoints(wps);
      await refresh_values(wps);
    } catch { /* ignore */ }
  };

  const add_watchpoint = async () => {
    const expr = expression.trim();
    if (!expr) return;
    set_adding(true);
    try {
      const wp = await api.set_watchpoint(expr);
      if (wp) {
        set_expression('');
        await refresh_watchpoints();
      }
    } catch { /* ignore */ }
    set_adding(false);
  };

  const remove_watchpoint = async (id: string) => {
    await api.remove_breakpoint(id);
    await refresh_watchpoints();
  };

  const handle_key_down = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') add_watchpoint();
  };

  return (
    <div className="watchpoint-manager">
      <div className="watchpoint-input-row">
        <input
          type="text"
          className="watchpoint-input"
          value={expression}
          onChange={(e) => set_expression(e.target.value)}
          onKeyDown={handle_key_down}
          placeholder="Watch expression, e.g. x or arr[0]"
          spellCheck={false}
          disabled={adding}
        />
        <button
          className="watchpoint-add-btn"
          onClick={add_watchpoint}
          disabled={adding || !expression.trim()}
        >
          {adding ? '...' : 'Watch'}
        </button>
      </div>

      {watchpoints.length === 0 ? (
        <div className="empty-panel">
          <p>No watchpoints set.</p>
          <p className="hint">Enter a variable name above and click Watch. The program will pause when the value changes.</p>
        </div>
      ) : (
        <>
        <table className="bp-table">
          <thead>
            <tr>
              <th>Expression</th>
              <th>Value</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {watchpoints.map((wp) => (
              <tr key={wp.id}>
                <td className="bp-file">{wp.expression}</td>
                <td className="var-value">{values[wp.id] || '...'}</td>
                <td className="bp-condition">{wp.type}</td>
                <td>
                  <button
                    className="bp-remove-btn"
                    onClick={() => remove_watchpoint(wp.id)}
                    title="Remove watchpoint"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </>
      )}
    </div>
  );
}
