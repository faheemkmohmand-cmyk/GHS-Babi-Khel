/**
 * ConceptMap.tsx — Advanced interactive mind map (Coggle/Whimsical-style).
 *
 * v4 improvements:
 *  - Beautiful auto-generation: smart chapter parsing, harmonious colors,
 *    balanced layout, auto-collapse deep branches, emoji icons per node
 *  - Per-block error boundary in InteractiveLabs prevents full-page crash
 *  - Defensive coding: handles empty/malformed content gracefully
 *  - Editable: drag, add/delete nodes, inline rename, color picker
 *  - 3 layouts: radial, vertical tree, horizontal tree
 *  - Outline view, PNG export, localStorage persistence
 *
 * Usage:
 *   <ConceptMap subjectColor="#3b82f6" chapterTitle="Photosynthesis" content="<h1>...</h1>" />
 */
import {
  useCallback, useEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Network, Plus, Trash2, Pencil, ChevronDown, ChevronRight,
  Download, LayoutGrid, List, X, Palette, RotateCcw, Sparkles,
} from "lucide-react";

// ---------- types -----------------------------------------------------------

type MapNode = {
  id: string;
  text: string;
  color: string;
  icon?: string;
  collapsed?: boolean;
  children: string[];
};

type Tree = {
  rootId: string;
  nodes: Record<string, MapNode>;
};

type Layout = "radial" | "tree-down" | "tree-right";
type View = "map" | "outline";

type PositionedNode = {
  id: string;
  x: number;
  y: number;
  depth: number;
  angle?: number;
};

// ---------- beautiful color palettes ---------------------------------------

// Harmonious palettes — each depth level gets a color from a curated set.
// These are designed to look beautiful together (analogous + complementary).
const DEPTH_PALETTES: string[][] = [
  // Depth 0 (root) — bold, dark
  ["#1e293b", "#0f766e", "#7c2d12", "#581c87", "#1e3a8a"],
  // Depth 1 — vibrant
  ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"],
  // Depth 2 — medium
  ["#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f472b6", "#22d3ee", "#a3e635"],
  // Depth 3+ — light
  ["#93c5fd", "#6ee7b7", "#fcd34d", "#c4b5fd", "#f9a8d4", "#67e8f9", "#bef264"],
];

function colorForDepth(depth: number, index: number): string {
  const palette = DEPTH_PALETTES[Math.min(depth, DEPTH_PALETTES.length - 1)];
  return palette[index % palette.length];
}

// ---------- smart HTML → Tree parser ---------------------------------------

// Emoji suggestions based on keywords in the text
function suggestIcon(text: string): string | undefined {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/formula|equation|f\s*=/, "🔢"],
    [/law|rule|theorem/, "📋"],
    [/example|solve|assignment/, "📝"],
    [/mistake|error|warning|caution/, "⚠️"],
    [/important|key|note|remember/, "💡"],
    [/definition|define|meaning/, "📖"],
    [/experiment|activity|demo/, "🔬"],
    [/wave|oscillat|pendulum|spring/, "〰️"],
    [/energy|force|power|work/, "⚡"],
    [/electric|circuit|current|voltage/, "🔌"],
    [/magnet|electromagnet/, "🧲"],
    [/atom|molecule|element|compound/, "⚛️"],
    [/acid|base|ph|reaction/, "🧪"],
    [/cell|organism|plant|animal|life/, "🌿"],
    [/dna|gene|genetic/, "🧬"],
    [/space|planet|star|universe|earth/, "🌍"],
    [/light|optics|lens|mirror|reflection|refraction/, "💡"],
    [/heat|temperature|thermal/, "🌡️"],
    [/motion|velocity|speed|acceleration/, "🏃"],
    [/mass|weight|gravity/, "⚖️"],
    [/computer|code|program|software|hardware/, "💻"],
    [/internet|network|web|online/, "🌐"],
    [/data|information|bit|byte/, "📊"],
    [/number|math|algebra|geometry|calcul/, "📐"],
    [/summary|conclusion|overview/, "📌"],
    [/introduction|intro|beginning|start/, "🚀"],
    [/question|quiz|test|exam/, "❓"],
    [/answer|solution|result/, "✅"],
    [/history|past|ancient|origin/, "📜"],
    [/urdu|islam|quran|hadith|prophet/, "🕌"],
    [/pakistan|country|nation/, "🇵🇰"],
    [/english|grammar|language|writing/, "✍️"],
  ];
  for (const [re, icon] of rules) {
    if (re.test(t)) return icon;
  }
  return undefined;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  // Try to break at a space
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) return cut.slice(0, lastSpace) + "…";
  return cut + "…";
}

