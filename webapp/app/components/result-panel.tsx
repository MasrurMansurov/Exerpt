"use client";

import dynamic from "next/dynamic";
import { Check, Clipboard, GitBranch } from "lucide-react";
import { useI18n } from "../i18n";
import type { ThemeMode } from "../theme";

const MarkdownPreview = dynamic(() => import("./markdown-preview").then((mod) => mod.MarkdownPreview), {
  ssr: false,
  loading: () => <PanelFallback label="Rendering Markdown..." />
});

const DependencyGraphView = dynamic(() => import("./dependency-graph").then((mod) => mod.DependencyGraphView), {
  ssr: false,
  loading: () => <PanelFallback label="Preparing dependency graph..." />
});

export type ResultTab = "preview" | "graph" | "raw";

type GraphNode = {
  id: string;
  priority: string;
  detected_language?: string;
};

type GraphEdge = {
  source: string;
  target: string;
};

type DependencyGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type ResultMetrics = {
  compression_warning?: string | null;
};

type ResultPanelProps = {
  activeTab: ResultTab;
  copied: boolean;
  error: string;
  fullRawOutput: string;
  graph: DependencyGraph;
  markdown: string;
  metrics: ResultMetrics | null;
  onCopy: () => void;
  onTabChange: (tab: ResultTab) => void;
  themeMode: ThemeMode;
};

export function ResultPanel({
  activeTab,
  copied,
  error,
  fullRawOutput,
  graph,
  markdown,
  metrics,
  onCopy,
  onTabChange,
  themeMode
}: ResultPanelProps) {
  const { t } = useI18n();

  return (
    <aside className="flex min-h-0 flex-col bg-panel">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary">
          <GitBranch className="h-4 w-4 text-cobalt" />
          <span className="truncate">{t("siftedResult")}</span>
        </div>
        <button
          type="button"
          onClick={onCopy}
          disabled={!fullRawOutput}
          title={t("copyForAiTooltip")}
          aria-label={t("copyForAiTooltip")}
          className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt ${
            copied ? "bg-signal text-ink" : "bg-cobalt text-signal hover:brightness-110"
          }`}
        >
          {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
          {copied ? t("copied") : t("copyForAi")}
        </button>
      </div>

      {metrics?.compression_warning ? (
        <div className="border-b border-warning/20 bg-warning/10 px-4 py-2 text-xs font-semibold text-warning">
          {metrics.compression_warning}
        </div>
      ) : null}

      <div className="flex gap-2 border-b border-border px-4 py-2">
        {(["preview", "graph", "raw"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => onTabChange(tab)}
            className={`h-8 rounded-md px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt ${
              activeTab === tab ? "bg-surface/[0.12] text-primary" : "text-secondary hover:bg-surface/[0.08]"
            }`}
          >
            {t(tab)}
          </button>
        ))}
      </div>

      {error ? (
        <div className="m-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">{error}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {activeTab === "preview" ? (
          <MarkdownPreview markdown={markdown} />
        ) : activeTab === "graph" ? (
          <DependencyGraphView graph={graph} themeMode={themeMode} />
        ) : (
          <pre className="m-0 h-full max-h-full animate-fade-panel overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-[rgb(var(--cp-code))] p-4 font-mono text-sm leading-6 text-primary">
            {fullRawOutput || t("noOutput")}
          </pre>
        )}
      </div>
    </aside>
  );
}

function PanelFallback({ label }: { label: string }) {
  return <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted">{label}</div>;
}
