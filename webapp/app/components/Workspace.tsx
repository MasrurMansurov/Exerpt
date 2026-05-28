"use client";

import dynamic from "next/dynamic";
import type { ChangeEvent, DragEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  Code2,
  CodeXml,
  Database,
  FileCog,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Gem,
  Globe2,
  Hash,
  Loader2,
  Moon,
  Package as PackageIcon,
  PanelLeft,
  Play,
  RotateCcw,
  Server,
  Smartphone,
  Settings,
  Sun,
  UploadCloud
} from "lucide-react";
import { useI18n } from "../i18n";
import { useThemeMode } from "../theme";
import { BrandLogo } from "./brand-logo";
import { ResultPanel, type ResultTab } from "./result-panel";
import { loadWorkspaceSnapshot, saveWorkspaceSnapshot, type WorkspaceSnapshot } from "./workspace-persistence";

const CodeEditor = dynamic(() => import("./code-editor").then((mod) => mod.CodeEditor), {
  ssr: false,
  loading: () => <EditorFallback />
});

type CodeFile = {
  name: string;
  content: string;
};

type BrowserNamedFile = {
  name: string;
  file: File;
};

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

type SiftResponse = {
  markdown: string;
  tokens: number;
  files_scanned: number;
  priority_counts: Record<string, number>;
  graph: DependencyGraph;
  compression_warning?: string | null;
};

type TreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
};

type BrowserFileEntry = {
  isFile: true;
  isDirectory: false;
  fullPath: string;
  file: (successCallback: (file: File) => void, errorCallback?: (error: DOMException) => void) => void;
};

type BrowserDirectoryReader = {
  readEntries: (
    successCallback: (entries: BrowserEntry[]) => void,
    errorCallback?: (error: DOMException) => void
  ) => void;
};

type BrowserDirectoryEntry = {
  isFile: false;
  isDirectory: true;
  fullPath: string;
  createReader: () => BrowserDirectoryReader;
};

type BrowserEntry = BrowserFileEntry | BrowserDirectoryEntry;

type DataTransferItemWithEntry = {
  webkitGetAsEntry?: () => BrowserEntry | null;
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_CODEPACT_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

const demoProject: CodeFile[] = [
  {
    name: "src/codepact/engine.py",
    content: `from codepact.graph import DependencyGraph
from codepact.ranker import rank_for_task

class CodepactEngine:
    def build_prompt(self, files, task, limit):
        graph = DependencyGraph.from_files(files)
        ranked = rank_for_task(graph, task)
        return self.render_context(ranked, limit)

    def render_context(self, ranked_files, limit):
        return "\\n".join(file.compact() for file in ranked_files)`
  },
  {
    name: "src/codepact/graph.py",
    content: `import ast
import networkx as nx

class DependencyGraph:
    @classmethod
    def from_files(cls, files):
        graph = nx.DiGraph()
        for file in files:
            graph.add_node(file.name)
            for import_path in cls.imports_for(file.content):
                graph.add_edge(file.name, import_path)
        return graph

    @staticmethod
    def imports_for(source):
        tree = ast.parse(source)
        return [node.module for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)]`
  },
  {
    name: "src/codepact/ranker.py",
    content: `def rank_for_task(graph, task):
    task_words = set(task.lower().split())
    ranked = []
    for node in graph.nodes:
        score = sum(1 for word in task_words if word in node.lower())
        ranked.append((score, node))
    return [node for _, node in sorted(ranked, reverse=True)]`
  },
  {
    name: "tests/test_graph.py",
    content: `from codepact.graph import DependencyGraph

def test_dependency_graph_reads_python_imports():
    files = [type("File", (), {"name": "engine.py", "content": "from codepact.graph import DependencyGraph"})]
    graph = DependencyGraph.from_files(files)
    assert "engine.py" in graph.nodes`
  }
];

const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".mp4",
  ".mov",
  ".pdf",
  ".zip",
  ".gz",
  ".ttf",
  ".woff",
  ".woff2",
  ".ico"
]);

const ignoredBrowserSegments = new Set([
  ".git",
  ".gradle",
  ".hg",
  ".idea",
  ".mypy_cache",
  ".next",
  ".pytest_cache",
  ".ruff_cache",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "htmlcov",
  "node_modules",
  "out",
  "venv"
]);

const ignoredBrowserFiles = new Set([".ds_store", "package-lock.json"]);

