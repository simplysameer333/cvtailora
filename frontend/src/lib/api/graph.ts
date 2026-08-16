// Graph+loop engine API — types mirror backend services/graph/state.py (GraphRun)
// and the routers/graph_runs.py endpoints. Used by the AgentGraph visualization.

import api from "./client";

export type NodeStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type NodeRole = "analyze" | "generate" | "evaluate" | "merge" | "refine" | "orchestrate";
export type EdgeKind = "sequential" | "fanout" | "fanin" | "loopback" | "spawn";

export interface NodeCost {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  usd: number;
  llm_calls: number;
}

export interface GraphNode {
  id: string;
  label: string;
  agent: string;
  role: NodeRole;
  status: NodeStatus;
  spawned_by: string | null;
  spawned_count: number;
  loop_count: number;
  score: number | null;
  latency_ms: number;
  cost: NodeCost;
  evals: { name: string; passed: boolean; score: number | null; message: string; severity: string }[];
  detail: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  loop_count: number;
  label: string | null;
}

export interface LoopRun {
  loop_id: string;
  over: string;
  iterations: number;
  gain_per_iter: number[];
  stop_reason: string;
  best_score: number | null;
  cost_usd: number;
  latency_ms: number;
}

export interface CostRollup {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  usd: number;
  llm_calls: number;
  latency_ms: number;
  total_loops: number;
}

export interface GraphRun {
  run_id: string;
  kind: "cv_score" | "cv_build";
  status: "pending" | "running" | "completed" | "failed";
  model: string;
  tier: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  loops: LoopRun[];
  totals: CostRollup;
  evals: GraphRun["nodes"][number]["evals"];
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

export async function startCvScore(resume_text: string, job_description = ""): Promise<{ run_id: string }> {
  const { data } = await api.post("/api/graph/cv-score", { resume_text, job_description });
  return data;
}

export async function startCvBuild(body: {
  resume_text: string;
  job_description?: string;
  profile_text?: string;
  key_skills?: string[];
  pass_threshold?: number;
  max_iterations?: number;
}): Promise<{ run_id: string }> {
  const { data } = await api.post("/api/graph/cv-build", body);
  return data;
}

export async function getGraphRun(runId: string): Promise<GraphRun> {
  const { data } = await api.get(`/api/graph/runs/${runId}`);
  return data;
}

export async function listGraphRuns(kind?: "cv_score" | "cv_build", limit = 25): Promise<GraphRun[]> {
  const { data } = await api.get("/api/graph/runs", { params: { kind, limit } });
  return data.runs;
}
