"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useThemeMode } from "../theme";
import type {
  ApiResponsePayload,
  BackendStatus,
  CodeFile,
  DependencyGraph,
  JobResponse,
  ResultTab,
  SiftRequest,
  SiftResponse,
  TreeNode,
  WorkspaceSnapshot
} from "../types/exerpt";
import { demoProject } from "../components/workspace/demo-project";
import { loadWorkspaceSnapshot, saveWorkspaceSnapshot } from "../components/workspace-persistence";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_EXERPT_API_URL ??
  process.env.NEXT_PUBLIC_CODEPACT_API_URL ??
  "http://127.0.0.1:8000"
).replace(/\/$/, "");

const SSE_WATCHDOG_MS = 4000;

export function useWorkspaceState() {
  const { language, localeOptions, setLanguage, t } = useI18n();
  const { themeMode, toggleTheme } = useThemeMode();
  const [files, setFiles] = useState<CodeFile[]>(demoProject);
  const [activeFile, setActiveFile] = useState(demoProject[0].name);
  const [projectName, setProjectName] = useState("Demo Project");
  const [projectOrigin, setProjectOrigin] = useState<"demo" | "uploaded">("demo");
  const [task, setTask] = useState("Optimize dependency graph");
  const [limit, setLimit] = useState(8000);
  const [result, setResult] = useState("");
  const [resultFiles, setResultFiles] = useState<CodeFile[]>(demoProject);
  const [fullRawOutput, setFullRawOutput] = useState("");
  const [metrics, setMetrics] = useState<SiftResponse | null>(null);
  const [graph, setGraph] = useState<DependencyGraph>({ nodes: [], edges: [] });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>("preview");
  const [copied, setCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["src", "src/exerpt", "tests"]));
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(284);
  const [hasHydratedWorkspace, setHasHydratedWorkspace] = useState(false);
  const saveWorkspaceTimeoutRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const selectedFile = files.find((file) => file.name === activeFile) ?? files[0];
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const breadcrumbs = useMemo(() => selectedFile?.name.split("/").filter(Boolean) ?? [], [selectedFile?.name]);
  const canSubmit = files.length > 0 && task.trim().length > 0 && files.some((file) => file.content.trim());
  const backendLabel = API_BASE_URL.replace(/^https?:\/\//, "");
  const invitePreview = useMemo(
    () => `${projectName} · ${task || "Exerpt"} · ${limit.toLocaleString()} tokens`,
    [limit, projectName, task]
  );
  const hasAppliedInviteRef = useRef(false);

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
        setResultFiles(snapshot.resultFiles ?? snapshot.files);
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
      resultFiles,
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
    resultFiles,
    selectedFile?.name,
    sidebarWidth,
    task
  ]);

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
    if (!hasHydratedWorkspace || hasAppliedInviteRef.current) {
      return;
    }

    hasAppliedInviteRef.current = true;
    const inviteResult = readInviteSettings();
    if (inviteResult.status === "missing") {
      return;
    }

    if (inviteResult.status === "invalid") {
      resetDemoProject();
      setTask("Optimize dependency graph");
      setLimit(8000);
      showToast(t("inviteLoadFailed"));
      return;
    }

    const { settings } = inviteResult;
    setTask(settings.task);
    setLimit(settings.limit);
    setProjectName(settings.projectName);
    setResult("");
    setFullRawOutput("");
    setMetrics(null);
    setGraph({ nodes: [], edges: [] });
    setActiveResultTab("preview");
    if (settings.language) {
      setLanguage(settings.language);
    }
  }, [hasHydratedWorkspace, setLanguage, t]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current !== null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

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
    setProgressMessage(t("jobQueued"));
    setProgressPercent(0);

    try {
      const requestPayload: SiftRequest = {
        files: files.map((file) => ({
          name: file.name,
          content: file.content
        })),
        task,
        limit,
        locale: language
      };

      const response = await fetch(`${API_BASE_URL}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload)
      });

      const payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload.detail ?? t("apiRequestFailed"));
      }

      setBackendStatus("online");
      const job = payload as JobResponse;
      setResultFiles(requestPayload.files);
      applyJobSnapshot(job);
      const data = await streamJob(job.id);
      applySiftResponse(data);
    } catch (requestError) {
      if (isNetworkError(requestError)) {
        setBackendStatus("offline");
      }
      setError(formatApiError(requestError, t));
    } finally {
      setIsLoading(false);
      setProgressMessage("");
      setProgressPercent(0);
    }
  }

  function applySiftResponse(data: SiftResponse) {
    setResult(data.markdown);
    setFullRawOutput(data.markdown);
    setMetrics(data);
    setGraph(data.graph);
  }

  function applyJobSnapshot(job: JobResponse) {
    setProgressPercent(Math.min(100, Math.max(0, job.progress)));
    setProgressMessage(jobMessageFor(job.message_code, job.message, t));
  }

  async function streamJob(jobId: string): Promise<SiftResponse> {
    if (typeof EventSource === "undefined") {
      return pollJob(jobId);
    }

    return new Promise<SiftResponse>((resolve, reject) => {
      let settled = false;
      let watchdogId: number | null = null;
      const eventSource = new EventSource(`${API_BASE_URL}/jobs/${jobId}/events`);

      function settle(callback: () => void) {
        if (settled) {
          return;
        }
        settled = true;
        if (watchdogId !== null) {
          window.clearTimeout(watchdogId);
        }
        eventSource.close();
        callback();
      }

      function fallbackToPolling() {
        settle(() => {
          void pollJob(jobId).then(resolve, reject);
        });
      }

      function resetWatchdog() {
        if (watchdogId !== null) {
          window.clearTimeout(watchdogId);
        }
        watchdogId = window.setTimeout(fallbackToPolling, SSE_WATCHDOG_MS);
      }

      function handleSnapshot(event: MessageEvent<string>) {
        try {
          resetWatchdog();
          const job = JSON.parse(event.data) as JobResponse;
          applyJobSnapshot(job);

          if (job.status === "completed") {
            if (job.result) {
              settle(() => resolve(job.result as SiftResponse));
            } else {
              settle(() => reject(new Error(t("apiUnexpectedError"))));
            }
          } else if (job.status === "failed") {
            settle(() => reject(new Error(job.error ?? job.message ?? t("apiRequestFailed"))));
          }
        } catch (streamError) {
          settle(() => reject(streamError));
        }
      }

      eventSource.addEventListener("progress", (event) => handleSnapshot(event as MessageEvent<string>));
      eventSource.addEventListener("result", (event) => handleSnapshot(event as MessageEvent<string>));
      eventSource.addEventListener("error", (event) => {
        if (event instanceof MessageEvent && event.data) {
          handleSnapshot(event as MessageEvent<string>);
          return;
        }

        fallbackToPolling();
      });
      resetWatchdog();
    });
  }

  async function pollJob(jobId: string): Promise<SiftResponse> {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, { cache: "no-store" });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(payload.detail ?? t("apiRequestFailed"));
      }

      const job = payload as JobResponse;
      applyJobSnapshot(job);
      if (job.status === "completed") {
        if (!job.result) {
          throw new Error(t("apiUnexpectedError"));
        }
        return job.result;
      }
      if (job.status === "failed") {
        throw new Error(job.error ?? job.message ?? t("apiRequestFailed"));
      }
      await delay(600);
    }

    throw new Error(t("apiUnexpectedError"));
  }

  function updateActiveFile(content: string) {
    if (!selectedFile) {
      return;
    }
    setFiles((currentFiles) =>
      currentFiles.map((file) => (file.name === selectedFile.name ? { ...file, content } : file))
    );
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
    setResultFiles(sortedFiles);
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
    setResultFiles(demoProject);
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

  async function handleCopyInviteLink() {
    const invitePayload = encodeInvitePayload({
      language,
      limit,
      projectName,
      task,
      version: 1
    });
    const inviteUrl = new URL("/", inviteBaseUrl());
    inviteUrl.searchParams.set("settings", invitePayload);

    await navigator.clipboard.writeText(inviteUrl.toString());
    setInviteCopied(true);
    window.setTimeout(() => setInviteCopied(false), 1500);
  }

  return {
    activeResultTab,
    backendLabel,
    backendStatus,
    breadcrumbs,
    canSubmit,
    copied,
    error,
    expandedFolders,
    fileTree,
    files,
    fullRawOutput,
    graph,
    handleCopy,
    handleCopyInviteLink,
    handleSift,
    inviteCopied,
    invitePreview,
    isLoading,
    language,
    limit,
    localeOptions,
    metrics,
    projectName,
    projectOrigin,
    progressMessage,
    progressPercent,
    replaceProjectFiles,
    resetDemoProject,
    result,
    resultFiles,
    selectedFile,
    setActiveFile,
    setActiveResultTab,
    setIsResizingSidebar,
    setLanguage,
    setLimit,
    setTask,
    sidebarWidth,
    t,
    task,
    themeMode,
    toastMessage,
    toggleFolder,
    toggleTheme,
    updateActiveFile
  };

  function showToast(message: string) {
    setToastMessage(message);
    if (toastTimeoutRef.current !== null) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToastMessage("");
      toastTimeoutRef.current = null;
    }, 4200);
  }
}

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

function jobMessageFor(
  messageCode: string | undefined,
  fallback: string | undefined,
  t: ReturnType<typeof useI18n>["t"]
) {
  switch (messageCode) {
    case "jobQueued":
      return t("jobQueued");
    case "jobScanning":
      return t("jobScanning");
    case "jobBuildingGraph":
      return t("jobBuildingGraph");
    case "jobRanking":
      return t("jobRanking");
    case "jobFittingTokens":
      return t("jobFittingTokens");
    case "jobComplete":
      return t("jobComplete");
    case "jobFailed":
      return t("jobFailed");
    default:
      return fallback || t("aiSifting");
  }
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
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

type InviteSettings = {
  language?: "en" | "ru" | "zh" | "ja" | "hi";
  limit: number;
  projectName: string;
  task: string;
};

type InviteReadResult =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "loaded"; settings: InviteSettings };

function readInviteSettings(): InviteReadResult {
  const invite = invitePayloadFromLocation();
  if (invite === null) {
    return { status: "missing" };
  }

  const payload = decodeInvitePayload(invite);
  if (!payload || typeof payload.task !== "string") {
    return { status: "invalid" };
  }

  return {
    status: "loaded",
    settings: {
      language: isSupportedLanguage(payload.language) ? payload.language : undefined,
      limit: normalizeInviteLimit(payload.limit),
      projectName:
        typeof payload.projectName === "string" && payload.projectName ? payload.projectName : "Shared Project",
      task: payload.task
    }
  };
}

function invitePayloadFromLocation() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("settings")) {
    return params.get("settings") ?? "";
  }
  if (params.has("invite")) {
    return params.get("invite") ?? "";
  }

  const match = window.location.pathname.match(/^\/share\/([^/?#]+)/);
  if (!match?.[1]) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}

function encodeInvitePayload(payload: Record<string, string | number>) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeInvitePayload(value: string): Record<string, unknown> | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isSupportedLanguage(value: unknown): value is "en" | "ru" | "zh" | "ja" | "hi" {
  return value === "en" || value === "ru" || value === "zh" || value === "ja" || value === "hi";
}

function normalizeInviteLimit(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 8000;
  }
  return Math.min(1_000_000, Math.max(1, Math.round(value)));
}

function inviteBaseUrl() {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }
  return (
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_EXERPT_SITE_URL ??
    "https://exerpt.dev"
  );
}
