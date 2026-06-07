# Data Structure Visualization Design

## Overview

The original DDD (Data Display Debugger) could graphically display data structures — drawing nodes for each element and edges for pointers/links between them. This document outlines how to implement similar functionality in ddd for Windows.

## Architecture

```
User selects variable/expression
        │
        v
┌───────────────────┐
│  Graph Extractor  │  ← Recursively walks GDB data
│  (GDB Controller) │    using -var-create / print
└───────┬───────────┘
        │ graph data (nodes + edges)
        v
┌───────────────────┐
│  Layout Engine    │  ← Computes positions
│  (force-directed) │    (tree, layered, force)
└───────┬───────────┘
        │ positioned graph
        v
┌───────────────────┐
│  Renderer         │  ← Canvas/SVG with pan/zoom
│  (React + D3)     │    and hover tooltips
└───────────────────┘
```

## Phase 1: Data Extraction from GDB

### Detecting structure type

Use GDB's `ptype` command to determine the type:

```
(gdb) ptype node
type = struct Node {
    int value;
    struct Node *left;
    struct Node *right;
}
```

Parse the output to identify pointer fields that represent links to other nodes.

### Walking the graph

Recursively follow pointers to build the graph. Use `-var-create` to create variable objects for each node:

```
-break-insert main
-exec-run
# For a tree node at address 0x...:
-var-create - * ((struct Node*)0x5555555592a0)
# Returns: value, type, numchild
# For each pointer field:
-var-create - * ((struct Node*)0x5555555592a0).left
-var-create - * ((struct Node*)0x5555555592a0).right
```

### Anti-cycles

Maintain a visited set of addresses. Stop recursion when:
- Pointer is NULL (0x0)
- Address already visited (cycle or DAG)
- Maximum depth reached (configurable, default 50)
- Maximum node count reached (default 500)

### Extracted data format

```typescript
interface DataGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphNode {
  id: string;           // unique id (e.g., address)
  label: string;        // display text (value)
  fields: FieldInfo[];  // key-value pairs for tooltip
  address: string;      // memory address
  type: string;         // type name
}

interface GraphEdge {
  source: string;       // source node id
  target: string;       // target node id
  label: string;        // field name (e.g., "left", "right", "next")
}

interface FieldInfo {
  name: string;
  value: string;
  type: string;
}
```

## Phase 2: Layout Engine

### Tree Layout (for binary trees, n-ary trees)

- **Reingold-Tilford algorithm**: Standard tree layout, O(n)
- Nodes arranged hierarchically with parent centered above children
- Configurable horizontal/vertical spacing
- D3.js has built-in `d3.tree()` and `d3.cluster()`

### Force-Directed Layout (for arbitrary graphs)

- **d3-force** simulation: nodes repel, edges attract
- Good for linked lists, DAGs, general pointer structures
- Interactive: user can drag nodes, simulation stabilizes

### Layered Layout (for DAGs)

- **Sugiyama algorithm**: layers nodes by depth, minimizes edge crossings
- Good for dependency graphs, inheritance hierarchies
- `dagre` / `d3-dag` libraries

### Recommended approach

Start with **tree layout** for hierarchical structures (most common in debugging), then add **force-directed** as a fallback for arbitrary graphs.

```typescript
enum LayoutAlgorithm {
  TREE = 'tree',
  FORCE = 'force',
  LAYERED = 'layered',
}

function choose_layout(graph: DataGraph): LayoutAlgorithm {
  // If every node has at most one parent → tree layout
  // Otherwise → force-directed
}
```

## Phase 3: Rendering

### Library choice: D3.js

D3.js is the best fit:
- Mature, well-documented
- Built-in tree/force/graph layouts
- SVG rendering with CSS styling
- Zoom and pan via `d3-zoom`
- Works well with React via `useRef` + `useEffect`

### Component design

```typescript
interface GraphViewerProps {
  graph: DataGraph;
  layout: LayoutAlgorithm;
  on_node_click: (node_id: string) => void;
  on_node_hover: (node_id: string) => void;
}
```

### Visual design

```
┌──────────────────────────────────────────┐
│ Layout: [Tree ▼]  Depth: [10]  [Refresh]│
├──────────────────────────────────────────┤
│                                          │
│         ┌─────┐                          │
│         │ 42  │  ← root                  │
│         └──┬──┘                          │
│       ┌────┴────┐                        │
│    ┌──┴──┐   ┌──┴──┐                     │
│    │ 15  │   │ 67  │                     │
│    └─┬───┘   └─┬───┘                     │
│   ┌──┴──┐   ┌──┴──┐                      │
│   │  3  │   │ 99  │                      │
│   └─────┘   └─────┘                      │
│                                          │
├──────────────────────────────────────────┤
│ Hover: Node 0x5555555592a0              │
│        value = 42                        │
│        left → 0x5555555592b0             │
│        right → 0x5555555592c0            │
└──────────────────────────────────────────┘
```

