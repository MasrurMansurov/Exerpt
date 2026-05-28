"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import type { ThemeMode } from "../theme";

type GraphNode = {
  id: string;
  priority: string;
};

type GraphEdge = {
  source: string;
  target: string;
};

type DependencyGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export function DependencyGraphView({ graph, themeMode }: { graph: DependencyGraph; themeMode: ThemeMode }) {
  const { t } = useI18n();
  const [svg, setSvg] = useState("");
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function renderGraph() {
      if (!graph.nodes.length) {
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
        const definition = toMermaid(graph);
        const { svg: renderedSvg } = await mermaid.render(`codepact-graph-${Date.now()}`, definition);
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
  }, [graph, themeMode, t]);

  if (!graph.nodes.length) {
    return <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted">{t("noGraph")}</div>;
  }

  if (renderError) {
    return <div className="rounded-md border border-warning/30 bg-warning/10 p-4 text-sm text-warning">{renderError}</div>;
  }

  return (
    <div className="min-h-[560px] animate-fade-panel overflow-auto rounded-md border border-border bg-surface/5 p-4">
      <div className="mermaid-graph min-w-[720px]" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
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

function escapeMermaidLabel(label: string) {
  return label.replace(/"/g, '\\"');
}
