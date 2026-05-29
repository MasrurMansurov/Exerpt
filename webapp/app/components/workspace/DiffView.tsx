"use client";

import { useEffect, useMemo, useState } from "react";
import { FileCode2 } from "lucide-react";
import { useI18n } from "../../i18n";
import type { CodeFile } from "../../types/exerpt";

type SiftedCodeBlock = {
  path: string;
  language: string;
  content: string;
};

type DiffViewProps = {
  markdown: string;
  originalFiles: CodeFile[];
};

export function DiffView({ markdown, originalFiles }: DiffViewProps) {
  const { t } = useI18n();
  const siftedBlocks = useMemo(() => parseSiftedCodeBlocks(markdown), [markdown]);
  const [selectedPath, setSelectedPath] = useState("");

  useEffect(() => {
    if (!siftedBlocks.length) {
      setSelectedPath("");
      return;
    }

    setSelectedPath((current) =>
      current && siftedBlocks.some((block) => block.path === current) ? current : siftedBlocks[0].path
    );
  }, [siftedBlocks]);

  const selectedBlock = siftedBlocks.find((block) => block.path === selectedPath) ?? siftedBlocks[0];
  const originalContent = originalFiles.find((file) => file.name === selectedBlock?.path)?.content ?? "";

  if (!siftedBlocks.length || !selectedBlock) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted">
        {t("noSiftedCode")}
      </div>
    );
  }

  return (
    <div className="animate-fade-panel space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface/[0.04] px-3 py-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-secondary">
          <FileCode2 className="h-4 w-4 shrink-0 text-cobalt" />
          <span className="shrink-0 font-semibold">{t("diffFile")}</span>
          <select
            value={selectedBlock.path}
            onChange={(event) => setSelectedPath(event.target.value)}
            className="min-w-0 flex-1 rounded-md border-border bg-[rgb(var(--cp-input))] text-xs text-primary focus:border-cobalt focus:ring-cobalt"
          >
            {siftedBlocks.map((block) => (
              <option key={block.path} value={block.path}>
                {block.path}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-muted">
          {siftedBlocks.length} {t("siftedFiles")}
        </span>
      </div>

      <div className="grid min-h-[34rem] grid-cols-1 overflow-hidden rounded-md border border-border lg:grid-cols-2">
        <CodePane title={t("originalCode")} content={originalContent || t("originalUnavailable")} />
        <CodePane title={t("siftedCode")} content={selectedBlock.content} highlightAgainst={originalContent} />
      </div>
    </div>
  );
}

function CodePane({
  title,
  content,
  highlightAgainst
}: {
  title: string;
  content: string;
  highlightAgainst?: string;
}) {
  const lines = content.split("\n");
  const referenceLines = highlightAgainst?.split("\n") ?? [];

  return (
    <section className="min-w-0 border-border bg-[rgb(var(--cp-code))] lg:border-l first:lg:border-l-0">
      <div className="sticky top-0 z-10 border-b border-border bg-panel-strong px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted">
        {title}
      </div>
      <div className="max-h-[34rem] overflow-auto">
        <pre className="m-0 min-w-max p-0 font-mono text-xs leading-6 text-primary">
          {lines.map((line, index) => {
            const changed = Boolean(highlightAgainst) && line !== (referenceLines[index] ?? "");
            return (
              <span
                key={`${index}-${line}`}
                className={`grid grid-cols-[3.25rem_minmax(0,1fr)] ${
                  changed ? "bg-warning/10 text-primary" : ""
                }`}
              >
                <span className="select-none border-r border-border/70 pr-3 text-right text-muted">
                  {index + 1}
                </span>
                <span className="px-3">{line || " "}</span>
              </span>
            );
          })}
        </pre>
      </div>
    </section>
  );
}

function parseSiftedCodeBlocks(markdown: string) {
  const blocks: SiftedCodeBlock[] = [];
  const pattern = /#### `([^`]+)`[\s\S]*?```([A-Za-z0-9_+-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    blocks.push({
      path: match[1],
      language: match[2],
      content: match[3].replace(/\n$/, "")
    });
  }

  return blocks;
}
