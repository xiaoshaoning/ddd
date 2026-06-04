import React, { useRef, useEffect, useCallback, useState } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface SourceViewerProps {
  source_code: string;
  source_file: string;
  current_line: number;
  breakpoint_lines: Set<number>;
  on_toggle_breakpoint: (line: number) => void;
  editor_theme: string;
  on_toggle_theme: () => void;
}

const DEFAULT_FONT_SIZE = 24;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 72;
const FONT_STEP = 2;

export function SourceViewer(props: SourceViewerProps): React.ReactElement {
  const { source_code, source_file, current_line, breakpoint_lines, on_toggle_breakpoint, editor_theme, on_toggle_theme } = props;
  const editor_ref = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monaco_ref = useRef<typeof import('monaco-editor') | null>(null);
  const decorations_ref = useRef<string[]>([]);
  const [font_size, set_font_size] = useState(DEFAULT_FONT_SIZE);

  // Keep a fresh reference to on_toggle_breakpoint so the gutter click
  // handler always calls the latest version (avoids stale closure)
  const toggle_bp_ref = useRef(on_toggle_breakpoint);
  toggle_bp_ref.current = on_toggle_breakpoint;

  // Determine language from file extension
  const get_language = (file_path: string): string => {
    const ext = file_path.split('.').pop()?.toLowerCase();
    const lang_map: Record<string, string> = {
      c: 'c',
      cpp: 'cpp',
      cc: 'cpp',
      cxx: 'cpp',
      h: 'c',
      hpp: 'cpp',
      rs: 'rust',
      go: 'go',
      py: 'python',
      js: 'javascript',
      ts: 'typescript',
      java: 'java',
      cs: 'csharp',
      rb: 'ruby',
      php: 'php',
      swift: 'swift',
      kt: 'kotlin',
    };
    return lang_map[ext || ''] || 'plaintext';
  };

  const handle_editor_mount: OnMount = (editor_instance, monaco) => {
    editor_ref.current = editor_instance;
    monaco_ref.current = monaco;

    // Make editor read-only
    editor_instance.updateOptions({ readOnly: true });

    // Listen for gutter clicks (line number area) to toggle breakpoints
    editor_instance.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
          e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        const line_number = e.target.position?.lineNumber;
        if (line_number) {
          toggle_bp_ref.current(line_number);
        }
      }
    });

    update_decorations();
  };

  const handle_before_mount: BeforeMount = (monaco) => {
    monaco_ref.current = monaco;
  };

  const increase_font = () => {
    set_font_size(prev => Math.min(prev + FONT_STEP, MAX_FONT_SIZE));
  };

  const decrease_font = () => {
    set_font_size(prev => Math.max(prev - FONT_STEP, MIN_FONT_SIZE));
  };

  const reset_font = () => {
    set_font_size(DEFAULT_FONT_SIZE);
  };

  // Update editor font size when state changes
  useEffect(() => {
    if (editor_ref.current) {
      editor_ref.current.updateOptions({ fontSize: font_size });
    }
  }, [font_size]);

  const update_decorations = useCallback(() => {
    const editor_instance = editor_ref.current;
    const monaco = monaco_ref.current;
    if (!editor_instance || !monaco) return;

    const decorations: editor.IModelDeltaDecoration[] = [];

    // Breakpoint decorations
    breakpoint_lines.forEach((line) => {
      decorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: 'breakpoint-glyph',
          glyphMarginHoverMessage: { value: 'Breakpoint - click to remove' },
          className: 'breakpoint-line',
        },
      });
    });

    // Current line decoration
    if (current_line > 0) {
      decorations.push({
        range: new monaco.Range(current_line, 1, current_line, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: 'current-line-glyph',
          className: 'current-debug-line',
          zIndex: 1,
        },
      });
    }

    decorations_ref.current = editor_instance.deltaDecorations(
      decorations_ref.current,
      decorations
    );
  }, [breakpoint_lines, current_line]);

  // Update decorations when breakpoints or current line change
  useEffect(() => {
    update_decorations();
  }, [update_decorations]);

  // Reveal current line when it changes
  useEffect(() => {
    if (current_line > 0 && editor_ref.current) {
      editor_ref.current.revealLineInCenter(current_line);
    }
  }, [current_line]);

  if (!source_code) {
    return (
      <div className="source-viewer-empty">
        <div className="empty-message">
          <p>No source code loaded.</p>
          <p>Use File &rarr; Open Program to load an executable with debug symbols.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="source-viewer">
      <div className="source-toolbar">
        <span className="font-size-label">Font:</span>
        <button className="font-btn" onClick={decrease_font} title="Decrease font size" disabled={font_size <= MIN_FONT_SIZE}>−</button>
        <span className="font-size-value" onClick={reset_font} title="Click to reset">{font_size}px</span>
        <button className="font-btn" onClick={increase_font} title="Increase font size" disabled={font_size >= MAX_FONT_SIZE}>+</button>
        <div className="source-toolbar-spacer" />
        <button className="theme-btn" onClick={on_toggle_theme} title="Toggle light/dark theme">
          {editor_theme === 'vs-dark' ? '☀️' : '🌙'}
        </button>
      </div>
      <div className="editor-container">
        <Editor
          height="100%"
          language={get_language(source_file)}
          value={source_code}
          theme={editor_theme}
          onMount={handle_editor_mount}
          beforeMount={handle_before_mount}
          options={{
            readOnly: true,
            glyphMargin: true,
            lineNumbers: 'on',
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            fontSize: font_size,
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            lineHeight: Math.round(font_size * 1.6),
            padding: { top: 4 },
            folding: true,
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
          }}
        />
      </div>
    </div>
  );
}