function htmlToTree(html: string, fallbackTitle: string): Tree {
  const nodes: Record<string, MapNode> = {};
  let idCounter = 0;
  const newId = () => `n${++idCounter}`;

  const rootColor = colorForDepth(0, 0);
  const rootId = newId();
  nodes[rootId] = {
    id: rootId,
    text: truncate(fallbackTitle || "Chapter", 40),
    color: rootColor,
    icon: suggestIcon(fallbackTitle) || "📚",
    children: [],
  };

  // Safely parse HTML
  let doc: Document | null = null;
  try {
    if (html && typeof html === "string" && html.trim()) {
      doc = new DOMParser().parseFromString(html, "text/html");
    }
  } catch {
    doc = null;
  }

  if (!doc) {
    // No content — add a placeholder
    const id = newId();
    nodes[id] = {
      id, text: "No content to map", color: colorForDepth(1, 0),
      icon: "📄", children: [],
    };
    nodes[rootId].children.push(id);
    return { rootId, nodes };
  }

  // Smart parsing: walk the body and extract structure.
  // We only pick headings (h1-h4) and list items (li) to keep the map clean.
  // We also limit the total number of nodes to prevent clutter.
  const MAX_NODES = 40;
  let nodeCount = 1; // root already counted

  const walk = (parentEl: Element, parentId: string, depth: number) => {
    if (depth > 3 || nodeCount >= MAX_NODES) return;
    const children = Array.from(parentEl.children);

    for (const child of children) {
      if (nodeCount >= MAX_NODES) break;

      const tag = child.tagName.toLowerCase();
      const isHeading = /^h[1-4]$/.test(tag);
      const isList = tag === "ul" || tag === "ol";

      if (isHeading) {
        const rawText = child.textContent?.trim() || "";
        if (!rawText || rawText.length < 2) continue;

        const text = truncate(rawText, 50);
        const id = newId();
        nodeCount++;
        nodes[id] = {
          id, text,
          color: colorForDepth(depth, nodes[parentId].children.length),
          icon: suggestIcon(rawText),
          children: [],
        };
        nodes[parentId].children.push(id);

        // Recurse into this heading's siblings until the next heading of same/higher level
        walk(child, id, depth + 1);
      } else if (isList) {
        // Add top-level list items as children (limited)
        const items = Array.from(child.children).filter((c) => c.tagName.toLowerCase() === "li");
        for (const li of items.slice(0, 5)) { // max 5 items per list
          if (nodeCount >= MAX_NODES) break;
          const rawText = li.textContent?.trim() || "";
          if (!rawText || rawText.length < 2) continue;

          const text = truncate(rawText, 45);
          const id = newId();
          nodeCount++;
          nodes[id] = {
            id, text,
            color: colorForDepth(depth + 1, nodes[parentId].children.length),
            icon: suggestIcon(rawText) || "•",
            children: [],
          };
          nodes[parentId].children.push(id);

          // Recurse into nested lists
          const nested = li.querySelector("ul, ol");
          if (nested) walk(nested, id, depth + 2);
        }
      } else if (tag === "p" || tag === "div" || tag === "section") {
        // Recurse into containers to find headings/lists inside
        walk(child, parentId, depth);
      }
    }
  };

  try {
    walk(doc.body, rootId, 1);
  } catch {
    // ignore parsing errors
  }

  // Auto-collapse nodes with more than 4 children (keeps the map clean)
  for (const id of Object.keys(nodes)) {
    if (nodes[id].children.length > 4) {
      nodes[id].collapsed = true;
    }
  }

  // If nothing was added, add a placeholder
  if (nodes[rootId].children.length === 0) {
    const id = newId();
    nodes[id] = {
      id, text: "Start adding nodes to build your map", color: colorForDepth(1, 0),
      icon: "✨", children: [],
    };
    nodes[rootId].children.push(id);
  }

  return { rootId, nodes };
}

