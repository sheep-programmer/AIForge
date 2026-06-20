// 前端 API 类型。**不要手改 lib/api-schema.ts**——它由后端 OpenAPI 经
// `npm run gen:api-types` 生成（流程：server 端 `uv run python scripts/export_openapi.py`
// 刷新 web/openapi.json，再跑生成）。
//
// 下面把后端 schema（components['schemas']）派生为前端语义名（Skill* → Artifact*）。
// 后端对带默认值的字段标了可选（如 tags / score / mcp_config），这里用交叉类型把它们
// 收窄回前端实际依赖的必填形状——字段集与历史手写类型一致，消费端不受影响。
// 后端一旦改名/改型，这里会 tsc 报错，从而把「漂移」挡在编译期。
//
// 仍手工维护的只有纯前端视图模型：IngestJob / AutotagJob（跨端点、状态用更严格的字面量
// 联合）、Environment*（对后端不透明 payload 的细化）与少量枚举。

import type { components } from './api-schema';

type Schemas = components['schemas'];
type JsonObject = Record<string, unknown>;

export type ArtifactType = 'skill' | 'mcp' | 'plugin';
export type TagSource = 'manual' | 'auto';

export type ArtifactBrief = Schemas['SkillBrief'] & { tags: string[] };

export type ArtifactDetail = Schemas['SkillDetail'] & {
  tags: string[];
  mcp_config: JsonObject | null;
  plugin_manifest: JsonObject | null;
};

export type ArtifactListResponse = Omit<Schemas['SkillListResponse'], 'items'> & {
  items: ArtifactBrief[];
};

export type TagItem = Schemas['TagItem'] & { description: string | null };

export type TagListResponse = Omit<Schemas['TagListResponse'], 'items'> & {
  items: TagItem[];
};

export type ArtifactTagAssignment = Schemas['ArtifactTagAssignment'] & {
  source: TagSource;
  score: number | null;
};

export type ArtifactTagsResponse = Omit<Schemas['ArtifactTagsResponse'], 'tags'> & {
  tags: ArtifactTagAssignment[];
};

export type HealthResponse = Schemas['HealthResponse'];

export type Recommendation = Schemas['Recommendation'] & {
  tags: string[];
  rerank_reason: string | null;
  mcp_config: JsonObject | null;
  plugin_manifest: JsonObject | null;
};

export type RecommendResponse = Omit<Schemas['RecommendResponse'], 'recommendations'> & {
  recommendations: Recommendation[];
};

export type PendingDiscovery = Schemas['PendingDiscoveryItem'];

// —— 以下为纯前端视图模型，手工维护 ——

// ingest 任务：POST /v1/ingest 与 GET /v1/ingest/{id} 共用一个前端视图，
// status 用更严格的字面量联合，部分字段在创建瞬间尚不可知故为可选。
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

// —— /v1/environment ——
// 本机环境扫描：各家 agent 的 settings 目录里已装了哪些 MCP / plugin / skill。
// 后端 payload 是不透明 JSON，这里给出前端细化结构；与 aiforge scan --sync 上报的
// payload 保持一致；密钥值已脱敏，只留 env_keys。

export interface InstalledMcp {
  name: string;
  transport: string;
  command: string | null;
  args: string[];
  url: string | null;
  /** env 变量的 key 名（值已脱敏，不会出现在响应里） */
  env_keys: string[];
  source: string;
}

export interface InstalledPlugin {
  name: string;
  marketplace: string | null;
  scope: string | null;
  version: string | null;
  path: string | null;
}

export interface InstalledSkill {
  name: string;
  path: string;
}

export interface AgentEnv {
  agent: string;
  display: string;
  detected: boolean;
  config_paths: string[];
  mcps: InstalledMcp[];
  plugins: InstalledPlugin[];
  skills: InstalledSkill[];
  counts: { mcp: number; plugin: number; skill: number };
}

export interface EnvironmentPayload {
  machine: string;
  scanned_at: string;
  cwd: string;
  agents: AgentEnv[];
  totals: { mcp: number; plugin: number; skill: number };
}

export interface EnvironmentMachine {
  machine: string;
  scanned_at: string;
  total_mcp: number;
  total_plugin: number;
  total_skill: number;
  agent_count: number;
  payload: EnvironmentPayload;
}

export interface EnvironmentResponse {
  machines: EnvironmentMachine[];
}

export interface InstalledNames {
  mcp: string[];
  plugin: string[];
  skill: string[];
}
