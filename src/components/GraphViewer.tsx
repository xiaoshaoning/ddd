import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import type { DataGraph, GraphNode, FieldInfo } from '../types';

interface GraphViewerProps {
  graph: DataGraph | null;
  loading: boolean;
}

interface TooltipState {
  node: GraphNode;
  x: number;
  y: number;
}

const NODE_W = 80;
const NODE_H = 40;
const TOOLTIP_W = 240;
const TOOLTIP_H = 150;
const MAX_LABEL_LEN = 14;

/** Truncate long labels (e.g. pointer addresses) with an ellipsis. */
function short_label(label: string): string {
  if (label.length <= MAX_LABEL_LEN) return label;
  return label.slice(0, MAX_LABEL_LEN - 1) + '…';
}

/** A pointer field whose value is NULL (or unknown) — drawn as a ground symbol. */
function is_null_pointer(field: FieldInfo): boolean {
  if (!field.type.includes('*')) return false;
  return field.value === '' || field.value === '0x0' || field.value === '0';
}

export function GraphViewer(props: GraphViewerProps): React.ReactElement {
  const { graph, loading } = props;
  const svg_ref = useRef<SVGSVGElement>(null);
  const container_ref = useRef<HTMLDivElement>(null);
  const [tooltip, set_tooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    if (!graph || !svg_ref.current) return;

    const svg = d3.select(svg_ref.current);
    svg.selectAll('*').remove();

    const width = svg_ref.current.clientWidth || 600;
    const height = svg_ref.current.clientHeight || 400;

    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 3])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // Tooltip follows the cursor, clamped inside the viewer
    const handle_hover = (node: GraphNode, event: MouseEvent) => {
      const container = container_ref.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      let x = event.clientX - rect.left + 14;
      let y = event.clientY - rect.top + 14;
      x = Math.min(Math.max(x, 4), Math.max(rect.width - TOOLTIP_W - 4, 4));
      y = Math.min(Math.max(y, 4), Math.max(rect.height - TOOLTIP_H - 4, 4));
      set_tooltip({ node, x, y });
    };
    const handle_leave = () => set_tooltip(null);

    // Build hierarchy for tree layout if it's a tree, else use force
    const is_tree = graph.edges.every(e =>
      graph.edges.filter(o => o.target === e.target).length <= 1
    ) && graph.nodes.length > 0;

    if (is_tree && graph.nodes.length > 0) {
      render_tree(graph, g, width, height, handle_hover, handle_leave);
    } else {
      render_force(graph, g, width, height, handle_hover, handle_leave);
    }
  }, [graph]);

  if (loading) {
    return <div className="graph-viewer"><div className="graph-loading">Extracting graph...</div></div>;
  }

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="graph-viewer">
        <div className="graph-empty">
          <p>No graph data</p>
          <p className="hint">Enter an expression above to visualize a data structure (e.g., root, head, tree).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-viewer" ref={container_ref}>
      <svg ref={svg_ref} width="100%" height="100%" />
      {tooltip && (
        <div className="graph-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <div className="graph-tooltip-value">{tooltip.node.label}</div>
          <div className="graph-tooltip-type">
            {tooltip.node.type_name}
            {tooltip.node.address && tooltip.node.address !== '?' && ' @ ' + tooltip.node.address}
          </div>
          {tooltip.node.fields.length > 0 && (
            <table className="graph-tooltip-fields">
              <tbody>
                {tooltip.node.fields.map((field, i) => (
                  <tr key={i}>
                    <td className="graph-tooltip-field-name">{field.name}</td>
                    <td className="graph-tooltip-field-value">
                      {is_null_pointer(field) ? '⏚ NULL' : field.value || '—'}
                    </td>
                    <td className="graph-tooltip-field-type">{field.type}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

type HoverHandler = (node: GraphNode, event: MouseEvent) => void;
type LeaveHandler = () => void;

function render_tree(
  graph: DataGraph,
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  width: number,
  height: number,
  on_hover: HoverHandler,
  on_leave: LeaveHandler
): void {
  const has_incoming = new Set(graph.edges.map(e => e.target));
  const root_id = graph.nodes.find(n => !has_incoming.has(n.id))?.id || graph.nodes[0].id;
  const node_map = new Map(graph.nodes.map(n => [n.id, n]));
  const children_map = new Map<string, GraphNode[]>();
  for (const n of graph.nodes) children_map.set(n.id, []);
  for (const e of graph.edges) {
    const children = children_map.get(e.source);
    if (children) {
      const child = node_map.get(e.target);
      if (child) children.push(child);
    }
  }

  const root_data = node_map.get(root_id);
  if (!root_data) return;

  const root = d3.hierarchy(root_data, (d: any) => children_map.get(d.id) || []);
  const tree_layout = d3.tree<any>().size([width - 80, height - 80]);
  tree_layout(root);

  const offset_x = 40;
  const offset_y = 40;

  g.append('g')
    .attr('fill', 'none')
    .attr('stroke', '#999')
    .attr('stroke-width', 1.5)
    .selectAll('path')
    .data(root.links())
    .join('path')
    .attr('d', (d: any) => {
      const sx = (d.source.x || 0) + offset_x;
      const sy = (d.source.y || 0) + offset_y;
      const tx = (d.target.x || 0) + offset_x;
      const ty = (d.target.y || 0) + offset_y;
      return `M${sx},${sy}C${sx},${(sy + ty) / 2} ${tx},${(sy + ty) / 2} ${tx},${ty}`;
    });

  const node_g = g.append('g')
    .selectAll('g')
    .data(root.descendants())
    .join('g')
    .attr('transform', (d: any) =>
      `translate(${(d.x || 0) + offset_x - NODE_W / 2},${(d.y || 0) + offset_y - NODE_H / 2})`)
    .attr('cursor', 'pointer')
    .on('mousemove', (event: MouseEvent, d: any) => on_hover(d.data, event))
    .on('mouseleave', on_leave);

  node_g.append('rect')
    .attr('width', NODE_W).attr('height', NODE_H).attr('rx', 6)
    .attr('fill', '#d6d6d6').attr('stroke', '#666').attr('stroke-width', 1.5);

  node_g.append('text')
    .attr('x', NODE_W / 2).attr('y', NODE_H / 2 + 5)
    .attr('text-anchor', 'middle').attr('fill', '#000')
    .attr('font-size', '12px').attr('font-family', 'Consolas, monospace')
    .attr('pointer-events', 'none')
    .text((d: any) => short_label(d.data.label));

  g.append('g').selectAll('text').data(root.links()).join('text')
    .attr('x', (d: any) => ((d.source.x || 0) + (d.target.x || 0)) / 2 + offset_x)
    .attr('y', (d: any) => ((d.source.y || 0) + (d.target.y || 0)) / 2 + offset_y - 8)
    .attr('text-anchor', 'middle').attr('fill', '#666')
    .attr('font-size', '11px').attr('font-family', 'Consolas, monospace')
    .attr('pointer-events', 'none')
    .text(d => graph.edges.find(e => e.source === d.source.data.id && e.target === d.target.data.id)?.label || '');
}

function render_force(
  graph: DataGraph,
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  width: number,
  height: number,
  on_hover: HoverHandler,
  on_leave: LeaveHandler
): void {
  const nodes: any[] = graph.nodes.map(n => ({ ...n }));
  const links: any[] = graph.edges.map(e => ({ ...e }));

  const simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id((d: any) => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2));

  const link = g.append('g').attr('stroke', '#999').attr('stroke-width', 1.5)
    .selectAll('line').data(links).join('line');

  const node_g = g.append('g').selectAll('g').data(nodes).join('g')
    .attr('cursor', 'pointer')
    .on('mousemove', (event: MouseEvent, d: any) => on_hover(d, event))
    .on('mouseleave', on_leave)
    .call(d3.drag<any, any>()
      .on('start', (event: any, d: any) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event: any, d: any) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event: any, d: any) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null; d.fy = null;
      })
    );

  node_g.append('rect')
    .attr('width', NODE_W).attr('height', NODE_H).attr('rx', 6)
    .attr('fill', '#d6d6d6').attr('stroke', '#666').attr('stroke-width', 1.5);

  node_g.append('text')
    .attr('x', NODE_W / 2).attr('y', NODE_H / 2 + 5)
    .attr('text-anchor', 'middle').attr('fill', '#000')
    .attr('font-size', '12px').attr('font-family', 'Consolas, monospace')
    .attr('pointer-events', 'none')
    .text((d: any) => short_label(d.label));

  simulation.on('tick', () => {
    link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y);
    node_g.attr('transform', (d: any) =>
      `translate(${d.x - NODE_W / 2},${d.y - NODE_H / 2})`);
  });
}
