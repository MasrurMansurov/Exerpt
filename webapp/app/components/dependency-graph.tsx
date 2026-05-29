"use client";

import { useEffect, useMemo, useState } from "react";
import { GitBranch } from "lucide-react";
import { useI18n } from "../i18n";
import type { ThemeMode } from "../theme";
import type { DependencyGraph, GraphNode, RankReason } from "../types/exerpt";

const maxRenderedNodes = 120;
const maxRenderedEdges = 220;
const rowHeight = 36;
const listHeight = 252;

export function DependencyGraphView({ graph, themeMode }: { graph: DependencyGraph; themeMode: ThemeMode }) {
  const { t } = useI18n();
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const visibleGraph = useMemo(() => virtualizeGraph(graph), [graph]);
  const selectedNode = visibleGraph.nodes.find((node) => node.id === selectedNodeId) ?? visibleGraph.nodes[0];

  useEffect(() => {
    if (!visibleGraph.nodes.length) {
      setSelectedNodeId("");
      return;
    }
    setSelectedNodeId((current) => (current && visibleGraph.nodes.some((node) => node.id === current) ? current : visibleGraph.nodes[0].id));
  }, [visibleGraph.nodes]);

  useEffect(() => {
    let cancelled = false;

    async function renderGraph() {
      if (!visibleGraph.nodes.length) {
        setSvg("");
        setRenderError("");
        return;
      }

      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule.default;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "base",
          themeVariables:
            themeMode === "light"
              ? {
                  background: "transparent",
                  primaryColor: "#b0e4cc",
                  primaryTextColor: "#091413",
                  primaryBorderColor: "#285a48",
                  lineColor: "#408a71",
                  secondaryColor: "#f2faf6",
                  tertiaryColor: "#ffffff"
                }
              : {
                  background: "transparent",
                  primaryColor: "#285a48",
                  primaryTextColor: "#e5fff3",
                  primaryBorderColor: "#b0e4cc",
                  lineColor: "#408a71",
                  secondaryColor: "#091413",
                  tertiaryColor: "#07100f"
                }
        });
        const definition = toMermaid(visibleGraph);
        const { svg: renderedSvg } = await mermaid.render(`exerpt-graph-${Date.now()}`, definition);
        if (!cancelled) {
          setSvg(renderedSvg);
          setRenderError("");
        }
      } catch (error) {
        if (!cancelled) {
          setRenderError(error instanceof Error ? error.message : t("graphRenderError"));
        }
      }
    }

    void renderGraph();
    return () => {
      cancelled = true;
    };
  }, [visibleGraph, themeMode, t]);

  if (!graph.nodes.length) {
    return <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted">{t("noGraph")}</div>;
  }

  if (renderError) {
    return <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-warning">{renderError}</div>;
  }

  return (
    <div className="animate-fade-panel space-y-3">
      <div className="rounded-md border border-border bg-surface/[0.04] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-secondary">
          <div className="flex items-center gap-2 font-semibold text-primary">
            <GitBranch className="h-4 w-4 text-cobalt" />
            {t("graphOverview")}
          </div>
          <div className="flex flex-wrap gap-3">
            <span>{t("graphNodes", { visible: visibleGraph.nodes.length, total: graph.nodes.length })}</span>
            <span>{t("graphEdges", { visible: visibleGraph.edges.length, total: graph.edges.length })}</span>
          </div>
        </div>
        {visibleGraph.wasVirtualized ? (
          <div className="mt-2 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-warning">
            {t("graphVirtualized")}
          </div>
        ) : null}
      </div>

      <div className="min-h-[420px] overflow-auto rounded-md border border-border bg-surface/5 p-4">
        <div className="mermaid-graph min-w-[720px]" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <VirtualNodeList nodes={visibleGraph.nodes} selectedId={selectedNode?.id ?? ""} onSelect={setSelectedNodeId} />
        <NodeDetails node={selectedNode} />
      </div>
    </div>
  );
}