### Node rendering

- **Box** with rounded corners, showing the primary value
- **Color coding** by type or depth
- **Hover** shows full field details in a tooltip
- **Click** to expand/collapse children or navigate
- **NULL pointers** shown as small ground symbol (⏚)

### Edge rendering

- **Lines/curves** connecting parent to child
- **Arrowheads** for directed edges
- **Labels** on edges showing field name ("left", "right", "next")
- **Color** matches source/target node depth

### Interaction

- **Pan**: drag background to scroll
- **Zoom**: mouse wheel or pinch
- **Node drag**: reposition nodes (force layout)
- **Click node**: select, show details in side panel
- **Double-click**: expand/collapse subtree
- **Hover**: tooltip with full field values

## Phase 4: Integration with UI

### Add a "Data Viz" tab

Add a 5th tab to the side panel, or make it a separate resizable panel below the source editor:

```
+------------------------------------------+
| Toolbar                                   |
+------------------------------------------+
| Source Editor    | Side Panel             |
|                  | [Vars | BP | ... | Viz]|
|                  | ┌───────────────────┐  |
|                  | │ Expression: [root]│  |
|                  | │ [Tree ▼] [Refresh]│  |
|                  | │                   │  |
|                  | │   graph goes here │  |
|                  | │                   │  |
|                  | └───────────────────┘  |
+------------------------------------------+
| GDB Shell                                 |
+------------------------------------------+
| Status Bar                                |
+------------------------------------------+
```

### Workflow

1. Pause at a breakpoint where a data structure is in scope
2. Switch to **Viz** tab or open **Data Visualization** from menu
3. Enter expression (e.g., `root`, `head`, `tree`)
4. Select layout algorithm
5. Graph renders automatically
6. Step through code — graph updates on each stop

## Implementation Plan

### Step 1: Graph Extractor (backend)

Add to `electron/gdb/gdb-controller.ts`:

```typescript
async extract_graph(
  expression: string,
  max_depth: number = 10,
  max_nodes: number = 200
): Promise<DataGraph>
```

Implementation:
1. Use `ptype` to get struct definition and identify pointer fields
2. Use `-var-create` to create variable object for the root expression
3. Recursively follow pointer fields, tracking visited addresses
4. Return `DataGraph` with nodes and edges

### Step 2: Graph Viewer component (frontend)

Create `src/components/GraphViewer.tsx`:
- Accept `DataGraph` and `LayoutAlgorithm` props
- Use D3.js for layout and SVG rendering
- Pan/zoom with `d3-zoom`
- Hover tooltips with field values

### Step 3: Integration

Add to `App.tsx`:
- New "Viz" tab or panel
- Expression input
- Layout selector dropdown
- Auto-refresh on stop

### Step 4: Polish

- Undo/redo navigation history
- Export graph as SVG/PNG
- Color themes matching editor theme
- Keyboard shortcuts for zoom/pan

## Dependencies

```json
{
  "d3": "^7.9.0",
  "@types/d3": "^7.4.0"
}
```

D3.js is ~200KB gzipped (tree-shakeable — only import what's needed).

## Example: Binary Tree Visualization

Given this C code:

```c
struct Node {
    int value;
    struct Node *left;
    struct Node *right;
};

struct Node *root = /* ... tree built ... */;
```

When the user enters `root` at a breakpoint:

1. GDB `ptype root` → `struct Node *`
2. Dereference: `*root` → `{value=42, left=0x..., right=0x...}`
3. Follow `left` and `right` pointers recursively
4. Build graph with 7 nodes and 6 edges
5. Render as a tree with parent-child relationships

## Example: Linked List Visualization

```c
struct Node {
    int data;
    struct Node *next;
};

struct Node *head = /* ... list built ... */;
```

1. Detect single pointer field → treat as linked list
2. Walk `next` chain until NULL
3. Render horizontally with arrows between nodes

## Performance Considerations

- **Lazy loading**: only extract nodes visible in viewport
- **Caching**: cache graph data until next step/continue
- **Web Worker**: run graph extraction in a worker to avoid blocking UI
- **Throttle**: debounce rapid step operations

## References

- [Original DDD Manual - Data Display](https://www.gnu.org/software/ddd/manual/html_mono/ddd.html#Data-Display)
- [D3.js Gallery - Tree Layout](https://observablehq.com/@d3/tree)
- [D3.js Gallery - Force-Directed Graph](https://observablehq.com/@d3/force-directed-graph)
- [GDB/MI -var-create documentation](https://sourceware.org/gdb/current/onlinedocs/gdb.html/GDB_002fMI-Variable-Objects.html)
