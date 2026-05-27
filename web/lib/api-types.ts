// 与 server/src/aiforge/core/schemas.py 保持手工同步的 TypeScript 类型。
// 改动请同步两侧；不要在前端用任何"猜测的"字段。

export type ArtifactType = 'skill' | 'mcp' | 'plugin';
export type TagSource = 'manual' | 'auto';

export interface ArtifactBrief {
  id: string;
  name: string;
  description: string;
  source_url: string;
  source_repo: string;
  source_stars: number;
  is_active: boolean;
  body_tokens: number;
  recommend_count: number;
  updated_at: string;
  artifact_type: ArtifactType;
  tags: string[];
}

export interface ArtifactDetail extends ArtifactBrief {
  body: string;
  source_path: string;
  license: string | null;
  cluster_id: number | null;
  is_approved: boolean;
  created_at: string;
  last_recommended_at: string | null;
  mcp_config: Record<string, unknown> | null;
  plugin_manifest: Record<string, unknown> | null;
}

export interface ArtifactListResponse {
  total: number;
  items: ArtifactBrief[];
  limit: number;
  offset: number;
}

export interface TagItem {
  name: string;
  description: string | null;
  is_builtin: boolean;
  artifact_count: number;
  created_at: string;
}

export interface TagListResponse {
  total: number;
  items: TagItem[];
}

export interface ArtifactTagAssignment {
  tag: string;
  source: TagSource;
  score: number | null;
}

export interface ArtifactTagsResponse {
  artifact_id: string;
  tags: ArtifactTagAssignment[];
}

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  skills_count: number;
  reranker_available: boolean;
  embedder_loaded: boolean;
  uptime_seconds: number;
}

export interface IngestJob {
  job_id: string;
  status: 'pending' | 'fetching' | 'parsing' | 'embedding' | 'done' | 'error';
  source_url?: string;
  skills_added: number;
  skills_updated: number;
  error: string | null;
  created_at?: string;
  finished_at?: string | null;
}

export interface AutotagJob {
  job_id: string;
  status: 'running' | 'done' | 'error';
  artifacts_total: number;
  artifacts_tagged: number;
  error: string | null;
}

export interface Recommendation {
  skill_id: string;
  name: string;
  description: string;
  body: string;
  score: number;
  source_url: string;
  rerank_reason: string | null;
  tokens: number;
  artifact_type: ArtifactType;
  tags: string[];
  mcp_config: Record<string, unknown> | null;
  plugin_manifest: Record<string, unknown> | null;
}

export interface RecommendResponse {
  request_id: string;
  elapsed_ms: number;
  recommendations: Recommendation[];
  candidates_considered: number;
  fallback_used: boolean;
}

export interface PendingDiscovery {
  id: string;
  source_url: string;
  source_repo: string;
  source_stars: number;
  skill_count: number;
  sample_skill_names: string[];
  found_via: string;
  found_at: string;
  decision: 'pending' | 'approved' | 'rejected';
}