function VirtualNodeList({
  nodes,
  selectedId,
  onSelect
}: {
  nodes: GraphNode[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { t } = useI18n();
  const [scrollTop, setScrollTop] = useState(0);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 3);
  const visibleCount = Math.ceil(listHeight / rowHeight) + 6;
  const visibleNodes = nodes.slice(startIndex, startIndex + visibleCount);

  return (
    <section className="overflow-hidden rounded-md border border-border bg-surface/[0.04]">
      <div className="border-b border-border bg-panel-strong px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
        {t("graphNodeList")}
      </div>
      <div
        className="overflow-auto"
        style={{ height: listHeight }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="relative" style={{ height: nodes.length * rowHeight }}>
          {visibleNodes.map((node, index) => (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              className={`absolute left-0 grid w-full grid-cols-[5rem_minmax(0,1fr)] items-center gap-2 px-3 text-left text-xs transition ${
                node.id === selectedId ? "bg-cobalt/20 text-primary" : "text-secondary hover:bg-surface/[0.08]"
              }`}
              style={{ top: (startIndex + index) * rowHeight, height: rowHeight }}
            >
              <span className="rounded bg-surface/[0.08] px-2 py-1 text-[10px] font-semibold uppercase">
                {node.priority || t("notAvailable")}
              </span>
              <span className="truncate">{node.id}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function NodeDetails({ node }: { node?: GraphNode }) {
  const { t } = useI18n();

  if (!node) {
    return null;
  }

  return (
    <section className="rounded-md border border-border bg-surface/[0.04] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{t("nodeDetails")}</div>
      <div className="break-all text-sm font-semibold text-primary">{node.id}</div>
      <dl className="mt-3 space-y-2 text-xs text-secondary">
        <div className="flex justify-between gap-3">
          <dt>{t("priority")}</dt>
          <dd className="font-semibold uppercase text-primary">{node.priority}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{t("detectedLanguage")}</dt>
          <dd className="font-semibold text-primary">{node.detected_language ?? t("unknown")}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{t("importanceScore")}</dt>
          <dd className="font-semibold text-primary">{(node.importance_score ?? 0).toFixed(2)}</dd>
        </div>
      </dl>
      {node.reason_codes?.length ? (
        <ul className="mt-3 space-y-1 text-xs text-secondary">
          {node.reason_codes.map((reason) => (
            <li key={`${node.id}-${reason.code}`} className="rounded bg-surface/[0.06] px-2 py-1">
              {localizeReason(reason, t)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function virtualizeGraph(graph: DependencyGraph) {
  if (graph.nodes.length <= maxRenderedNodes && graph.edges.length <= maxRenderedEdges) {
    return { ...graph, wasVirtualized: false };
  }

  const degree = new Map<string, number>();
  for (const node of graph.nodes) {
    degree.set(node.id, 0);
  }
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const priorityWeight: Record<string, number> = { high: 4, medium: 2, low: 1 };
  const nodes = [...graph.nodes]
    .sort((left, right) => {
      const leftPriority = priorityWeight[left.priority] ?? 0;
      const rightPriority = priorityWeight[right.priority] ?? 0;
      return (
        rightPriority - leftPriority ||
        (right.importance_score ?? 0) - (left.importance_score ?? 0) ||
        (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0) ||
        left.id.localeCompare(right.id)
      );
    })
    .slice(0, maxRenderedNodes);

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .slice(0, maxRenderedEdges);

  return { nodes, edges, wasVirtualized: true };
}

function toMermaid(graph: DependencyGraph) {
  const allNodes = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    allNodes.set(node.id, node);
  }
  for (const edge of graph.edges) {
    if (!allNodes.has(edge.source)) {
      allNodes.set(edge.source, { id: edge.source, priority: "unknown" });
    }
    if (!allNodes.has(edge.target)) {
      allNodes.set(edge.target, { id: edge.target, priority: "unknown" });
    }
  }

  const ids = new Map(Array.from(allNodes.keys()).map((id, index) => [id, `n${index}`]));
  const lines = [
    "flowchart LR",
    "classDef high fill:#285a48,stroke:#b0e4cc,color:#e5fff3",
    "classDef medium fill:#408a71,stroke:#b0e4cc,color:#091413",
    "classDef low fill:#091413,stroke:#408a71,color:#b0e4cc",
    "classDef unknown fill:#07100f,stroke:#285a48,color:#b0e4cc"
  ];

  for (const node of allNodes.values()) {
    const id = ids.get(node.id);
    if (!id) {
      continue;
    }
    lines.push(`${id}["${escapeMermaidLabel(node.id)}"]:::${node.priority || "unknown"}`);
  }

  for (const edge of graph.edges) {
    const source = ids.get(edge.source);
    const target = ids.get(edge.target);
    if (source && target) {
      lines.push(`${source} --> ${target}`);
    }
  }

  return lines.join("\n");
}

function localizeReason(reason: RankReason, t: ReturnType<typeof useI18n>["t"]) {
  const metadata = reason.metadata ?? {};
  const values = {
    matches: normalizeReasonValue(metadata.matches, 0),
    centrality: normalizeReasonValue(metadata.centrality, 0),
    distance: normalizeReasonValue(metadata.distance, t("notAvailable")),
    final_score: normalizeReasonValue(metadata.final_score, reason.score.toFixed(2))
  };

  switch (reason.code) {
    case "TASK_MATCH":
      return t("rankReasonTaskMatch", values);
    case "CORE_ARCH":
      return t("rankReasonCoreArch", values);
    case "GRAPH_DISTANCE":
      return t("rankReasonGraphDistance", values);
    case "ANDROID_SOURCE":
      return t("rankReasonAndroidSource");
    case "SOURCE_FILE":
      return t("rankReasonSourceFile");
    case "ENTRY_POINT":
      return t("rankReasonEntryPoint");
    case "CONFIG_MATCH":
      return t("rankReasonConfigMatch");
    case "BOILERPLATE_PENALTY":
      return t("rankReasonBoilerplatePenalty");
    case "CONFIG_PRIORITY_CAP":
      return t("rankReasonConfigPriorityCap");
    case "BACKGROUND_CONTEXT":
      return t("rankReasonBackgroundContext");
    case "FINAL_SCORE":
      return t("rankReasonFinalScore", values);
    default:
      return reason.explanation;
  }
}

function normalizeReasonValue(value: string | number | boolean | null | undefined, fallback: string | number) {
  if (typeof value === "number" || typeof value === "string") {
    return value;
  }
  return fallback;
}

function escapeMermaidLabel(label: string) {
  return label.replace(/"/g, '\\"');
}
