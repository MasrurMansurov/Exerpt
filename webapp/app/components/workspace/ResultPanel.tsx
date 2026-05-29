"use client";

import dynamic from "next/dynamic";
import { Check, Clipboard, Columns2, FileText, GitBranch, Send, Terminal, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../i18n";
import type { ThemeMode } from "../../theme";
import type { CodeFile, DependencyGraph, ResultTab, SiftResponse } from "../../types/exerpt";
import { DiffView } from "./DiffView";

const MarkdownPreview = dynamic(() => import("../markdown-preview").then((mod) => mod.MarkdownPreview), {
  ssr: false,
  loading: () => <PanelFallback labelKey="renderingMarkdown" />
});

const DependencyGraphView = dynamic(() => import("../dependency-graph").then((mod) => mod.DependencyGraphView), {
  ssr: false,
  loading: () => <PanelFallback labelKey="preparingGraph" />
});

type ResultPanelProps = {
  activeTab: ResultTab;
  copied: boolean;
  error: string;
  fullRawOutput: string;
  graph: DependencyGraph;
  markdown: string;
  metrics: SiftResponse | null;
  onCopy: () => void;
  onTabChange: (tab: ResultTab) => void;
  originalFiles: CodeFile[];
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
  originalFiles,
  themeMode
}: ResultPanelProps) {
  const { t } = useI18n();
  const [showDiff, setShowDiff] = useState(false);
  const [showNegativeFeedback, setShowNegativeFeedback] = useState(false);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const tokenSavings = metrics ? calculateTokenSavings(originalFiles, metrics.tokens) : null;

  async function sendFeedback(type: "positive" | "negative", reason = "") {
    if (type === "negative" && !reason.trim()) {
      setShowNegativeFeedback(true);
      return;
    }

    setFeedbackStatus("sending");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: type === "positive" ? "Sift result was useful." : reason.trim(),
          metadata: {
            fileTypes: summarizeFileTypes(originalFiles),
            filesScanned: metrics?.files_scanned ?? originalFiles.length,
            originalTokens: tokenSavings?.originalTokens ?? 0,
            optimizedTokens: metrics?.tokens ?? 0,
            priorityHigh: metrics?.priority_counts.high ?? 0,
            priorityMedium: metrics?.priority_counts.medium ?? 0,
            priorityLow: metrics?.priority_counts.low ?? 0
          }
        })
      });

      if (!response.ok) {
        throw new Error("feedback failed");
      }

      setFeedbackStatus("sent");
      setFeedbackReason("");
      setShowNegativeFeedback(false);
      window.setTimeout(() => setFeedbackStatus("idle"), 1800);
    } catch {
      setFeedbackStatus("error");
    }
  }

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

      {tokenSavings ? (
        <div className="border-b border-border bg-[rgb(var(--cp-code))] px-4 py-3">
          <div className="rounded-md border border-signal/30 bg-signal/10 p-3 font-mono text-xs text-signal">
            <div className="mb-2 flex items-center gap-2 font-semibold">
              <Terminal className="h-3.5 w-3.5" />
              {t("tokenSavings")}
            </div>
            <div className="grid gap-1 text-[11px] leading-5 sm:grid-cols-3">
              <span>
                {t("originalTokens")}: {formatTokens(tokenSavings.originalTokens)} ({formatCost(tokenSavings.originalCost)})
              </span>
              <span>
                {t("optimizedTokens")}: {formatTokens(tokenSavings.optimizedTokens)} ({formatCost(tokenSavings.optimizedCost)})
              </span>
              <span className="font-semibold">
                {t("savedTokens")}: {tokenSavings.savedPercent}%
              </span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-secondary">
            <span>{t("feedbackPrompt")}</span>
            <button
              type="button"
              onClick={() => void sendFeedback("positive")}
              disabled={feedbackStatus === "sending"}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 transition hover:bg-surface/10 hover:text-primary disabled:opacity-50"
              title={t("thumbsUp")}
            >
              <ThumbsUp className="h-3.5 w-3.5 text-signal" />
              {t("thumbsUp")}
            </button>
            <button
              type="button"
              onClick={() => setShowNegativeFeedback((value) => !value)}
              disabled={feedbackStatus === "sending"}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 transition hover:bg-surface/10 hover:text-primary disabled:opacity-50"
              title={t("thumbsDown")}
            >
              <ThumbsDown className="h-3.5 w-3.5 text-warning" />
              {t("thumbsDown")}
            </button>
            {feedbackStatus === "sent" ? <span className="text-signal">{t("feedbackSent")}</span> : null}
            {feedbackStatus === "error" ? <span className="text-warning">{t("feedbackError")}</span> : null}
          </div>
          {showNegativeFeedback ? (
            <div className="mt-2 flex gap-2">
              <input
                value={feedbackReason}
                onChange={(event) => setFeedbackReason(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-md border-border bg-[rgb(var(--cp-input))] text-xs text-primary placeholder:text-muted focus:border-cobalt focus:ring-cobalt"
                placeholder={t("feedbackReasonPlaceholder")}
              />
              <button
                type="button"
                onClick={() => void sendFeedback("negative", feedbackReason)}
                disabled={feedbackStatus === "sending" || !feedbackReason.trim()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-cobalt px-3 text-xs font-semibold text-signal transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                {feedbackStatus === "sending" ? t("sendingFeedback") : t("sendFeedback")}
              </button>
            </div>
          ) : null}
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
          <div className="space-y-3">
            {markdown ? (
              <div className="flex justify-end">
                <div className="inline-flex rounded-md border border-border bg-surface/[0.04] p-1">
                  <button
                    type="button"
                    onClick={() => setShowDiff(false)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition ${
                      !showDiff ? "bg-surface/[0.12] text-primary" : "text-secondary hover:text-primary"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {t("renderedView")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDiff(true)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-xs font-medium transition ${
                      showDiff ? "bg-surface/[0.12] text-primary" : "text-secondary hover:text-primary"
                    }`}
                  >
                    <Columns2 className="h-3.5 w-3.5" />
                    {t("diffView")}
                  </button>
                </div>
              </div>
            ) : null}
            {showDiff ? (
              <DiffView markdown={markdown} originalFiles={originalFiles} />
            ) : (
              <MarkdownPreview markdown={markdown} />
            )}
          </div>
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

function PanelFallback({ labelKey }: { labelKey: "renderingMarkdown" | "preparingGraph" }) {
  const { t } = useI18n();
  return <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted">{t(labelKey)}</div>;
}

function calculateTokenSavings(files: CodeFile[], optimizedTokens: number) {
  const originalTokens = Math.max(
    optimizedTokens,
    Math.ceil(files.reduce((total, file) => total + file.content.length, 0) / 4)
  );
  const tokenCost = 0.000015;
  const savedPercent = originalTokens > 0 ? Math.max(0, Math.round((1 - optimizedTokens / originalTokens) * 100)) : 0;

  return {
    originalCost: originalTokens * tokenCost,
    originalTokens,
    optimizedCost: optimizedTokens * tokenCost,
    optimizedTokens,
    savedPercent
  };
}

function formatTokens(tokens: number) {
  if (tokens >= 1000) {
    const value = tokens / 1000;
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}k`;
  }
  return tokens.toLocaleString();
}

function formatCost(cost: number) {
  return `$${cost.toFixed(2)}`;
}

function summarizeFileTypes(files: CodeFile[]) {
  const counts = new Map<string, number>();
  for (const file of files) {
    const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : "none";
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([extension, count]) => `${extension}:${count}`)
    .join(", ");
}

export type { ResultTab } from "../../types/exerpt";
