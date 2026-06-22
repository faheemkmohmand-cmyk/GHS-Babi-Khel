/**
 * ConceptMap.tsx — Read-only auto-generated mind map.
 *
 * v6 — CRITICAL: This is now a READ-ONLY view. No editing, no Edit button,
 * no add/delete/rename, no color picker. It is purely an auto-generated
 * visual summary of the chapter content.
 *
 * Features:
 *  - Auto-generates a mind map from chapter HTML (headings + lists)
 *  - 3 layouts: radial, vertical tree, horizontal tree
 *  - Outline view (toggle)
 *  - Pan (drag background) + zoom (wheel / buttons)
 *  - PNG export
 *  - Collapse/expand branches (click the +/- circle on nodes)
 *  - Reset to re-generate from chapter content
 *
 * Usage:
 *   <ConceptMap subjectColor="#3b82f6" chapterTitle="Photosynthesis" content="<h1>...</h1>" />
 */
import {
  useEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Network, ChevronDown, ChevronRight,
  Download, LayoutGrid, List, RotateCcw, Sparkles, ZoomIn, ZoomOut,
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
type ViewMode = "map" | "outline";

type PositionedNode = {
  id: string;
  x: number;
  y: number;
  depth: number;
  angle?: number;
};

// ---------- color palettes --------------------------------------------------

const DEPTH_PALETTES: string[][] = [
  ["#1e293b", "#0f766e", "#7c2d12", "#581c87", "#1e3a8a"],
  ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"],
  ["#60a5fa", "#34d399", "#fbbf24", "#a78bfa", "#f472b6", "#22d3ee", "#a3e635"],
  ["#93c5fd", "#6ee7b7", "#fcd34d", "#c4b5fd", "#f9a8d4", "#67e8f9", "#bef264"],
];

function colorForDepth(depth: number, index: number): string {
  const palette = DEPTH_PALETTES[Math.min(depth, DEPTH_PALETTES.length - 1)];
  return palette[index % palette.length];
}

// ---------- icon suggestions ------------------------------------------------

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
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) return cut.slice(0, lastSpace) + "…";
  return cut + "…";
}

// ---------- HTML → Tree parser ---------------------------------------------

function htmlToTree(html: string, fallbackTitle: string): Tree {
  const nodes: Record<string, MapNode> = {};
  let idCounter = 0;
  const newId = () => `n${++idCounter}`;

  const rootColor = colorForDepth(0, 0);
  const rootId = newId();
  const safeTitle = (fallbackTitle || "Chapter").trim() || "Chapter";
  nodes[rootId] = {
    id: rootId,
    text: truncate(safeTitle, 40),
    color: rootColor,
    icon: suggestIcon(safeTitle) || "📚",
    children: [],
  };

  let doc: Document | null = null;
  try {
    if (html && typeof html === "string" && html.trim()) {
      if (typeof DOMParser !== "undefined") {
        doc = new DOMParser().parseFromString(html, "text/html");
      }
    }
  } catch {
    doc = null;
  }

  if (!doc) {
    const id = newId();
    nodes[id] = {
      id, text: "No chapter content to map yet", color: colorForDepth(1, 0),
      icon: "📄", children: [],
    };
    nodes[rootId].children.push(id);
    return { rootId, nodes };
  }

  const MAX_NODES = 40;
  let nodeCount = 1;

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
        walk(child, id, depth + 1);
      } else if (isList) {
        const items = Array.from(child.children).filter((c) => c.tagName.toLowerCase() === "li");
        for (const li of items.slice(0, 5)) {
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

          const nested = li.querySelector("ul, ol");
          if (nested) walk(nested, id, depth + 2);
        }
      } else if (tag === "p" || tag === "div" || tag === "section") {
        walk(child, parentId, depth);
      }
    }
  };

  try {
    walk(doc.body, rootId, 1);
  } catch {
    // ignore
  }

  for (const id of Object.keys(nodes)) {
    if (nodes[id].children.length > 4) {
      nodes[id].collapsed = true;
    }
  }

  if (nodes[rootId].children.length === 0) {
    const id = newId();
    nodes[id] = {
      id, text: "No headings or lists found in this chapter", color: colorForDepth(1, 0),
      icon: "📋", children: [],
    };
    nodes[rootId].children.push(id);
  }

  return { rootId, nodes };
}

// ---------- layout algorithms ----------------------------------------------

function layoutRadial(tree: Tree): Record<string, PositionedNode> {
  const positions: Record<string, PositionedNode> = {};
  const RADIUS_STEP = 160;

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
    return layoutRadial(tree);
  }
}

