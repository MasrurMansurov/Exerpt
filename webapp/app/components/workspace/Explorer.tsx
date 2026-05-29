"use client";

import type { ChangeEvent, DragEvent } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Braces,
  ChevronDown,
  ChevronRight,
  CodeXml,
  FileCog,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Gem,
  Hash,
  Package as PackageIcon,
  RotateCcw,
  Smartphone,
  Settings,
  UploadCloud
} from "lucide-react";
import { useI18n } from "../../i18n";
import type { CodeFile, ProjectOrigin, TreeNode } from "../../types/exerpt";

type ExplorerProps = {
  activeFile: string;
  expandedFolders: Set<string>;
  fileTree: TreeNode[];
  files: CodeFile[];
  onOpenFile: (path: string) => void;
  onReplaceProjectFiles: (files: CodeFile[]) => void;
  onResetDemoProject: () => void;
  onToggleFolder: (path: string) => void;
  projectName: string;
  projectOrigin: ProjectOrigin;
};

type BrowserNamedFile = {
  name: string;
  file: File;
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

export function Explorer({
  activeFile,
  expandedFolders,
  fileTree,
  files,
  onOpenFile,
  onReplaceProjectFiles,
  onResetDemoProject,
  onToggleFolder,
  projectName,
  projectOrigin
}: ExplorerProps) {
  const { t } = useI18n();
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingFiles, setIsReadingFiles] = useState(false);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    setIsReadingFiles(true);
    try {
      const droppedFiles = await readDroppedFiles(event.dataTransfer);
      onReplaceProjectFiles(droppedFiles);
    } finally {
      setIsReadingFiles(false);
    }
  }

  async function handleFolderInput(event: ChangeEvent<HTMLInputElement>) {
    setIsReadingFiles(true);
    try {
      const browserFiles = Array.from(event.target.files ?? []);
      const loadedFiles = await readBrowserFiles(browserFiles);
      onReplaceProjectFiles(loadedFiles);
      event.target.value = "";
    } finally {
      setIsReadingFiles(false);
    }
  }

  return (
    <aside
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="flex min-h-0 flex-col bg-panel"
    >
      <div className="border-b border-border p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
            <FolderOpen className="h-4 w-4 text-cobalt" />
            {t("explorer")}
          </div>
          <button
            type="button"
            onClick={onResetDemoProject}
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
            <span>
              {files.length} {t("files")}
            </span>
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
            activeFile={activeFile}
            expandedFolders={expandedFolders}
            onOpenFile={onOpenFile}
            onToggleFolder={onToggleFolder}
          />
        )}
      </div>
    </aside>
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
