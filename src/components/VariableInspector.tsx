import React, { useState } from 'react';
import type { Variable, StackFrame } from '../types';

interface VariableInspectorProps {
  variables: Variable[];
  stack_frames: StackFrame[];
}

export function VariableInspector(props: VariableInspectorProps): React.ReactElement {
  const { variables, stack_frames } = props;
  const [show_frames, set_show_frames] = useState(true);

  return (
    <div className="variable-inspector">
      {/* Stack frames section */}
      <div className="section">
        <div
          className="section-header"
          onClick={() => set_show_frames(!show_frames)}
        >
          <span className={'arrow' + (show_frames ? ' expanded' : '')}>▶</span>
          <span>Call Stack</span>
          <span className="count">({stack_frames.length})</span>
        </div>
        {show_frames && (
          <div className="section-content">
            {stack_frames.length === 0 ? (
              <p className="empty-text">No stack frames</p>
            ) : (
              stack_frames.map((frame) => (
                <div key={frame.level} className="stack-frame">
                  <span className="frame-level">#{frame.level}</span>
                  <span className="frame-func">{frame.func}</span>
                  <span className="frame-location">
                    at {frame.file.split(/[/\\]/).pop()}:{frame.line}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Variables section */}
      <div className="section">
        <div className="section-header">
          <span>Local Variables</span>
          <span className="count">({variables.length})</span>
        </div>
        <div className="section-content">
          {variables.length === 0 ? (
            <p className="empty-text">No variables</p>
          ) : (
            <table className="var-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Value</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {variables.map((v, i) => (
                  <tr key={i}>
                    <td className="var-name">{v.name}</td>
                    <td className="var-value">{v.value}</td>
                    <td className="var-type">{v.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