function estimateNodeWidth(text: string, isRoot: boolean): number {
  const baseLen = isRoot ? 220 : 180;
  const charWidth = isRoot ? 9 : 7.5;
  const padding = 32;
  return Math.min(baseLen, Math.max(60, text.length * charWidth + padding));
}

// ---------- main component (READ-ONLY) --------------------------------------

export default function ConceptMap({
  subjectColor = "#3b82f6",
  chapterTitle = "Chapter",
  content = "",
}: {
  subjectColor?: string;
  chapterTitle?: string;
  content?: string;
}) {
  // Safe tree generation — wrapped in try/catch with ultimate fallback.
  const safeHtmlToTree = (html: string, title: string): Tree => {
    try {
      return htmlToTree(html, title);
    } catch {
      const rootId = "n1";
      const fallbackId = "n2";
      return {
        rootId,
        nodes: {
          [rootId]: {
            id: rootId,
            text: truncate(title || "Chapter", 40),
            color: colorForDepth(0, 0),
            icon: "📚",
            children: [fallbackId],
          },
          [fallbackId]: {
            id: fallbackId,
            text: "Couldn't build concept map from this chapter",
            color: colorForDepth(1, 0),
            icon: "⚠️",
            children: [],
          },
        },
      };
    }
  };

  const [tree, setTree] = useState<Tree>(() => safeHtmlToTree(content || "", chapterTitle));
  const [layout, setLayout] = useState<Layout>("radial");
  const [view, setView] = useState<ViewMode>("map");
  const [selectedId, setSelectedId] = useState<string | null>(tree.rootId);

  const [vp, setVp] = useState({ tx: 0, ty: 0, scale: 1 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Regenerate whenever content or chapterTitle changes.
  useEffect(() => {
    const fresh = safeHtmlToTree(content || "", chapterTitle);
    setTree(fresh);
    setSelectedId(fresh.rootId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, chapterTitle]);

  const positions = useMemo(() => computeLayout(tree, layout), [tree, layout]);

  // ---------- node operations (READ-ONLY: only collapse/expand) -----------

  const toggleCollapse = (id: string) => {
    setTree((t) => {
      const node = t.nodes[id];
      if (!node || node.children.length === 0) return t;
      return {
        ...t,
        nodes: { ...t.nodes, [id]: { ...node, collapsed: !node.collapsed } },
      };
    });
  };

  const regenerate = () => {
    const fresh = safeHtmlToTree(content || "", chapterTitle);
    setTree(fresh);
    setSelectedId(fresh.rootId);
    setVp({ tx: 0, ty: 0, scale: 1 });
  };

  // ---------- pointer interactions (pan/zoom) ------------------------------

  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const onSvgPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    const target = e.target as Element;
    if (target === e.currentTarget || (target.getAttribute && target.getAttribute("data-bg") === "true")) {
      try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      panRef.current = { x: e.clientX, y: e.clientY, tx: vp.tx, ty: vp.ty };
      setSelectedId(null);
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
    try { e.preventDefault(); } catch { /* passive listener — ignore */ }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, positions, layout]);

  const renderNode = (id: string): ReactNode => {
    const node = tree.nodes[id];
    const pos = positions[id];
    if (!node || !pos) return null;
    const isRoot = id === tree.rootId;
    const isSelected = selectedId === id;
    const hasChildren = node.children.length > 0;
    const maxWidth = estimateNodeWidth(node.text, isRoot);
    const fontSize = isRoot ? 15 : 12;
    const nodeHeight = isRoot ? 38 : 32;

    return (
      <g
        key={id}
        transform={`translate(${pos.x}, ${pos.y})`}
        onClick={(e) => { e.stopPropagation(); setSelectedId(id); }}
        style={{ cursor: "pointer" }}
      >
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
        >
          <span className="shrink-0">{node.icon || "•"}</span>
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: node.color }} />
          <span className={`flex-1 text-sm ${isRoot ? "font-bold" : ""}`}>{node.text}</span>
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

  const nodeCount = Object.keys(tree.nodes).length;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header — NO Edit button, read-only */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30 flex-wrap">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: subjectColor + "20" }}>
          <Network className="w-4 h-4" style={{ color: subjectColor }} />
        </div>
        <span className="font-bold text-sm text-foreground">Concept Map</span>
        <span className="text-[10px] bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
          <Sparkles className="w-2.5 h-2.5" /> Auto-generated
        </span>
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
        </div>
      </div>

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
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => setVp((v) => ({ ...v, scale: Math.max(0.2, v.scale / 1.2) }))}
              className="p-1.5 hover:bg-secondary rounded-md" title="Zoom out">
              <ZoomOut className="w-4 h-4" />
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
        Auto-generated from chapter content · Drag to pan · Wheel to zoom · Click +/− to expand/collapse
      </div>
    </div>
  );
}
