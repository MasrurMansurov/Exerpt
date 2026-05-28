"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ArrowRight, Blocks, Code2, FolderTree, Globe2, Moon, Sun } from "lucide-react";
import { useI18n } from "../i18n";
import { useThemeMode } from "../theme";
import { BrandLogo } from "./brand-logo";

const Workspace = dynamic(() => import("./Workspace").then((mod) => mod.Workspace), {
  ssr: false,
  loading: () => (
    <main className="flex min-h-screen items-center justify-center bg-app text-sm text-muted">
      Loading workspace...
    </main>
  )
});

const workspaceStartedStorageKey = "codepact-workspace-started";

export function HomeClient() {
  const { language, localeOptions, setLanguage, t } = useI18n();
  const { themeMode, toggleTheme } = useThemeMode();
  const [started, setStarted] = useState(false);

  useEffect(() => {
    setStarted(window.localStorage.getItem(workspaceStartedStorageKey) === "true");
  }, []);

  function startWorkspace() {
    window.localStorage.setItem(workspaceStartedStorageKey, "true");
    setStarted(true);
  }

  if (started) {
    return <Workspace />;
  }

  return (
    <main className="min-h-screen bg-app text-primary">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 py-5">
        <header className="flex h-14 items-center justify-between border-b border-border">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-9 w-9 shrink-0 shadow-glow" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-primary">{t("appName")}</div>
              <div className="truncate text-xs text-muted">{t("landingSubtitle")}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="hidden h-10 items-center gap-2 rounded-md border border-border bg-surface/[0.04] px-3 text-xs text-secondary sm:flex">
              <Globe2 className="h-3.5 w-3.5 text-cobalt" />
              <span className="sr-only">{t("language")}</span>
              <select
                value={language}
                onChange={(event) => setLanguage(event.target.value as typeof language)}
                className="max-w-[7.5rem] border-0 bg-transparent p-0 text-xs text-secondary focus:ring-0"
                aria-label={t("language")}
              >
                {localeOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.nativeLabel}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface/[0.04] text-secondary transition hover:bg-surface/10 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
              aria-label={themeMode === "dark" ? t("lightTheme") : t("darkTheme")}
              title={t("themeToggle")}
            >
              {themeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={startWorkspace}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-signal px-4 text-sm font-semibold text-ink shadow-glow transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
            >
              {t("quickStart")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-9 py-8 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-border bg-surface/[0.04] px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-cobalt">
              <Blocks className="h-3.5 w-3.5" />
              {t("landingEyebrow")}
            </div>
            <h1 className="text-4xl font-semibold tracking-normal text-primary md:text-6xl">{t("landingTitle")}</h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-secondary">{t("landingBody")}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={startWorkspace}
                className="inline-flex h-11 items-center gap-2 rounded-md bg-signal px-5 text-sm font-semibold text-ink shadow-glow transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
              >
                {t("quickStartDemo")}
                <ArrowRight className="h-4 w-4" />
              </button>
              <span className="text-sm text-muted">{t("landingNoUpload")}</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-panel shadow-glass">
            <div className="flex h-10 items-center gap-2 border-b border-border bg-panel-strong px-3">
              <span className="h-2.5 w-2.5 rounded-full bg-cobalt/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-secondary/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-signal/80" />
              <span className="ml-2 text-xs text-muted">{t("landingEyebrow")}</span>
            </div>

            <div className="grid min-h-[26rem] grid-cols-[12rem_1fr_14rem] text-xs">
              <div className="border-r border-border bg-panel-strong p-3 text-secondary">
                <div className="mb-4 flex items-center gap-2 text-primary">
                  <FolderTree className="h-4 w-4 text-cobalt" />
                  {t("explorer")}
                </div>
                <div className="space-y-2 font-mono">
                  <div className="text-secondary">demo-project/</div>
                  <div className="pl-3">src/</div>
                  <div className="pl-6 text-primary">engine.py</div>
                  <div className="pl-6">graph.py</div>
                  <div className="pl-6">ranker.py</div>
                  <div className="pl-3">tests/</div>
                </div>
              </div>

              <div className="bg-app p-4 font-mono leading-6 text-secondary">
                <div className="mb-3 flex items-center gap-2 border-b border-border pb-3 text-muted">
                  <Code2 className="h-4 w-4 text-signal" />
                  src/codepact/engine.py
                </div>
                <pre className="whitespace-pre-wrap">{`class CodepactEngine:
    def build_prompt(self, files, task):
        graph = DependencyGraph.from_files(files)
        ranked = rank_for_task(graph, task)
        return render_context(ranked)`}</pre>
              </div>

              <div className="border-l border-border bg-panel-strong p-3 text-secondary">
                <div className="mb-4 text-primary">{t("siftedResult")}</div>
                <div className="space-y-2">
                  <div className="h-2 rounded bg-signal/70" />
                  <div className="h-2 rounded bg-surface/20" />
                  <div className="h-2 w-3/4 rounded bg-surface/20" />
                  <div className="mt-5 rounded-md border border-border bg-surface/[0.04] p-2 font-mono text-[10px] text-muted">
                    HIGH engine.py
                    <br />
                    MEDIUM graph.py
                    <br />
                    LOW test_graph.py
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="border-t border-border py-4 text-xs text-muted">{t("landingFooter")}</footer>
      </section>
    </main>
  );
}
