"use client";

import dynamic from "next/dynamic";
import { ChevronRight, Code2, Loader2, Play } from "lucide-react";
import { useI18n } from "../../i18n";
import type { ThemeMode } from "../../theme";
import type { CodeFile } from "../../types/exerpt";

const CodeEditor = dynamic(() => import("../code-editor").then((mod) => mod.CodeEditor), {
  ssr: false,
  loading: () => <EditorFallback />
});

type EditorPaneProps = {
  breadcrumbs: string[];
  canSubmit: boolean;
  fileCount: number;
  isLoading: boolean;
  limit: number;
  onChangeFile: (content: string) => void;
  onLimitChange: (limit: number) => void;
  onSift: () => void;
  onTaskChange: (task: string) => void;
  progressMessage: string;
  progressPercent: number;
  projectName: string;
  selectedFile?: CodeFile;
  task: string;
  themeMode: ThemeMode;
};

export function EditorPane({
  breadcrumbs,
  canSubmit,
  fileCount,
  isLoading,
  limit,
  onChangeFile,
  onLimitChange,
  onSift,
  onTaskChange,
  progressMessage,
  progressPercent,
  projectName,
  selectedFile,
  task,
  themeMode
}: EditorPaneProps) {
  const { t } = useI18n();

  return (
    <section className="relative flex min-h-0 flex-col border-r border-border bg-app">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-panel-strong">
        <div className="flex h-full min-w-0 items-center border-r border-border bg-app px-4 text-xs text-secondary">
          <Code2 className="mr-2 h-3.5 w-3.5 shrink-0 text-signal" />
          <Breadcrumbs ariaLabel={t("breadcrumbs")} parts={breadcrumbs} fallback={t("noFileSelected")} />
        </div>
        <div className="px-4 text-xs text-muted">
          {selectedFile ? t("characterCount", { count: selectedFile.content.length.toLocaleString() }) : t("noFile")}
        </div>
      </div>

      <div className="grid min-h-[4.75rem] shrink-0 grid-cols-[minmax(0,1fr)_7rem] items-end gap-3 border-b border-border bg-panel px-4 py-3">
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
            {t("rankingTask")}
          </span>
          <input
            value={task}
            onChange={(event) => onTaskChange(event.target.value)}
            className="h-9 w-full rounded-md border-border bg-[rgb(var(--cp-input))] text-sm text-primary placeholder:text-muted focus:border-cobalt focus:ring-cobalt"
            placeholder={t("rankingPlaceholder")}
          />
        </label>
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
            {t("tokenLimit")}
          </span>
          <input
            type="number"
            min={100}
            max={1000000}
            value={limit}
            onChange={(event) => onLimitChange(Number(event.target.value))}
            className="h-9 w-full rounded-md border-border bg-[rgb(var(--cp-input))] text-sm text-primary focus:border-cobalt focus:ring-cobalt"
          />
        </label>
      </div>

      {isLoading ? (
        <div className="h-1 overflow-hidden bg-surface/[0.05]">
          <div
            className="h-full bg-signal transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(8, progressPercent)}%` }}
          />
        </div>
      ) : null}

      <div className="relative min-h-0 flex-1">
        <CodeEditor
          fileName={selectedFile?.name ?? ""}
          themeMode={themeMode}
          value={selectedFile?.content ?? ""}
          onChange={onChangeFile}
        />

        <div className="pointer-events-none absolute bottom-5 right-5 z-20 flex flex-col items-end gap-3">
          {isLoading ? (
            <div className="rounded-md border border-signal/30 bg-panel/95 px-3 py-2 text-xs font-semibold text-signal shadow-glow">
              {progressMessage || t("aiSifting")}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onSift}
            disabled={!canSubmit || isLoading}
            className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-md bg-signal px-5 text-sm font-semibold text-ink shadow-glow transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isLoading ? t("sifting") : t("sift")}
          </button>
        </div>
      </div>

      <div className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-panel px-3 text-xs text-muted">
        <span>{projectName}</span>
        <span>{fileCount.toLocaleString()} {t("filesInVfs")}</span>
      </div>
    </section>
  );
}

function Breadcrumbs({ ariaLabel, parts, fallback }: { ariaLabel: string; parts: string[]; fallback: string }) {
  if (!parts.length) {
    return <span className="truncate">{fallback}</span>;
  }

  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-hidden" aria-label={ariaLabel}>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="flex min-w-0 items-center gap-1">
          {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0 text-muted" /> : null}
          <span className={index === parts.length - 1 ? "truncate text-primary" : "truncate text-muted"}>{part}</span>
        </span>
      ))}
    </nav>
  );
}

function EditorFallback() {
  const { t } = useI18n();

  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center bg-app text-sm text-muted">
      {t("loadingEditor")}
    </div>
  );
}