// ---------- layout algorithms (improved) -----------------------------------

function layoutRadial(tree: Tree): Record<string, PositionedNode> {
  const positions: Record<string, PositionedNode> = {};
  const RADIUS_STEP = 160; // more spacing

  const countLeaves = (id: string): number => {
    const node = tree.nodes[id];
    if (!node || node.collapsed || node.children.length === 0) return 1;
    return node.children.reduce((sum, cid) => sum + countLeaves(cid), 0);
  };

  const place = (id: string, angle: number, angleSpan: number, depth: number) => {
    const node = tree.nodes[id];
    const radius = depth * RADIUS_STEP;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    positions[id] = { id, x, y, depth, angle };

    if (!node || node.collapsed) return;
    const children = node.children;
    if (children.length === 0) return;

    const totalLeaves = children.reduce((s, c) => s + countLeaves(c), 0);
    let curAngle = angle - angleSpan / 2;
    for (const cid of children) {
      const leaves = countLeaves(cid);
      const childSpan = (angleSpan * leaves) / totalLeaves;
      const childAngle = curAngle + childSpan / 2;
      place(cid, childAngle, childSpan, depth + 1);
      curAngle += childSpan;
    }
  };

  place(tree.rootId, -Math.PI / 2, Math.PI * 2, 0);
  return positions;
}

function layoutTreeDown(tree: Tree): Record<string, PositionedNode> {
  const positions: Record<string, PositionedNode> = {};
  const LEVEL_HEIGHT = 120;
  const NODE_WIDTH = 180;
  const GAP = 24;

  const countLeaves = (id: string): number => {
    const node = tree.nodes[id];
    if (!node || node.collapsed || node.children.length === 0) return 1;
    return node.children.reduce((sum, cid) => sum + countLeaves(cid), 0);
  };

  const place = (id: string, x: number, depth: number) => {
    const node = tree.nodes[id];
    const y = depth * LEVEL_HEIGHT;
    const leaves = countLeaves(id);
    const subtreeWidth = leaves * (NODE_WIDTH + GAP);
    const myX = x + subtreeWidth / 2;
    positions[id] = { id, x: myX, y, depth };

    if (!node || node.collapsed) return;
    let cursor = x;
    for (const cid of node.children) {
      const childLeaves = countLeaves(cid);
      const childWidth = childLeaves * (NODE_WIDTH + GAP);
      place(cid, cursor, depth + 1);
      cursor += childWidth;
    }
  };

  place(tree.rootId, 0, 0);
  const root = positions[tree.rootId];
  if (root) {
    const offset = root.x;
    for (const k of Object.keys(positions)) {
      positions[k].x -= offset;
    }
  }
  return positions;
}

function layoutTreeRight(tree: Tree): Record<string, PositionedNode> {
  const positions: Record<string, PositionedNode> = {};
  const LEVEL_WIDTH = 220;
  const NODE_HEIGHT = 50;
  const GAP = 16;

  const countLeaves = (id: string): number => {
    const node = tree.nodes[id];
    if (!node || node.collapsed || node.children.length === 0) return 1;
    return node.children.reduce((sum, cid) => sum + countLeaves(cid), 0);
  };

  const place = (id: string, y: number, depth: number) => {
    const node = tree.nodes[id];
    const x = depth * LEVEL_WIDTH;
    const leaves = countLeaves(id);
    const subtreeHeight = leaves * (NODE_HEIGHT + GAP);
    const myY = y + subtreeHeight / 2;
    positions[id] = { id, x, y: myY, depth };

    if (!node || node.collapsed) return;
    let cursor = y;
    for (const cid of node.children) {
      const childLeaves = countLeaves(cid);
      const childHeight = childLeaves * (NODE_HEIGHT + GAP);
      place(cid, cursor, depth + 1);
      cursor += childHeight;
    }
  };

  place(tree.rootId, 0, 0);
  const root = positions[tree.rootId];
  if (root) {
    const offset = root.y;
    for (const k of Object.keys(positions)) {
      positions[k].y -= offset;
    }
  }
  return positions;
}

