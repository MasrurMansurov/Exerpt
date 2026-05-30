"use client";

import { useCallback, useState } from "react";
import { Check, Database, Globe2, Link2, Moon, PanelLeft, Server, Sun } from "lucide-react";
import { useWorkspaceState, API_BASE_URL } from "../hooks/useWorkspaceState";
import { Logo } from "./Logo";
import { EditorPane } from "./workspace/Editor";
import { Explorer } from "./workspace/Explorer";
import { ResultPanel } from "./workspace/ResultPanel";

export function Workspace() {
  const workspace = useWorkspaceState();
  const [isResultFocused, setIsResultFocused] = useState(false);
  const toggleResultFocus = useCallback(() => {
    setIsResultFocused((value) => !value);
  }, []);

  return (
    <main className="h-screen overflow-hidden bg-app text-primary">
      <form onSubmit={workspace.handleSift} className="flex h-full flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-panel px-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo
              iconClassName="h-8 w-8 drop-shadow-[0_0_18px_rgba(176,228,204,0.22)]"
              wordmarkClassName="font-mono text-base font-semibold tracking-normal"
            />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="rounded border border-signal/30 bg-signal/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-signal">
                  v1.0-rc
                </span>
              </div>
              <div className="truncate text-xs text-muted">{workspace.t("workspaceSubtitle")}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => void workspace.handleCopyInviteLink()}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-surface/[0.04] px-3 text-xs font-medium text-secondary transition hover:bg-surface/10 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
                title={workspace.invitePreview}
              >
                {workspace.inviteCopied ? <Check className="h-3.5 w-3.5 text-signal" /> : <Link2 className="h-3.5 w-3.5 text-cobalt" />}
                {workspace.inviteCopied ? workspace.t("inviteCopied") : workspace.t("copyInviteLink")}
              </button>
              {workspace.inviteCopied ? (
                <div className="absolute right-0 top-11 z-30 w-72 rounded-md border border-border bg-panel p-3 text-xs shadow-glass">
                  <div className="font-semibold text-primary">{workspace.t("invitePreviewTitle")}</div>
                  <div className="mt-1 line-clamp-2 text-muted">{workspace.invitePreview}</div>
                </div>
              ) : null}
            </div>
            <div
              className={`hidden items-center gap-2 rounded-md border px-3 py-2 text-xs md:flex ${statusClassName(
                workspace.backendStatus
              )}`}
              title={workspace.t("backendTooltip", { apiUrl: API_BASE_URL })}
            >
              <span className={`h-2 w-2 rounded-full ${statusDotClassName(workspace.backendStatus)}`} />
              {workspace.backendStatus === "online"
                ? workspace.t("backendOnline")
                : workspace.backendStatus === "checking"
                  ? workspace.t("backendChecking")
                  : workspace.t("backendOffline")}
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-border bg-surface/[0.04] px-3 py-2 text-xs text-secondary md:flex">
              <Database className="h-3.5 w-3.5 text-signal" />
              {workspace.files.length} {workspace.t("virtualFiles")}
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-border bg-surface/[0.04] px-3 py-2 text-xs text-secondary xl:flex">
              <Server className="h-3.5 w-3.5 text-cobalt" />
              {workspace.backendLabel}
            </div>
            <div className="hidden text-xs text-muted lg:block">
              {workspace.metrics
                ? `${workspace.metrics.tokens.toLocaleString()} tokens / ${workspace.metrics.files_scanned} files`
                : `${workspace.files.length} ${workspace.t("filesLoaded")}`}
            </div>
            <label className="hidden h-9 items-center gap-2 rounded-md border border-border bg-surface/[0.04] px-2 text-xs text-secondary sm:flex">
              <Globe2 className="h-3.5 w-3.5 text-cobalt" />
              <span className="sr-only">{workspace.t("language")}</span>
              <select
                value={workspace.language}
                onChange={(event) => workspace.setLanguage(event.target.value as typeof workspace.language)}
                className="max-w-[7.5rem] border-0 bg-transparent p-0 text-xs text-secondary focus:ring-0"
                aria-label={workspace.t("language")}
              >
                {workspace.localeOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.nativeLabel}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={workspace.toggleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface/[0.04] text-secondary transition hover:bg-surface/10 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
              aria-label={workspace.themeMode === "dark" ? workspace.t("lightTheme") : workspace.t("darkTheme")}
              title={workspace.t("themeToggle")}
            >
              {workspace.themeMode === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </header>

        {isResultFocused ? (
          <div className="min-h-0 flex-1">
            <ResultPanel
              activeTab={workspace.activeResultTab}
              copied={workspace.copied}
              error={workspace.error}
              fullRawOutput={workspace.fullRawOutput}
              graph={workspace.graph}
              isFocused={isResultFocused}
              markdown={workspace.result}
              metrics={workspace.metrics}
              onCopy={workspace.handleCopy}
              onTabChange={workspace.setActiveResultTab}
              onToggleFocus={toggleResultFocus}
              originalFiles={workspace.resultFiles}
              themeMode={workspace.themeMode}
            />
          </div>
        ) : (
          <div
            className="grid min-h-0 flex-1"
            style={{
              gridTemplateColumns: `${workspace.sidebarWidth}px 6px minmax(0, 1fr) minmax(24rem, clamp(24rem, 34vw, 40rem))`
            }}
          >
            <Explorer
              activeFile={workspace.selectedFile?.name ?? ""}
              expandedFolders={workspace.expandedFolders}
              fileTree={workspace.fileTree}
              files={workspace.files}
              onOpenFile={workspace.setActiveFile}
              onReplaceProjectFiles={workspace.replaceProjectFiles}
              onResetDemoProject={workspace.resetDemoProject}
              onToggleFolder={workspace.toggleFolder}
              projectName={workspace.projectName}
              projectOrigin={workspace.projectOrigin}
            />

            <button
              type="button"
              onMouseDown={() => workspace.setIsResizingSidebar(true)}
              className="group flex cursor-col-resize items-center justify-center border-x border-border bg-panel-strong transition hover:bg-cobalt/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cobalt"
              aria-label={workspace.t("resizeExplorer")}
              title={workspace.t("resizeExplorer")}
            >
              <PanelLeft className="h-3.5 w-3.5 text-muted opacity-0 transition group-hover:opacity-100" />
            </button>

            <EditorPane
              breadcrumbs={workspace.breadcrumbs}
              canSubmit={workspace.canSubmit}
              fileCount={workspace.files.length}
              isLoading={workspace.isLoading}
              limit={workspace.limit}
              onChangeFile={workspace.updateActiveFile}
              onLimitChange={workspace.setLimit}
              onSift={() => void workspace.handleSift()}
              onTaskChange={workspace.setTask}
              progressMessage={workspace.progressMessage}
              progressPercent={workspace.progressPercent}
              projectName={workspace.projectName}
              selectedFile={workspace.selectedFile}
              task={workspace.task}
              themeMode={workspace.themeMode}
            />

            <ResultPanel
              activeTab={workspace.activeResultTab}
              copied={workspace.copied}
              error={workspace.error}
              fullRawOutput={workspace.fullRawOutput}
              graph={workspace.graph}
              isFocused={isResultFocused}
              markdown={workspace.result}
              metrics={workspace.metrics}
              onCopy={workspace.handleCopy}
              onTabChange={workspace.setActiveResultTab}
              onToggleFocus={toggleResultFocus}
              originalFiles={workspace.resultFiles}
              themeMode={workspace.themeMode}
            />
          </div>
        )}
        {workspace.toastMessage ? (
          <div
            role="status"
            className="fixed right-4 top-16 z-50 max-w-sm rounded-md border border-warning/40 bg-panel px-4 py-3 text-sm text-primary shadow-glass"
          >
            {workspace.toastMessage}
          </div>
        ) : null}
      </form>
    </main>
  );
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