export function Workspace() {
  const { language, localeOptions, setLanguage, t } = useI18n();
  const { themeMode, toggleTheme } = useThemeMode();
  const [files, setFiles] = useState<CodeFile[]>(demoProject);
  const [activeFile, setActiveFile] = useState(demoProject[0].name);
  const [projectName, setProjectName] = useState("Demo Project");
  const [projectOrigin, setProjectOrigin] = useState<"demo" | "uploaded">("demo");
  const [task, setTask] = useState("Optimize dependency graph");
  const [limit, setLimit] = useState(8000);
  const [result, setResult] = useState("");
  const [fullRawOutput, setFullRawOutput] = useState("");
  const [metrics, setMetrics] = useState<SiftResponse | null>(null);
  const [graph, setGraph] = useState<DependencyGraph>({ nodes: [], edges: [] });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>("preview");
  const [copied, setCopied] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["src", "src/codepact", "tests"]));
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(284);
  const [hasHydratedWorkspace, setHasHydratedWorkspace] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const saveWorkspaceTimeoutRef = useRef<number | null>(null);

  const selectedFile = files.find((file) => file.name === activeFile) ?? files[0];
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const breadcrumbs = useMemo(() => selectedFile?.name.split("/").filter(Boolean) ?? [], [selectedFile?.name]);
  const canSubmit = files.length > 0 && task.trim().length > 0 && files.some((file) => file.content.trim());
  const backendLabel = API_BASE_URL.replace(/^https?:\/\//, "");

  useEffect(() => {
    let cancelled = false;

    async function hydrateWorkspace() {
      try {
        const snapshot = await loadWorkspaceSnapshot();
        if (cancelled || !snapshot || snapshot.version !== 1 || !snapshot.files.length) {
          return;
        }

        const activeSnapshotFile = snapshot.files.some((file) => file.name === snapshot.activeFile)
          ? snapshot.activeFile
          : snapshot.files[0].name;
        setFiles(snapshot.files);
        setActiveFile(activeSnapshotFile);
        setProjectName(snapshot.projectName);
        setProjectOrigin(snapshot.projectOrigin);
        setTask(snapshot.task);
        setLimit(snapshot.limit);
        setResult(snapshot.result);
        setFullRawOutput(snapshot.fullRawOutput);
        setMetrics(snapshot.metrics);
        setGraph(snapshot.graph);
        setActiveResultTab(snapshot.activeResultTab);
        setSidebarWidth(Math.min(420, Math.max(220, snapshot.sidebarWidth)));
      } catch {
        // If browser storage is unavailable, fall back to the demo project.
      } finally {
        if (!cancelled) {
          setHasHydratedWorkspace(true);
        }
      }
    }

    void hydrateWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedWorkspace) {
      return;
    }

    if (saveWorkspaceTimeoutRef.current !== null) {
      window.clearTimeout(saveWorkspaceTimeoutRef.current);
    }

    const snapshot: WorkspaceSnapshot = {
      version: 1,
      activeFile: selectedFile?.name ?? activeFile,
      activeResultTab,
      files,
      fullRawOutput,
      graph,
      limit,
      metrics,
      projectName,
      projectOrigin,
      result,
      savedAt: Date.now(),
      sidebarWidth,
      task
    };

    saveWorkspaceTimeoutRef.current = window.setTimeout(() => {
      void saveWorkspaceSnapshot(snapshot).catch(() => {
        // Persistence failure should not block editing or sifting.
      });
    }, 450);

    return () => {
      if (saveWorkspaceTimeoutRef.current !== null) {
        window.clearTimeout(saveWorkspaceTimeoutRef.current);
      }
    };
  }, [
    activeFile,
    activeResultTab,
    files,
    fullRawOutput,
    graph,
    hasHydratedWorkspace,
    limit,
    metrics,
    projectName,
    projectOrigin,
    result,
    selectedFile?.name,
    sidebarWidth,
    task
  ]);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  useEffect(() => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      for (const folderPath of collectFolderPaths(fileTree)) {
        next.add(folderPath);
      }
      return next;
    });
  }, [fileTree]);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function handlePointerMove(event: MouseEvent) {
      setSidebarWidth(Math.min(420, Math.max(220, event.clientX)));
    }

    function stopResizing() {
      setIsResizingSidebar(false);
    }

    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", stopResizing);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: number | undefined;

    async function checkBackend() {
      const controller = new AbortController();
      const abortId = window.setTimeout(() => controller.abort(), 2500);

      try {
        const response = await fetch(`${API_BASE_URL}/health`, {
          cache: "no-store",
          signal: controller.signal
        });

        if (isMounted) {
          setBackendStatus(response.ok ? "online" : "offline");
        }
      } catch {
        if (isMounted) {
          setBackendStatus("offline");
        }
      } finally {
        window.clearTimeout(abortId);
        if (isMounted) {
          timeoutId = window.setTimeout(checkBackend, 5000);
        }
      }
    }

    void checkBackend();

    return () => {
      isMounted = false;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  async function handleSift(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSubmit || isLoading) {
      return;
    }

    setIsLoading(true);
    setError("");
    setCopied(false);
    setActiveResultTab("preview");

    try {
      const virtualFileSystem = files.map((file) => ({
        name: file.name,
        content: file.content
      }));

      const response = await fetch(`${API_BASE_URL}/sift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: virtualFileSystem, task, limit, locale: language })
      });

      const payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload.detail ?? t("apiRequestFailed"));
      }

      const data = payload as SiftResponse;
      setResult(data.markdown);
      setFullRawOutput(data.markdown);
      setMetrics(data);
      setGraph(data.graph);
    } catch (requestError) {
      if (isNetworkError(requestError)) {
        setBackendStatus("offline");
      }
      setError(formatApiError(requestError, t));
    } finally {
      setIsLoading(false);
    }
  }

  function updateActiveFile(content: string) {
    if (!selectedFile) {
      return;
    }
    setFiles((currentFiles) =>
      currentFiles.map((file) => (file.name === selectedFile.name ? { ...file, content } : file))
    );
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    setIsReadingFiles(true);
    try {
      const droppedFiles = await readDroppedFiles(event.dataTransfer);
      replaceProjectFiles(droppedFiles);
    } finally {
      setIsReadingFiles(false);
    }
  }

  async function handleFolderInput(event: ChangeEvent<HTMLInputElement>) {
    setIsReadingFiles(true);
    try {
      const browserFiles = Array.from(event.target.files ?? []);
      const loadedFiles = await readBrowserFiles(browserFiles);
      replaceProjectFiles(loadedFiles);
      event.target.value = "";
    } finally {
      setIsReadingFiles(false);
    }
  }

  function replaceProjectFiles(nextFiles: CodeFile[]) {
    if (!nextFiles.length) {
      return;
    }
    const sortedFiles = dedupeFiles(nextFiles).sort((left, right) => left.name.localeCompare(right.name));
    setFiles(sortedFiles);
    setActiveFile(sortedFiles[0].name);
    setProjectName(projectNameFromFiles(sortedFiles));
    setProjectOrigin("uploaded");
    setResult("");
    setFullRawOutput("");
    setMetrics(null);
    setGraph({ nodes: [], edges: [] });
    setActiveResultTab("preview");
  }

  function resetDemoProject() {
    setFiles(demoProject);
    setActiveFile(demoProject[0].name);
    setProjectName("Demo Project");
    setProjectOrigin("demo");
    setResult("");
    setFullRawOutput("");
    setMetrics(null);
    setGraph({ nodes: [], edges: [] });
    setError("");
    setActiveResultTab("preview");
  }

  function toggleFolder(path: string) {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  async function handleCopy() {
    if (!fullRawOutput) {
      return;
    }
    await navigator.clipboard.writeText(fullRawOutput);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1000);
  }

  return (
    <main
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="h-screen overflow-hidden bg-app text-primary"
    >
      <form onSubmit={handleSift} className="flex h-full flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-panel px-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo className="h-8 w-8 shrink-0 shadow-glow" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-primary">{t("workspaceName")}</div>
              <div className="truncate text-xs text-muted">{t("workspaceSubtitle")}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div
              className={`hidden items-center gap-2 rounded-md border px-3 py-2 text-xs md:flex ${statusClassName(
                backendStatus
              )}`}
              title={t("backendTooltip", { apiUrl: API_BASE_URL })}
            >
              <span className={`h-2 w-2 rounded-full ${statusDotClassName(backendStatus)}`} />
              {backendStatus === "online"
                ? t("backendOnline")
                : backendStatus === "checking"
                  ? t("backendChecking")
                  : t("backendOffline")}
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-border bg-surface/[0.04] px-3 py-2 text-xs text-secondary md:flex">
              <Database className="h-3.5 w-3.5 text-signal" />
              {files.length} {t("virtualFiles")}
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-border bg-surface/[0.04] px-3 py-2 text-xs text-secondary xl:flex">
              <Server className="h-3.5 w-3.5 text-cobalt" />
              {backendLabel}
            </div>
            <div className="hidden text-xs text-muted lg:block">
              {metrics
                ? `${metrics.tokens.toLocaleString()} tokens / ${metrics.files_scanned} files`
                : `${files.length} ${t("filesLoaded")}`}
            </div>
            <label className="hidden h-9 items-center gap-2 rounded-md border border-border bg-surface/[0.04] px-2 text-xs text-secondary sm:flex">
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/[0.04] text-secondary transition hover:bg-surface/10 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
              aria-label={themeMode === "dark" ? t("lightTheme") : t("darkTheme")}
              title={t("themeToggle")}
            >
              {themeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <div
          className="grid min-h-0 flex-1"
          style={{
            gridTemplateColumns: `${sidebarWidth}px 6px minmax(0, 1fr) minmax(22rem, clamp(22rem, 29vw, 32rem))`
          }}
        >
          <aside className="flex min-h-0 flex-col bg-panel">
            <div className="border-b border-border p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  <FolderOpen className="h-4 w-4 text-cobalt" />
                  {t("explorer")}
                </div>
                <button
                  type="button"
                  onClick={resetDemoProject}
                  className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-secondary transition hover:bg-surface/[0.08] hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
                  title={t("reloadDemo")}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t("demo")}
                </button>
              </div>

              <div className="mb-3 rounded-md border border-border bg-surface/[0.04] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <FileText className="h-4 w-4 text-signal" />
                  <span className="truncate">{projectName}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted">
                  <span>{projectOrigin === "demo" ? t("demoProject") : t("uploadedProject")}</span>
                  <span>{files.length} files</span>
                </div>
              </div>

              <input ref={folderInputRef} type="file" multiple className="hidden" onChange={handleFolderInput} />
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className={`flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt ${
                  isDragging
                    ? "border-signal/70 bg-signal/10 text-signal"
                    : "border-border bg-surface/[0.05] text-secondary hover:bg-surface/[0.09] hover:text-primary"
                }`}
              >
                <UploadCloud className="h-4 w-4" />
                {t("uploadFolder")}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-2 py-3">
              {isReadingFiles ? (
                <FileTreeSkeleton label={t("readingFiles")} />
              ) : (
                <FileTree
                  nodes={fileTree}
                  activeFile={selectedFile?.name ?? ""}
                  expandedFolders={expandedFolders}
                  onOpenFile={setActiveFile}
                  onToggleFolder={toggleFolder}
                />
              )}
            </div>
          </aside>

          <button
            type="button"
            onMouseDown={() => setIsResizingSidebar(true)}
            className="group flex cursor-col-resize items-center justify-center border-x border-border bg-panel-strong transition hover:bg-cobalt/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
            aria-label={t("resizeExplorer")}
            title={t("resizeExplorer")}
          >
            <PanelLeft className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100" />
          </button>

          <section className="relative flex min-h-0 flex-col border-r border-border bg-app">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-panel-strong">
              <div className="flex h-full min-w-0 items-center border-r border-border bg-app px-4 text-xs text-secondary">
                <Code2 className="mr-2 h-3.5 w-3.5 shrink-0 text-signal" />
                <Breadcrumbs parts={breadcrumbs} fallback={t("noFileSelected")} />
              </div>
              <div className="px-4 text-xs text-muted">
                {selectedFile ? `${selectedFile.content.length.toLocaleString()} chars` : t("noFile")}
              </div>
            </div>

            <div className="grid min-h-[4.75rem] shrink-0 grid-cols-[minmax(0,1fr)_7rem] items-end gap-3 border-b border-border bg-panel px-4 py-3">
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted">
                  {t("rankingTask")}
                </span>
                <input
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
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
                  onChange={(event) => setLimit(Number(event.target.value))}
                  className="h-9 w-full rounded-md border-border bg-[rgb(var(--cp-input))] text-sm text-primary focus:border-cobalt focus:ring-cobalt"
                />
              </label>
            </div>

            {isLoading ? (
              <div className="h-1 overflow-hidden bg-surface/[0.05]">
                <div className="sift-progress h-full w-1/3 bg-signal" />
              </div>
            ) : null}

            <div className="relative min-h-0 flex-1">
              <CodeEditor
                fileName={selectedFile?.name ?? ""}
                themeMode={themeMode}
                value={selectedFile?.content ?? ""}
                onChange={updateActiveFile}
              />

              <div className="pointer-events-none absolute bottom-5 right-5 z-20 flex flex-col items-end gap-3">
                {isLoading ? (
                  <div className="rounded-md border border-signal/30 bg-panel/95 px-3 py-2 text-xs font-semibold text-signal shadow-glow">
                    {t("aiSifting")}
                  </div>
                ) : null}
                <button
                  type="submit"
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
              <span>{files.length.toLocaleString()} {t("filesInVfs")}</span>
            </div>
          </section>

          <ResultPanel
            activeTab={activeResultTab}
            copied={copied}
            error={error}
            fullRawOutput={fullRawOutput}
            graph={graph}
            markdown={result}
            metrics={metrics}
            onCopy={handleCopy}
            onTabChange={setActiveResultTab}
            themeMode={themeMode}
          />
        </div>
      </form>
    </main>
  );
}

function FileTree({
  nodes,
  activeFile,
  expandedFolders,
  onOpenFile,
  onToggleFolder,
  depth = 0
}: {
  nodes: TreeNode[];
  activeFile: string;
  expandedFolders: Set<string>;
  onOpenFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
  depth?: number;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const isFolder = node.type === "folder";
        const isExpanded = isFolder && expandedFolders.has(node.path);
        const isActive = node.type === "file" && node.path === activeFile;

        return (
          <div key={node.path || node.name}>
            <button
              type="button"
              onClick={() => (isFolder ? onToggleFolder(node.path) : onOpenFile(node.path))}
              className={`flex h-7 w-full items-center gap-1.5 rounded-md pr-2 text-left text-xs transition ${
                isActive ? "bg-cobalt/[0.24] text-primary" : "text-secondary hover:bg-surface/[0.07] hover:text-primary"
              }`}
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
            >
              {isFolder ? (
                <>
                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  {isExpanded ? <FolderOpen className="h-3.5 w-3.5 text-cobalt" /> : <Folder className="h-3.5 w-3.5 text-cobalt" />}
                </>
              ) : (
                <>
                  <span className="w-3.5" />
                  <FileTypeIcon path={node.path} />
                </>
              )}
              <span className="truncate">{node.name}</span>
            </button>

            {isFolder && isExpanded && node.children?.length ? (
              <FileTree
                nodes={node.children}
                activeFile={activeFile}
                expandedFolders={expandedFolders}
                onOpenFile={onOpenFile}
                onToggleFolder={onToggleFolder}
                depth={depth + 1}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Breadcrumbs({ parts, fallback }: { parts: string[]; fallback: string }) {
  if (!parts.length) {
    return <span className="truncate">{fallback}</span>;
  }

  return (
    <nav className="flex min-w-0 items-center gap-1 overflow-hidden" aria-label="Breadcrumb">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="flex min-w-0 items-center gap-1">
          {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0 text-muted" /> : null}
          <span className={index === parts.length - 1 ? "truncate text-primary" : "truncate text-muted"}>{part}</span>
        </span>
      ))}
    </nav>
  );
}

function FileTreeSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3 px-2 py-1" aria-live="polite" aria-busy="true">
      <div className="text-xs font-medium text-muted">{label}</div>
      {Array.from({ length: 9 }, (_, index) => (
        <div
          key={index}
          className="shimmer h-5 rounded-md bg-surface/[0.06]"
          style={{ marginLeft: `${(index % 4) * 14}px`, width: `${88 - (index % 3) * 14}%` }}
        />
      ))}
    </div>
  );
}

function EditorFallback() {
  return (
    <div className="flex h-full min-h-[24rem] items-center justify-center bg-app text-sm text-muted">
      Loading editor...
    </div>
  );
}

type ApiResponsePayload = Partial<SiftResponse> & {
  detail?: string;
};

async function readJsonResponse(response: Response): Promise<ApiResponsePayload> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as ApiResponsePayload;
  } catch {
    return { detail: text };
  }
}

function isNetworkError(error: unknown) {
  return error instanceof TypeError;
}

function formatApiError(error: unknown, t: ReturnType<typeof useI18n>["t"]) {
  if (isNetworkError(error)) {
    return t("apiNetworkError", { apiUrl: API_BASE_URL });
  }

  return error instanceof Error ? error.message : t("apiUnexpectedError");
}

function statusClassName(status: "checking" | "online" | "offline") {
  if (status === "online") {
    return "border-signal/30 bg-signal/10 text-signal";
  }
  if (status === "offline") {
    return "border-warning/30 bg-warning/10 text-warning";
  }
  return "border-border bg-surface/[0.04] text-secondary";
}

function statusDotClassName(status: "checking" | "online" | "offline") {
  if (status === "online") {
    return "bg-signal";
  }
  if (status === "offline") {
    return "bg-warning";
  }
  return "bg-cobalt";
}

function buildFileTree(files: CodeFile[]) {
  const root: TreeNode = { name: "root", path: "", type: "folder", children: [] };

  for (const file of files) {
    const parts = file.name.split("/").filter(Boolean);
    let cursor = root;
    let currentPath = "";

    for (const part of parts.slice(0, -1)) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const children = cursor.children ?? [];
      let folder = children.find((child) => child.type === "folder" && child.name === part);
      if (!folder) {
        folder = { name: part, path: currentPath, type: "folder", children: [] };
        children.push(folder);
        cursor.children = children;
      }
      cursor = folder;
    }

    const fileName = parts.at(-1) ?? file.name;
    cursor.children?.push({ name: fileName, path: file.name, type: "file" });
  }

  return sortTree(root.children ?? []);
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((node) => (node.children ? { ...node, children: sortTree(node.children) } : node))
    .sort((left, right) => {
      if (left.type !== right.type) {
        return left.type === "folder" ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

function collectFolderPaths(nodes: TreeNode[]) {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === "folder") {
      paths.push(node.path);
      paths.push(...collectFolderPaths(node.children ?? []));
    }
  }
  return paths;
}

function dedupeFiles(files: CodeFile[]) {
  const byName = new Map<string, CodeFile>();
  for (const file of files) {
    byName.set(file.name, file);
  }
  return Array.from(byName.values());
}

function projectNameFromFiles(files: CodeFile[]) {
  const firstSegments = files
    .map((file) => file.name.split("/").filter(Boolean)[0])
    .filter((segment): segment is string => Boolean(segment));

  if (!firstSegments.length) {
    return "Uploaded Project";
  }

  const [firstSegment] = firstSegments;
  return firstSegments.every((segment) => segment === firstSegment) ? firstSegment : "Uploaded Project";
}

async function readDroppedFiles(dataTransfer: DataTransfer) {
  const itemEntries = Array.from(dataTransfer.items)
    .map((item) => (item as unknown as DataTransferItemWithEntry).webkitGetAsEntry?.())
    .filter((entry): entry is BrowserEntry => Boolean(entry));

  if (itemEntries.length) {
    const files = await Promise.all(itemEntries.map((entry) => readEntry(entry)));
    return readNamedBrowserFiles(files.flat());
  }

  return readBrowserFiles(Array.from(dataTransfer.files));
}

async function readEntry(entry: BrowserEntry): Promise<BrowserNamedFile[]> {
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      entry.file((file) => {
        resolve([{ name: normalizeDroppedEntryPath(entry.fullPath || file.name), file }]);
      }, reject);
    });
  }

  const reader = entry.createReader();
  const entries = await readAllDirectoryEntries(reader);
  const nested = await Promise.all(entries.map((childEntry) => readEntry(childEntry)));
  return nested.flat();
}

async function readAllDirectoryEntries(reader: BrowserDirectoryReader): Promise<BrowserEntry[]> {
  const entries: BrowserEntry[] = [];

  while (true) {
    const batch = await new Promise<BrowserEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (!batch.length) {
      return entries;
    }
    entries.push(...batch);
  }
}

async function readBrowserFiles(browserFiles: File[]) {
  return readNamedBrowserFiles(
    browserFiles.map((file) => ({
      name: normalizeBrowserFileName(file),
      file
    }))
  );
}

async function readNamedBrowserFiles(browserFiles: BrowserNamedFile[]) {
  const textFiles = browserFiles.filter(({ name, file }) => shouldReadFile(name, file)).slice(0, 400);

  return Promise.all(
    textFiles.map(async ({ name, file }) => ({
      name,
      content: await file.text()
    }))
  );
}

function shouldReadFile(path: string, file: File) {
  const lowerPath = path.toLowerCase();
  const lowerName = file.name.toLowerCase();
  const extension = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".")) : "";
  const segments = lowerPath.split("/");

  return (
    !binaryExtensions.has(extension) &&
    !segments.some((segment) => ignoredBrowserSegments.has(segment)) &&
    !isIgnoredAndroidRawResource(segments) &&
    !ignoredBrowserFiles.has(lowerName) &&
    file.size <= 500_000
  );
}

function FileTypeIcon({ path }: { path: string }) {
  const language = detectedLanguageForPath(path);
  const iconClassName = "h-3.5 w-3.5 shrink-0";

  if (isAndroidSourcePath(path)) {
    return <Smartphone className={`${iconClassName} text-signal`} aria-label="Android source file" />;
  }

  switch (language) {
    case "python":
      return <Hash className={`${iconClassName} text-warning`} aria-label="Python file" />;
    case "javascript":
    case "typescript":
      return <Braces className={`${iconClassName} text-signal`} aria-label={`${language} file`} />;
    case "json":
      return <FileJson className={`${iconClassName} text-secondary`} aria-label="JSON file" />;
    case "xml":
      return <CodeXml className={`${iconClassName} text-cobalt`} aria-label="XML file" />;
    case "yaml":
    case "toml":
    case "ini":
    case "gradle":
      return <Settings className={`${iconClassName} text-muted`} aria-label={`${language} file`} />;
    case "java":
    case "kotlin":
    case "swift":
    case "go":
    case "rust":
    case "cpp":
    case "c":
    case "csharp":
    case "dart":
    case "php":
      return <FileCode2 className={`${iconClassName} text-cobalt`} aria-label={`${language} file`} />;
    case "ruby":
      return <Gem className={`${iconClassName} text-warning`} aria-label="Ruby file" />;
    case "lockfile":
      return <PackageIcon className={`${iconClassName} text-muted`} aria-label="Lockfile" />;
    case "markdown":
      return <FileText className={`${iconClassName} text-secondary`} aria-label="Markdown file" />;
    case "dockerfile":
      return <FileCog className={`${iconClassName} text-signal`} aria-label="Dockerfile" />;
    default:
      return <FileText className={`${iconClassName} text-muted`} aria-label="File" />;
  }
}

function detectedLanguageForPath(path: string) {
  const lowerPath = path.toLowerCase();
  const name = lowerPath.split("/").filter(Boolean).at(-1) ?? lowerPath;
  if (name === "dockerfile") return "dockerfile";
  if (name === "gemfile" || name === "podfile") return "ruby";
  if (name === "go.mod" || name === "go.sum") return "go";
  if (name === "cargo.lock" || name === "package-lock.json" || name === "pnpm-lock.yaml" || name === "yarn.lock") {
    return "lockfile";
  }

  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const languageByExtension: Record<string, string> = {
    ".c": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".cxx": "cpp",
    ".dart": "dart",
    ".go": "go",
    ".gradle": "gradle",
    ".h": "cpp",
    ".hh": "cpp",
    ".hpp": "cpp",
    ".hxx": "cpp",
    ".ini": "ini",
    ".java": "java",
    ".js": "javascript",
    ".json": "json",
    ".jsx": "javascript",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".lock": "lockfile",
    ".md": "markdown",
    ".mjs": "javascript",
    ".php": "php",
    ".py": "python",
    ".rb": "ruby",
    ".rs": "rust",
    ".swift": "swift",
    ".toml": "toml",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".xml": "xml",
    ".yaml": "yaml",
    ".yml": "yaml"
  };
  return languageByExtension[extension] ?? "unknown";
}

function isAndroidSourcePath(path: string) {
  return /(^|\/)src\/main\/(java|kotlin)(\/|$)/i.test(path);
}

function isIgnoredAndroidRawResource(segments: string[]) {
  return segments.some((segment, index) => segment === "res" && segments[index + 1] === "raw");
}

function normalizeDroppedEntryPath(path: string) {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts.filter((part) => part && part !== "." && part !== "..").join("/") || "snippet.txt";
}

function normalizeBrowserFileName(file: File) {
  const relativePath = "webkitRelativePath" in file ? String(file.webkitRelativePath) : "";
  return relativePath || file.name;
}
