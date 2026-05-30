"use client";

import dynamic from "next/dynamic";
import {
  Check,
  Clipboard,
  Columns2,
  FileText,
  GitBranch,
  Maximize2,
  Minimize2,
  Send,
  Terminal,
  ThumbsDown,
  ThumbsUp
} from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
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
  isFocused: boolean;
  markdown: string;
  metrics: SiftResponse | null;
  onCopy: () => void;
  onTabChange: (tab: ResultTab) => void;
  onToggleFocus: () => void;
  originalFiles: CodeFile[];
  themeMode: ThemeMode;
};

export function ResultPanel({
  activeTab,
  copied,
  error,
  fullRawOutput,
  graph,
  isFocused,
  markdown,
  metrics,
  onCopy,
  onTabChange,
  onToggleFocus,
  originalFiles,
  themeMode
}: ResultPanelProps) {
  const { t } = useI18n();
  const [showDiff, setShowDiff] = useState(false);
  const [showNegativeFeedback, setShowNegativeFeedback] = useState(false);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [feedbackErrorMessage, setFeedbackErrorMessage] = useState("");
  const [feedbackAvailability, setFeedbackAvailability] = useState<"checking" | "available" | "unavailable">("checking");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tokenSavings = metrics ? calculateTokenSavings(originalFiles, metrics.tokens) : null;
  const hasTokenSavings = Boolean(tokenSavings);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const animationFrame = window.requestAnimationFrame(() => {
      scrollContainerRef.current?.focus({ preventScroll: true });
    });

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onToggleFocus();
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isFocused, onToggleFocus]);

  useEffect(() => {
    if (isFocused) {
      scrollContainerRef.current?.scrollTo({ top: 0 });
    }
  }, [activeTab, isFocused, showDiff]);

  function handleScrollKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!isFocused) {
      return;
    }

    const target = event.target as HTMLElement;
    const interactiveTags = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"]);
    if (target !== event.currentTarget && interactiveTags.has(target.tagName)) {
      return;
    }

    const scrollContainer = event.currentTarget;
    const pageStep = Math.max(240, Math.floor(scrollContainer.clientHeight * 0.86));
    const smallStep = 72;

    if (event.key === "PageDown" || (event.key === " " && !event.shiftKey)) {
      event.preventDefault();
      scrollContainer.scrollBy({ top: pageStep, behavior: "smooth" });
    } else if (event.key === "PageUp" || (event.key === " " && event.shiftKey)) {
      event.preventDefault();
      scrollContainer.scrollBy({ top: -pageStep, behavior: "smooth" });
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      scrollContainer.scrollBy({ top: smallStep, behavior: "smooth" });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      scrollContainer.scrollBy({ top: -smallStep, behavior: "smooth" });
    } else if (event.key === "Home") {
      event.preventDefault();
      scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
    } else if (event.key === "End") {
      event.preventDefault();
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: "smooth" });
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function checkFeedbackAvailability() {
      if (!hasTokenSavings) {
        return;
      }

      try {
        const response = await fetch("/api/feedback", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { configured?: boolean };
        if (!cancelled) {
          setFeedbackAvailability(response.ok && payload.configured ? "available" : "unavailable");
        }
      } catch {
        if (!cancelled) {
          setFeedbackAvailability("unavailable");
        }
      }
    }

    void checkFeedbackAvailability();
    return () => {
      cancelled = true;
    };
  }, [hasTokenSavings]);

  async function sendFeedback(type: "positive" | "negative", reason = "") {
    if (type === "negative" && !reason.trim()) {
      setShowNegativeFeedback(true);
      return;
    }

    setFeedbackStatus("sending");
    setFeedbackErrorMessage("");
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
      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Feedback failed");
      }

      setFeedbackStatus("sent");
      setFeedbackReason("");
      setShowNegativeFeedback(false);
      window.setTimeout(() => setFeedbackStatus("idle"), 1800);
    } catch (feedbackError) {
      setFeedbackStatus("error");
      setFeedbackErrorMessage(feedbackError instanceof Error ? feedbackError.message : t("feedbackError"));
    }
  }

  return (
    <aside
      role={isFocused ? "dialog" : undefined}
      aria-modal={isFocused ? true : undefined}
      aria-label={t("siftedResult")}
      className={
        isFocused
          ? "fixed inset-0 z-[70] flex h-[100dvh] w-screen min-h-0 flex-col overflow-hidden bg-panel shadow-glass"
          : "flex h-full min-h-0 flex-col overflow-hidden bg-panel"
      }
    >
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-primary">
            <GitBranch className="h-4 w-4 shrink-0 text-cobalt" />
            <span className="truncate">{t("siftedResult")}</span>
          </div>
          {metrics ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              <span>{metrics.tokens.toLocaleString()} tokens</span>
              <span>{metrics.files_scanned.toLocaleString()} files</span>
              <span>HIGH {metrics.priority_counts.high ?? 0}</span>
              <span>MED {metrics.priority_counts.medium ?? 0}</span>
              <span>LOW {metrics.priority_counts.low ?? 0}</span>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleFocus}
            title={isFocused ? t("exitResultFocus") : t("focusResult")}
            aria-label={isFocused ? t("exitResultFocus") : t("focusResult")}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/[0.04] text-secondary transition hover:bg-surface/10 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
          >
            {isFocused ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
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
            {feedbackAvailability === "available" ? (
              <>
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
              </>
            ) : (
              <span className="text-muted">{t("feedbackUnavailable")}</span>
            )}
            {feedbackStatus === "sent" ? <span className="text-signal">{t("feedbackSent")}</span> : null}
            {feedbackStatus === "error" ? (
              <span className="text-warning">{feedbackErrorMessage || t("feedbackError")}</span>
            ) : null}
          </div>
          {showNegativeFeedback && feedbackAvailability === "available" ? (
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

      <div className="sticky top-0 z-10 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-panel/95 px-4 py-2 backdrop-blur">
        <div className="inline-flex rounded-md border border-border bg-surface/[0.04] p-1">
          {(["preview", "graph", "raw"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={`h-8 rounded px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt ${
                activeTab === tab ? "bg-surface/[0.12] text-primary" : "text-secondary hover:text-primary"
              }`}
            >
              {t(tab)}
            </button>
          ))}
        </div>
        {activeTab === "preview" && markdown ? (
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
        ) : null}
      </div>

      {error ? (
        <div className="m-4 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">{error}</div>
      ) : null}

      <div
        ref={scrollContainerRef}
        tabIndex={isFocused ? -1 : undefined}
        onKeyDown={handleScrollKeys}
        className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden scroll-smooth focus:outline-none ${
          isFocused ? "p-4 sm:p-5 lg:p-6" : "p-4"
        }`}
      >
        {activeTab === "preview" ? (
          <div className="space-y-3">
            {showDiff ? (
              <DiffView markdown={markdown} originalFiles={originalFiles} />
            ) : (
              <MarkdownPreview markdown={markdown} expandCodeBlocks={isFocused} />
            )}
          </div>
        ) : activeTab === "graph" ? (
          <DependencyGraphView graph={graph} themeMode={themeMode} />
        ) : (
          <pre className="m-0 h-full max-h-full animate-fade-panel overflow-auto rounded-md border border-border bg-[rgb(var(--cp-code))] p-4 font-mono text-sm leading-6 text-primary [tab-size:2]">
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
