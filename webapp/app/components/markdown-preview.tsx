"use client";

import { Check, Clipboard, WrapText } from "lucide-react";
import type { ReactNode } from "react";
import { isValidElement, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { useI18n } from "../i18n";

function createMarkdownComponents(expandCodeBlocks: boolean): Components {
  return {
    table({ children }) {
      return (
        <div className="my-4 overflow-x-auto rounded-md border border-border bg-surface/[0.03]">
          <table className="w-full min-w-[42rem] border-collapse text-sm">{children}</table>
        </div>
      );
    },
    th({ children }) {
      return (
        <th className="border-b border-r border-border bg-surface/10 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary last:border-r-0">
          {children}
        </th>
      );
    },
    td({ children }) {
      return <td className="border-b border-r border-border px-3 py-2 align-top text-secondary last:border-r-0">{children}</td>;
    },
    code({ className, children, ...props }) {
      const isInline = !className;
      if (isInline) {
        return (
          <code className="rounded bg-surface/10 px-1.5 py-0.5 text-[0.9em] text-signal" {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className={`${className} font-mono text-sm`} {...props}>
          {children}
        </code>
      );
    },
    pre({ children }) {
      return <CopyableCodeBlock expand={expandCodeBlocks}>{children}</CopyableCodeBlock>;
    },
    h1({ children }) {
      return <h1 className="mb-4 text-2xl font-semibold leading-tight text-primary">{children}</h1>;
    },
    h2({ children }) {
      return <h2 className="mb-3 mt-7 border-b border-border pb-2 text-xl font-semibold leading-tight text-primary">{children}</h2>;
    },
    h3({ children }) {
      return <h3 className="mb-2 mt-5 text-lg font-semibold text-primary">{children}</h3>;
    },
    h4({ children }) {
      return <h4 className="mb-2 mt-4 text-base font-semibold text-secondary">{children}</h4>;
    },
    li({ children }) {
      return <li className="my-1">{children}</li>;
    },
    p({ children }) {
      return <p className="my-3">{children}</p>;
    }
  };
}

export function MarkdownPreview({ markdown, expandCodeBlocks = false }: { markdown: string; expandCodeBlocks?: boolean }) {
  const { t } = useI18n();

  if (!markdown) {
    return <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted">{t("noOutput")}</div>;
  }

  return (
    <article className="markdown-body mx-auto max-w-[74rem] animate-fade-panel text-sm leading-6 text-secondary">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={createMarkdownComponents(expandCodeBlocks)}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

function CopyableCodeBlock({ children, expand }: { children: ReactNode; expand: boolean }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [wrapLines, setWrapLines] = useState(false);
  const code = extractText(children).replace(/\n$/, "");
  const lineCount = Math.max(1, code.split("\n").length);
  const language = codeLanguage(children);

  async function copyBlock() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  }

  return (
    <div className="exerpt-code-block my-5 overflow-hidden rounded-md border border-border bg-[rgb(var(--cp-code))] shadow-sm">
      <div className="flex min-h-9 items-center justify-between border-b border-border bg-panel-strong px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {language || t("code")} · {lineCount} {lineCount === 1 ? t("line") : t("lines")}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWrapLines((value) => !value)}
            title={t("toggleLineWrap")}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt ${
              wrapLines ? "bg-surface/10 text-primary" : "text-secondary hover:bg-surface/10 hover:text-primary"
            }`}
            aria-label={t("toggleLineWrap")}
          >
            <WrapText className="h-3.5 w-3.5" />
            {t("wrap")}
          </button>
          <button
            type="button"
            onClick={copyBlock}
            title={t("copyBlockTooltip")}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-secondary transition hover:bg-surface/10 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
            aria-label={copied ? t("copiedBlock") : t("copyBlock")}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-signal" /> : <Clipboard className="h-3.5 w-3.5" />}
            {copied ? t("copiedBlock") : t("copyBlock")}
          </button>
        </div>
      </div>
      <div
        className={`grid grid-cols-[3.25rem_minmax(0,1fr)] ${
          expand ? "overflow-x-auto" : "max-h-[34rem] overflow-auto"
        }`}
      >
        <div className="select-none border-r border-border bg-panel-strong py-4 pr-3 text-right font-mono text-xs leading-6 text-muted">
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index + 1}>{index + 1}</div>
          ))}
        </div>
        <pre
          className={`m-0 overflow-visible p-4 font-mono text-sm leading-6 text-primary [tab-size:2] ${
            wrapLines ? "whitespace-pre-wrap break-words" : "whitespace-pre"
          }`}
        >
          {children}
        </pre>
      </div>
    </div>
  );
}

function codeLanguage(node: ReactNode) {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(node)) {
    return "";
  }
  const className = node.props.className ?? "";
  const match = className.match(/language-([A-Za-z0-9_+-]+)/);
  return match?.[1] ?? "";
}

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractText).join("");
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return extractText(node.props.children);
  }
  return "";
}
