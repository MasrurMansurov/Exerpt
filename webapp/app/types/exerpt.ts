export type RankReason = {
  code: string;
  score: number;
  explanation: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type CodeFile = {
  name: string;
  content: string;
};

export type GraphNode = {
  id: string;
  priority: string;
  detected_language?: string;
  importance_score?: number;
  reason_codes?: RankReason[];
};

export type GraphEdge = {
  source: string;
  target: string;
};

export type DependencyGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type SiftResponse = {
  markdown: string;
  tokens: number;
  files_scanned: number;
  priority_counts: Record<string, number>;
  graph: DependencyGraph;
  compression_warning?: string | null;
};

export type SiftRequest = {
  files: CodeFile[];
  task: string;
  limit: number;
  locale: string;
};

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobResponse = {
  id: string;
  status: JobStatus;
  progress: number;
  message: string;
  message_code: string;
  result?: SiftResponse | null;
  error?: string | null;
};

export type ApiResponsePayload = Partial<SiftResponse> & Partial<JobResponse> & {
  detail?: string;
  error?: string;
};

export type TreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
};

export type ProjectOrigin = "demo" | "uploaded";

export type BackendStatus = "checking" | "online" | "offline";

export type ResultTab = "preview" | "graph" | "raw";

export type WorkspaceSnapshot = {
  version: 1;
  activeFile: string;
  activeResultTab: ResultTab;
  files: CodeFile[];
  fullRawOutput: string;
  graph: DependencyGraph;
  limit: number;
  metrics: SiftResponse | null;
  projectName: string;
  projectOrigin: ProjectOrigin;
  result: string;
  resultFiles?: CodeFile[];
  savedAt: number;
  sidebarWidth: number;
  task: string;
};
