"use client";

import { Check, Clipboard } from "lucide-react";
import type { ReactNode } from "react";
import { isValidElement, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { useI18n } from "../i18n";

const markdownComponents: Components = {
  table({ children }) {
    return <table className="my-4 w-full border-collapse overflow-hidden rounded-md text-sm">{children}</table>;
  },
  th({ children }) {
    return (
      <th className="border border-border bg-surface/10 px-3 py-2 text-left font-semibold text-primary">
        {children}
      </th>
    );
  },
  td({ children }) {
    return <td className="border border-border px-3 py-2 align-top text-secondary">{children}</td>;
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
    return <CopyableCodeBlock>{children}</CopyableCodeBlock>;
  },
  h1({ children }) {
    return <h1 className="mb-4 text-2xl font-semibold text-primary">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-3 mt-6 text-xl font-semibold text-primary">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mb-2 mt-5 text-lg font-semibold text-primary">{children}</h3>;
  },
  h4({ children }) {
    return <h4 className="mb-2 mt-4 text-base font-semibold text-secondary">{children}</h4>;
  },
  li({ children }) {
    return <li className="my-1">{children}</li>;
  }
};

export function MarkdownPreview({ markdown }: { markdown: string }) {
  const { t } = useI18n();

  if (!markdown) {
    return <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted">{t("noOutput")}</div>;
  }

  return (
    <article className="markdown-body max-w-none animate-fade-panel text-sm leading-6 text-secondary">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

function CopyableCodeBlock({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const code = extractText(children).replace(/\n$/, "");
  const lineCount = Math.max(1, code.split("\n").length);

  async function copyBlock() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  }

  return (
    <div className="exerpt-code-block my-4 overflow-hidden rounded-md border border-border bg-[rgb(var(--cp-code))] shadow-sm">
      <div className="flex min-h-9 items-center justify-between border-b border-border bg-panel-strong px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("code")}</span>
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
      <div className="grid max-h-[32rem] grid-cols-[3.25rem_minmax(0,1fr)] overflow-auto">
        <div className="select-none border-r border-border bg-panel-strong py-4 pr-3 text-right font-mono text-xs leading-6 text-muted">
          {Array.from({ length: lineCount }, (_, index) => (
            <div key={index + 1}>{index + 1}</div>
          ))}
        </div>
        <pre className="m-0 overflow-visible p-4 font-mono text-sm leading-6 text-primary">{children}</pre>
      </div>
    </div>
  );
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
