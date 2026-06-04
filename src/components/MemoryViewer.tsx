import React, { useState } from 'react';
import type { GDBAPI } from '../types';

interface MemoryViewerProps {
  api: GDBAPI;
}

export function MemoryViewer(props: MemoryViewerProps): React.ReactElement {
  const { api } = props;
  const [address, set_address] = useState('');
  const [length, set_length] = useState('64');
  const [output, set_output] = useState('');
  const [loading, set_loading] = useState(false);
  const [mode, set_mode] = useState<'hex' | 'disasm'>('hex');

  const handle_read = async () => {
    if (!address) return;
    set_loading(true);
    try {
      let result: string;
      if (mode === 'hex') {
        result = await api.read_memory(address, parseInt(length) || 64);
      } else {
        result = await api.disassemble(address, parseInt(length) || 64);
      }
      set_output(result || 'No data returned');
    } catch (err: unknown) {
      set_output('Error: ' + (err as Error).message);
    } finally {
      set_loading(false);
    }
  };

  return (
    <div className="memory-viewer">
      <div className="memory-controls">
        <div className="control-row">
          <label>Address:</label>
          <input
            type="text"
            value={address}
            onChange={(e) => set_address(e.target.value)}
            placeholder="e.g. 0x400000 or &variable"
            className="addr-input"
          />
        </div>
        <div className="control-row">
          <label>Length:</label>
          <input
            type="number"
            value={length}
            onChange={(e) => set_length(e.target.value)}
            className="len-input"
          />
          <select
            value={mode}
            onChange={(e) => set_mode(e.target.value as 'hex' | 'disasm')}
            className="mode-select"
          >
            <option value="hex">Hex Dump</option>
            <option value="disasm">Disassembly</option>
          </select>
          <button
            onClick={handle_read}
            disabled={loading || !address}
            className="read-btn"
          >
            {loading ? 'Reading...' : 'Read'}
          </button>
        </div>
      </div>
      <pre className="memory-output">{output || 'Enter an address and click Read to view memory.'}</pre>
    </div>
  );
}
