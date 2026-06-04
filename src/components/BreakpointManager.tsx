import React from 'react';
import type { Breakpoint } from '../types';

interface BreakpointManagerProps {
  breakpoints: Breakpoint[];
  on_remove: (id: string) => void;
}

export function BreakpointManager(props: BreakpointManagerProps): React.ReactElement {
  const { breakpoints, on_remove } = props;

  if (breakpoints.length === 0) {
    return (
      <div className="empty-panel">
        <p>No breakpoints set.</p>
        <p className="hint">Click the line number gutter in the source view to set a breakpoint.</p>
      </div>
    );
  }

  return (
    <div className="breakpoint-manager">
      <table className="bp-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Line</th>
            <th>Condition</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {breakpoints.map((bp) => (
            <tr key={bp.id} className={bp.enabled ? '' : 'disabled'}>
              <td className="bp-file">{bp.file.split(/[/\\]/).pop()}</td>
              <td className="bp-line">{bp.line}</td>
              <td className="bp-condition">{bp.condition || '-'}</td>
              <td>
                <button
                  className="bp-remove-btn"
                  onClick={() => on_remove(bp.id)}
                  title="Remove breakpoint"
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