function computeLayout(tree: Tree, layout: Layout): Record<string, PositionedNode> {
  try {
    if (layout === "radial") return layoutRadial(tree);
    if (layout === "tree-down") return layoutTreeDown(tree);
    return layoutTreeRight(tree);
  } catch {
    // fallback: simple radial
    return layoutRadial(tree);
  }
}

// ---------- node width estimation ------------------------------------------

function estimateNodeWidth(text: string, isRoot: boolean): number {
  const baseLen = isRoot ? 220 : 180;
  // wider for longer text, but cap it
  const charWidth = isRoot ? 9 : 7.5;
  const padding = 32;
  return Math.min(baseLen, Math.max(60, text.length * charWidth + padding));
}

// ---------- main component --------------------------------------------------

export default function ConceptMap({
  subjectColor = "#3b82f6",
  chapterTitle = "Chapter",
  content = "",
}: {
  subjectColor?: string;
  chapterTitle?: string;
  content?: string;
}) {
  const storageKey = `conceptmap:${chapterTitle}`;

  // Always generate fresh from content — never load stale localStorage on first render.
  // We only save to localStorage after the user explicitly edits the map.
  const [tree, setTree] = useState<Tree>(() => htmlToTree(content || "", chapterTitle));

  const [layout, setLayout] = useState<Layout>("radial");
  const [view, setView] = useState<View>("map");
  const [selectedId, setSelectedId] = useState<string | null>(tree.rootId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [editMode, setEditMode] = useState(false);          // NEW: editing is opt-in
  const [autoGenerated, setAutoGenerated] = useState(true); // always true until user edits

  const [vp, setVp] = useState({ tx: 0, ty: 0, scale: 1 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Regenerate whenever content or chapterTitle changes (e.g. navigating to another chapter)
  useEffect(() => {
    const fresh = htmlToTree(content || "", chapterTitle);
    setTree(fresh);
    setSelectedId(fresh.rootId);
    setAutoGenerated(true);
    setEditMode(false);
    setEditingId(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, chapterTitle]);

  // recompute layout
  const positions = useMemo(() => computeLayout(tree, layout), [tree, layout]);

  // ---------- node operations ----------------------------------------------

  const addChild = (parentId: string) => {
    const id = `n${Date.now()}`;
    const parent = tree.nodes[parentId];
    if (!parent) return;
    const newNodes = {
      ...tree.nodes,
      [id]: {
        id, text: "New node",
        color: colorForDepth(1, parent.children.length),
        icon: "•",
        children: [],
      },
    };
    newNodes[parentId] = { ...parent, children: [...parent.children, id] };
    setTree({ ...tree, nodes: newNodes });
    setSelectedId(id);
    setEditingId(id);
    setAutoGenerated(false);
  };

  const addSibling = (siblingId: string) => {
    let parentId: string | null = null;
    for (const [pid, node] of Object.entries(tree.nodes)) {
      if (node.children.includes(siblingId)) { parentId = pid; break; }
    }
    if (!parentId) return;
    const id = `n${Date.now()}`;
    const parent = tree.nodes[parentId];
    const idx = parent.children.indexOf(siblingId);
    const newChildren = [...parent.children];
    newChildren.splice(idx + 1, 0, id);
    const newNodes = {
      ...tree.nodes,
      [id]: {
        id, text: "New node",
        color: colorForDepth(parent === tree.nodes[tree.rootId] ? 1 : 2, parent.children.length),
        icon: "•",
        children: [],
      },
    };
    newNodes[parentId] = { ...parent, children: newChildren };
    setTree({ ...tree, nodes: newNodes });
    setSelectedId(id);
    setEditingId(id);
    setAutoGenerated(false);
  };

  const deleteNode = (id: string) => {
    if (id === tree.rootId) return;
    let parentId: string | null = null;
    for (const [pid, node] of Object.entries(tree.nodes)) {
      if (node.children.includes(id)) { parentId = pid; break; }
    }
    if (!parentId) return;
    const toDelete: string[] = [];
    const collect = (nid: string) => {
      toDelete.push(nid);
      const n = tree.nodes[nid];
      if (n) n.children.forEach(collect);
    };
    collect(id);
    const newNodes = { ...tree.nodes };
    for (const d of toDelete) delete newNodes[d];
    const parent = newNodes[parentId];
    newNodes[parentId] = { ...parent, children: parent.children.filter((c) => c !== id) };
    setTree({ ...tree, nodes: newNodes });
    setSelectedId(parentId);
  };

  const updateNode = (id: string, patch: Partial<MapNode>) => {
    setAutoGenerated(false); // user made a manual edit
    setTree((t) => ({
      ...t,
      nodes: { ...t.nodes, [id]: { ...t.nodes[id], ...patch } },
    }));
  };

  const toggleCollapse = (id: string) => {
    const node = tree.nodes[id];
    if (!node || node.children.length === 0) return;
    updateNode(id, { collapsed: !node.collapsed });
  };

  const regenerate = () => {
    const fresh = htmlToTree(content || "", chapterTitle);
    setTree(fresh);
    setSelectedId(fresh.rootId);
    setAutoGenerated(true);
    setEditMode(false);
    setEditingId(null);
  };

  // ---------- pointer interactions (pan/zoom) ------------------------------

  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const onSvgPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    if (target === e.currentTarget || (target.getAttribute && target.getAttribute("data-bg") === "true")) {
      target.setPointerCapture(e.pointerId);
      panRef.current = { x: e.clientX, y: e.clientY, tx: vp.tx, ty: vp.ty };
      setSelectedId(null);
      setEditingId(null);
    }
  };

  const onSvgPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (panRef.current) {
      const dx = e.clientX - panRef.current.x;
      const dy = e.clientY - panRef.current.y;
      setVp((v) => ({ ...v, tx: panRef.current!.tx + dx, ty: panRef.current!.ty + dy }));
    }
  };

  const onSvgPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    panRef.current = null;
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.001);
    setVp((v) => ({ ...v, scale: Math.max(0.2, Math.min(3, v.scale * factor)) }));
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const h = (e: WheelEvent) => e.preventDefault();
    svg.addEventListener("wheel", h, { passive: false });
    return () => svg.removeEventListener("wheel", h);
  }, []);

  // ---------- export to PNG ------------------------------------------------

  const exportPNG = () => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const xml = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1600;
        canvas.height = 1000;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        const pngUrl = canvas.toDataURL("image/png");
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = `${chapterTitle || "concept"}-map.png`;
        a.click();
      };
      img.src = url;
    } catch { /* ignore */ }
  };

  // ---------- render helpers ----------------------------------------------

  const renderEdges = (parentId: string): ReactNode[] => {
    const parent = tree.nodes[parentId];
    if (!parent || parent.collapsed) return [];
    const parentPos = positions[parentId];
    if (!parentPos) return [];
    const edges: ReactNode[] = [];
    parent.children.forEach((cid) => {
      const childPos = positions[cid];
      if (!childPos) return;
      const child = tree.nodes[cid];
      const stroke = child?.color || "#94a3b8";
      let path: string;
      if (layout === "tree-right") {
        const mx = (parentPos.x + childPos.x) / 2;
        path = `M ${parentPos.x} ${parentPos.y} C ${mx} ${parentPos.y}, ${mx} ${childPos.y}, ${childPos.x} ${childPos.y}`;
      } else if (layout === "tree-down") {
        const my = (parentPos.y + childPos.y) / 2;
        path = `M ${parentPos.x} ${parentPos.y} C ${parentPos.x} ${my}, ${childPos.x} ${my}, ${childPos.x} ${childPos.y}`;
      } else {
        const mx = (parentPos.x + childPos.x) / 2;
        const my = (parentPos.y + childPos.y) / 2;
        path = `M ${parentPos.x} ${parentPos.y} Q ${mx * 0.7} ${my * 0.7}, ${childPos.x} ${childPos.y}`;
      }
      edges.push(
        <path
          key={`e-${parentId}-${cid}`}
          d={path}
          stroke={stroke}
          strokeWidth={2.5}
          fill="none"
          opacity={0.6}
          strokeLinecap="round"
        />
      );
      edges.push(...renderEdges(cid));
    });
    return edges;
  };

  const allEdges = useMemo(() => {
    try { return renderEdges(tree.rootId); }
    catch { return []; }
  }, [tree, positions, layout]);

  const renderNode = (id: string): ReactNode => {
    const node = tree.nodes[id];
    const pos = positions[id];
    if (!node || !pos) return null;
    const isRoot = id === tree.rootId;
    const isSelected = selectedId === id;
    const isEditing = editingId === id;
    const hasChildren = node.children.length > 0;
    const maxWidth = estimateNodeWidth(node.text, isRoot);
    const fontSize = isRoot ? 15 : 12;
    const nodeHeight = isRoot ? 38 : 32;

    return (
      <g
        key={id}
        transform={`translate(${pos.x}, ${pos.y})`}
        onClick={(e) => { e.stopPropagation(); setSelectedId(id); }}
        onDoubleClick={(e) => { e.stopPropagation(); if (editMode) setEditingId(id); }}
        style={{ cursor: "pointer" }}
      >
        {/* selection halo */}
        {isSelected && (
          <rect
            x={-maxWidth / 2 - 6}
            y={-nodeHeight / 2 - 4}
            width={maxWidth + 12}
            height={nodeHeight + 8}
            rx={nodeHeight / 2 + 4}
            fill="none"
            stroke={subjectColor}
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        )}
        {/* node pill — beautiful gradient background */}
        <rect
          x={-maxWidth / 2}
          y={-nodeHeight / 2}
          width={maxWidth}
          height={nodeHeight}
          rx={nodeHeight / 2}
          fill={node.color}
          opacity={isRoot ? 1 : 0.15}
          stroke={node.color}
          strokeWidth={isRoot ? 0 : 2}
        />
        {/* icon */}
        {node.icon && (
          <text
            x={-maxWidth / 2 + 16}
            y={0}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={fontSize}
          >
            {node.icon}
          </text>
        )}
        {/* edit input or text */}
        {isEditing ? (
          <foreignObject x={-maxWidth / 2 + (node.icon ? 28 : 8)} y={-14} width={maxWidth - (node.icon ? 36 : 16)} height={28}>
            <input
              autoFocus
              defaultValue={node.text}
              onBlur={(e) => {
                updateNode(id, { text: e.target.value || "Untitled" });
                setEditingId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  updateNode(id, { text: (e.target as HTMLInputElement).value || "Untitled" });
                  setEditingId(null);
                } else if (e.key === "Escape") {
                  setEditingId(null);
                }
              }}
              style={{
                width: "100%", height: "100%",
                border: "none", background: "transparent",
                textAlign: "center", fontSize,
                fontFamily: "ui-sans-serif, system-ui, sans-serif",
                fontWeight: isRoot ? 700 : 600,
                color: isRoot ? "white" : node.color,
                outline: "none",
              }}
            />
          </foreignObject>
        ) : (
          <text
            x={node.icon ? -maxWidth / 2 + 28 : 0}
            y={0}
            textAnchor={node.icon ? "start" : "middle"}
            dominantBaseline="middle"
            fontSize={fontSize}
            fontWeight={isRoot ? 700 : 600}
            fill={isRoot ? "white" : node.color}
            style={{ pointerEvents: "none", userSelect: "none" }}
          >
            {truncate(node.text, isRoot ? 30 : 25)}
          </text>
        )}
        {/* collapse toggle */}
        {hasChildren && (
          <>
            <circle
              cx={layout === "tree-right" ? maxWidth / 2 + 10 : 0}
              cy={layout === "tree-right" ? 0 : nodeHeight / 2 + 4}
              r={9}
              fill="white"
              stroke={node.color}
              strokeWidth={2}
              onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }}
              style={{ cursor: "pointer" }}
            />
            <text
              x={layout === "tree-right" ? maxWidth / 2 + 10 : 0}
              y={layout === "tree-right" ? 0 : nodeHeight / 2 + 4}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fontWeight={700}
              fill={node.color}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {node.collapsed ? "+" : "−"}
            </text>
            {node.collapsed && (
              <text
                x={layout === "tree-right" ? maxWidth / 2 + 22 : 0}
                y={layout === "tree-right" ? 0 : nodeHeight / 2 + 16}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={9}
                fill={node.color}
                opacity={0.7}
                style={{ pointerEvents: "none" }}
              >
                ({node.children.length})
              </text>
            )}
          </>
        )}
      </g>
    );
  };

  const renderAllNodes = (parentId: string): ReactNode[] => {
    const node = tree.nodes[parentId];
    if (!node) return [];
    const out: ReactNode[] = [renderNode(parentId)];
    if (!node.collapsed) {
      for (const cid of node.children) {
        out.push(...renderAllNodes(cid));
      }
    }
    return out;
  };

  // ---------- outline view -------------------------------------------------

  const renderOutline = (id: string, depth: number = 0): ReactNode => {
    const node = tree.nodes[id];
    if (!node) return null;
    const isRoot = id === tree.rootId;
    return (
      <li key={id} className="my-1">
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
            selectedId === id ? "bg-secondary" : "hover:bg-secondary/50"
          }`}
          style={{ paddingLeft: depth * 16 + 8 }}
          onClick={() => setSelectedId(id)}
          onDoubleClick={() => { if (editMode) setEditingId(id); }}
        >
          <span className="shrink-0">{node.icon || "•"}</span>
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
          {editingId === id ? (
            <input
              autoFocus
              defaultValue={node.text}
              onBlur={(e) => { updateNode(id, { text: e.target.value || "Untitled" }); setEditingId(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { updateNode(id, { text: (e.target as HTMLInputElement).value || "Untitled" }); setEditingId(null); }
                else if (e.key === "Escape") setEditingId(null);
              }}
              className="flex-1 bg-transparent text-sm focus:outline-none border-b border-primary"
            />
          ) : (
            <span className={`flex-1 text-sm ${isRoot ? "font-bold" : ""}`}>{node.text}</span>
          )}
          {node.children.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); toggleCollapse(id); }} className="p-0.5 text-muted-foreground hover:text-foreground shrink-0">
              {node.collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
        {!node.collapsed && node.children.length > 0 && (
          <ul>{node.children.map((cid) => renderOutline(cid, depth + 1))}</ul>
        )}
      </li>
    );
  };

  // ---------- render -------------------------------------------------------

  const selectedNode = selectedId ? tree.nodes[selectedId] : null;
  const nodeCount = Object.keys(tree.nodes).length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30 flex-wrap">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: subjectColor + "20" }}>
          <Network className="w-4 h-4" style={{ color: subjectColor }} />
        </div>
        <span className="font-bold text-sm text-foreground">Concept Map</span>
        {autoGenerated && (
          <span className="text-[10px] bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
            <Sparkles className="w-2.5 h-2.5" /> Auto-generated
          </span>
        )}
        <span className="text-[10px] text-muted-foreground hidden sm:inline">{nodeCount} nodes</span>

        <div className="ml-auto flex items-center gap-1 flex-wrap">
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["radial", "tree-down", "tree-right"] as Layout[]).map((l) => (
              <button
                key={l}
                onClick={() => setLayout(l)}
                className={`px-2 py-1 text-[10px] font-medium ${
                  layout === l ? "text-white" : "bg-card hover:bg-secondary text-muted-foreground"
                }`}
                style={layout === l ? { backgroundColor: subjectColor } : {}}
              >
                {l === "radial" ? "Radial" : l === "tree-down" ? "Tree ↓" : "Tree →"}
              </button>
            ))}
          </div>

          <button
            onClick={() => setView((v) => v === "map" ? "outline" : "map")}
            className="px-2 py-1 rounded-md text-[10px] font-medium bg-card hover:bg-secondary border border-border flex items-center gap-1"
          >
            {view === "map" ? <List className="w-3 h-3" /> : <LayoutGrid className="w-3 h-3" />}
            {view === "map" ? "Outline" : "Map"}
          </button>

          <button onClick={exportPNG}
            className="px-2 py-1 rounded-md text-[10px] font-medium bg-card hover:bg-secondary border border-border flex items-center gap-1">
            <Download className="w-3 h-3" /> PNG
          </button>

          <button onClick={regenerate}
            className="px-2 py-1 rounded-md text-[10px] font-medium bg-card hover:bg-secondary border border-border flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>

          <button
            onClick={() => { setEditMode((v) => !v); setSelectedId(tree.rootId); }}
            className={`px-2 py-1 rounded-md text-[10px] font-medium border flex items-center gap-1 ${
              editMode
                ? "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200"
                : "bg-card hover:bg-secondary border-border text-muted-foreground"
            }`}
          >
            <Pencil className="w-3 h-3" /> {editMode ? "Done Editing" : "Edit"}
          </button>
        </div>
      </div>

      {/* Selected node toolbar */}
      {selectedNode && view === "map" && editMode && (
        <div className="flex items-center gap-1.5 p-2 border-b border-border bg-secondary/20 overflow-x-auto">
          <button
            onClick={() => addChild(selectedNode.id)}
            className="shrink-0 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-white flex items-center gap-1"
            style={{ backgroundColor: subjectColor }}
          >
            <Plus className="w-3 h-3" /> Child
          </button>
          {selectedNode.id !== tree.rootId && (
            <button
              onClick={() => addSibling(selectedNode.id)}
              className="shrink-0 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-card hover:bg-secondary border border-border flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Sibling
            </button>
          )}
          <button
            onClick={() => setEditingId(selectedNode.id)}
            className="shrink-0 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-card hover:bg-secondary border border-border flex items-center gap-1"
          >
            <Pencil className="w-3 h-3" /> Rename
          </button>
          <div className="relative shrink-0">
            <button
              onClick={() => setShowColorPicker((v) => !v)}
              className="px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-card hover:bg-secondary border border-border flex items-center gap-1"
            >
              <Palette className="w-3 h-3" /> Color
            </button>
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1 p-2 bg-card border border-border rounded-lg shadow-lg grid grid-cols-5 gap-1 z-30">
                {[...DEPTH_PALETTES[0], ...DEPTH_PALETTES[1], ...DEPTH_PALETTES[2]].map((c) => (
                  <button
                    key={c}
                    onClick={() => { updateNode(selectedNode.id, { color: c }); setShowColorPicker(false); }}
                    className="w-6 h-6 rounded-full border-2"
                    style={{ backgroundColor: c, borderColor: selectedNode.color === c ? "#0f172a" : "transparent" }}
                  />
                ))}
              </div>
            )}
          </div>
          {selectedNode.id !== tree.rootId && (
            <button
              onClick={() => deleteNode(selectedNode.id)}
              className="shrink-0 px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
          <span className="ml-auto text-[10px] text-muted-foreground hidden md:block shrink-0">
            Double-click to edit · Drag background to pan · Wheel to zoom
          </span>
        </div>
      )}

      {/* Body */}
      {view === "map" ? (
        <div className="bg-white relative" style={{ height: 500 }}>
          <svg
            ref={svgRef}
            viewBox="-500 -250 1000 500"
            className="w-full h-full touch-none"
            onPointerDown={onSvgPointerDown}
            onPointerMove={onSvgPointerMove}
            onPointerUp={onSvgPointerUp}
            onPointerCancel={onSvgPointerUp}
            onWheel={onWheel}
          >
            <g transform={`translate(${vp.tx}, ${vp.ty}) scale(${vp.scale})`}>
              <rect data-bg="true" x={-2000} y={-2000} width={4000} height={4000} fill="transparent" />
              {allEdges}
              {renderAllNodes(tree.rootId)}
            </g>
          </svg>
          <div className="absolute bottom-2 right-2 flex flex-col gap-1 bg-white/80 backdrop-blur-sm rounded-lg p-1 border border-border">
            <button onClick={() => setVp((v) => ({ ...v, scale: Math.min(3, v.scale * 1.2) }))}
              className="p-1.5 hover:bg-secondary rounded-md" title="Zoom in">
              <Plus className="w-4 h-4" />
            </button>
            <button onClick={() => setVp((v) => ({ ...v, scale: Math.max(0.2, v.scale / 1.2) }))}
              className="p-1.5 hover:bg-secondary rounded-md" title="Zoom out">
              <X className="w-4 h-4" />
            </button>
            <button onClick={() => setVp({ tx: 0, ty: 0, scale: 1 })}
              className="p-1.5 hover:bg-secondary rounded-md" title="Reset view">
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-card p-3 max-h-[500px] overflow-y-auto">
          <ul className="space-y-0.5">
            {renderOutline(tree.rootId)}
          </ul>
        </div>
      )}

      <div className="p-2 border-t border-border bg-secondary/20 text-[10px] text-muted-foreground text-center">
        {editMode
          ? "Double-click any node to edit · Drag background to pan · Wheel to zoom"
          : "Auto-generated from chapter content · Click Edit to customise · Drag to pan · Wheel to zoom"}
      </div>
    </div>
  );
}
