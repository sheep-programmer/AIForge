// HTTP 客户端：所有路径都走 /api 前缀，由 next.config 的 rewrite 转发到 aiforge 服务端。
// 失败时抛 ApiError，调用方决定渲染什么。
//
// SWR fetcher 包装函数：fetcher 也在这里导出。

import type {
  ArtifactDetail,
  ArtifactListResponse,
  ArtifactTagsResponse,
  ArtifactType,
  AutotagJob,
  EnvironmentResponse,
  HealthResponse,
  IngestJob,
  InstalledNames,
  PendingDiscovery,
  RecommendResponse,
  TagItem,
  TagListResponse,
} from './api-types';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, status: number, code = 'http_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function rawFetch(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  // 客户端鉴权 token（如果用户在 settings 配过）
  if (typeof window !== 'undefined') {
    const apiKey = window.localStorage.getItem('aiforge.api_key');
    if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
  }
  return fetch(`/api${path}`, { ...init, headers, cache: 'no-store' });
}

async function parseJsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    let message: string = res.statusText || `HTTP ${res.status}`;
    let code = 'http_error';
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      if (typeof obj.error === 'string' && obj.error) message = obj.error;
      if (typeof obj.code === 'string' && obj.code) code = obj.code;
    }
    throw new ApiError(message, res.status, code);
  }
  return (body ?? ({} as unknown)) as T;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export const fetcher = async <T,>(path: string): Promise<T> => {
  const res = await rawFetch(path);
  return parseJsonOrThrow<T>(res);
};

export const api = {
  health: () => fetcher<HealthResponse>('/v1/health'),

  listArtifacts: (params: {
    type?: ArtifactType;
    tag?: string;
    q?: string;
    active?: boolean;
    limit?: number;
    offset?: number;
  } = {}) => {
    const sp = new URLSearchParams();
    if (params.type) sp.set('type', params.type);
    if (params.tag) sp.set('tag', params.tag);
    if (params.q) sp.set('q', params.q);
    if (params.active !== undefined) sp.set('active', String(params.active));
    sp.set('limit', String(params.limit ?? 50));
    sp.set('offset', String(params.offset ?? 0));
    return fetcher<ArtifactListResponse>(`/v1/artifacts?${sp.toString()}`);
  },

  getArtifact: (id: string) => fetcher<ArtifactDetail>(`/v1/artifacts/${id}`),

  listTags: () => fetcher<TagListResponse>('/v1/tags'),

  createTag: async (name: string, description?: string) => {
    const res = await rawFetch('/v1/tags', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
    return parseJsonOrThrow<TagItem>(res);
  },

  deleteTag: async (name: string) => {
    const res = await rawFetch(`/v1/tags/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      await parseJsonOrThrow<unknown>(res);
    }
  },

  setArtifactTags: async (id: string, tags: string[]) => {
    const res = await rawFetch(`/v1/artifacts/${id}/tags`, {
      method: 'PUT',
      body: JSON.stringify({ tags, source: 'manual' }),
    });
    return parseJsonOrThrow<ArtifactTagsResponse>(res);
  },

  ingest: async (githubUrl: string, branch = 'main', autoApprove = true) => {
    const res = await rawFetch('/v1/ingest', {
      method: 'POST',
      body: JSON.stringify({ github_url: githubUrl, branch, auto_approve: autoApprove }),
    });
    return parseJsonOrThrow<{ job_id: string; status: string }>(res);
  },

  getIngestJob: (jobId: string) => fetcher<IngestJob>(`/v1/ingest/${jobId}`),

  startAutotag: async (params: {
    artifact_ids?: string[];
    only_untagged?: boolean;
    max_tags_per_artifact?: number;
    background?: boolean;
  } = {}) => {
    const res = await rawFetch('/v1/admin/autotag', {
      method: 'POST',
      body: JSON.stringify({
        only_untagged: params.only_untagged ?? true,
        max_tags_per_artifact: params.max_tags_per_artifact ?? 3,
        background: params.background ?? true,
        artifact_ids: params.artifact_ids,
      }),
    });
    return parseJsonOrThrow<AutotagJob>(res);
  },

  getAutotagJob: (jobId: string) => fetcher<AutotagJob>(`/v1/admin/autotag/${jobId}`),

  recommend: async (prompt: string, topK = 3, maxTokens = 4000) => {
    const res = await rawFetch('/v1/recommend', {
      method: 'POST',
      body: JSON.stringify({ prompt, top_k: topK, max_tokens: maxTokens }),
    });
    return parseJsonOrThrow<RecommendResponse>(res);
  },

  listDiscoveries: () => fetcher<{ items: PendingDiscovery[] }>('/v1/admin/discoveries'),

  approveDiscovery: async (id: string, notes?: string) => {
    const res = await rawFetch(`/v1/admin/discoveries/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
    return parseJsonOrThrow<{ discovery_id: string; decision: string; ingest_job_id: string | null }>(res);
  },

  rejectDiscovery: async (id: string, notes?: string) => {
    const res = await rawFetch(`/v1/admin/discoveries/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
    return parseJsonOrThrow<{ discovery_id: string; decision: string }>(res);
  },

  patchArtifact: async (id: string, body: { is_active: boolean }) => {
    const res = await rawFetch(`/v1/skills/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return parseJsonOrThrow<ArtifactDetail>(res);
  },

  deleteArtifact: async (id: string) => {
    const res = await rawFetch(`/v1/skills/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      await parseJsonOrThrow<unknown>(res);
    }
  },

  addArtifactTag: async (id: string, tag: string, source: 'manual' | 'auto' = 'manual') => {
    const res = await rawFetch(`/v1/artifacts/${id}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag, source }),
    });
    return parseJsonOrThrow<ArtifactTagsResponse>(res);
  },

  removeArtifactTag: async (id: string, tag: string) => {
    const res = await rawFetch(
      `/v1/artifacts/${id}/tags/${encodeURIComponent(tag)}`,
      { method: 'DELETE' }
    );
    if (!res.ok && res.status !== 204) {
      return parseJsonOrThrow<ArtifactTagsResponse>(res);
    }
    return null;
  },

  // 本机环境：aiforge scan --sync 上报的各家 agent 已装清单
  getEnvironment: () => fetcher<EnvironmentResponse>('/v1/environment'),

  // 扁平去重名单，用于跨页交叉引用「已装」标记
  getInstalledNames: () => fetcher<InstalledNames>('/v1/environment/installed'),
};
