export interface Breakpoint {
  id: string;
  file: string;
  line: number;
  enabled: boolean;
  condition?: string;
}

export interface Variable {
  name: string;
  value: string;
  type: string;
  children?: Variable[];
}

export interface StackFrame {
  level: number;
  func: string;
  file: string;
  line: number;
}

export interface StoppedInfo {
  reason: string;
  file?: string;
  line?: number;
}

export interface GDBAPI {
  start: (programPath: string) => Promise<boolean>;
  stop: () => Promise<void>;
  run: () => Promise<void>;
  pause: () => Promise<void>;
  continue: () => Promise<void>;
  step_over: () => Promise<void>;
  step_into: () => Promise<void>;
  step_out: () => Promise<void>;
  set_breakpoint: (file: string, line: number, condition?: string) => Promise<{ id: string; file: string; line: number } | null>;
  remove_breakpoint: (bpId: string) => Promise<void>;
  list_breakpoints: () => Promise<Breakpoint[]>;
  set_watchpoint: (expression: string) => Promise<{ id: string; expression: string } | null>;
  list_watchpoints: () => Promise<{ id: string; expression: string; type: string }[]>;
  extract_graph: (expression: string, max_depth?: number) => Promise<DataGraph | null>;
  get_variables: () => Promise<Variable[]>;
  evaluate_expression: (expression: string) => Promise<{ value: string; type: string } | null>;
  get_stack_frames: () => Promise<StackFrame[]>;
  get_source: (filePath: string) => Promise<string>;
  get_current_location: () => Promise<{ file: string; line: number } | null>;
  read_memory: (address: string, length: number) => Promise<string>;
  disassemble: (address: string, length: number) => Promise<string>;
  get_source_file_path: () => Promise<string | null>;
  get_breakpoint_locations: () => Promise<Set<number>>;
  on_output: (callback: (data: string) => void) => () => void;
  on_stopped: (callback: (info: StoppedInfo) => void) => () => void;
  on_running: (callback: () => void) => () => void;
  on_exited: (callback: () => void) => () => void;
  open_file_dialog: () => Promise<string | null>;
  send_cli_command: (command: string) => Promise<string>;
}

export interface GraphNode {
  id: string;
  label: string;
  fields: FieldInfo[];
  address: string;
  type_name: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

export interface FieldInfo {
  name: string;
  value: string;
  type: string;
}

export interface DataGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

declare global {
  interface Window {
    gdbAPI: GDBAPI;
  }
}
