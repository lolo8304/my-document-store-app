export type SearchType = 'query' | 'question';

export interface SearchResultItem {
  documentId: string;
  title: string;
  fileName: string;
  language?: string;
  createdAt?: string;
  modifiedAt?: string;
  excerpt: string;
  matchedTerms: string[];
  textUrl: string;
  pdfUrl?: string;
  score?: number;
}

export interface SearchResult {
  items: SearchResultItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface FullTextResult {
  documentId: string;
  title: string;
  fileName: string;
  text: string;
}

export interface UpdateDocumentResult {
  documentId: string;
  title: string;
  fileName: string;
}

export interface AppSettings {
  features: {
    vectorSearchEnabled: boolean;
  };
}

export interface SyncResult {
  started: boolean;
}

export interface StopSyncResult {
  stopRequested: boolean;
}

export interface SyncProgress {
  running: boolean;
  current: number;
  total: number;
  imported: number;
  skipped: number;
  markedDeleted: number;
  failed: number;
  status: 'idle' | 'running' | 'stopping' | 'completed' | 'failed' | 'stopped';
  phase?: 'idle' | 'listing' | 'checking' | 'downloading' | 'extracting' | 'spellchecking' | 'embedding' | 'storing' | 'deleting';
  fileName?: string;
  fileElapsedSeconds?: number;
  startedAt?: string;
  error?: string;
}

export interface AdminStatus {
  documents: Record<string, number>;
  chunks: number;
  database: string;
  sync: {
    running: boolean;
    startedAt?: string;
    current: number;
    total: number;
    status?: SyncProgress['status'];
    phase?: SyncProgress['phase'];
    fileName?: string;
    fileElapsedSeconds?: number;
  };
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const apiKey = import.meta.env.VITE_API_KEY ?? 'my-document-store-key';

async function apiFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      api_key: apiKey,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function apiPost<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      api_key: apiKey,
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'PATCH',
    headers: {
      api_key: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function searchDocuments(query: string, type: SearchType, page = 1, pageSize = 20) {
  const params = new URLSearchParams({
    q: query,
    type,
    page: String(page),
    pageSize: String(pageSize),
  });
  return apiFetch<SearchResult>(`/documents/search?${params.toString()}`);
}

export function getLatestDocuments(limit: 1 | 2 | 10) {
  return apiFetch<SearchResult>(`/documents/latest?limit=${limit}`);
}

export function getSettings() {
  return apiFetch<AppSettings>('/settings');
}

export function syncDropbox() {
  return apiPost<SyncResult>('/admin/sync');
}

export function stopDropboxSync() {
  return apiPost<StopSyncResult>('/admin/sync/stop');
}

export function getAdminStatus() {
  return apiFetch<AdminStatus>('/admin/status');
}

export function getDocumentText(id: string) {
  return apiFetch<FullTextResult>(`/documents/${id}/text`);
}

export function updateDocumentTitle(id: string, title: string) {
  return apiPatch<UpdateDocumentResult>(`/documents/${id}`, { title });
}

export function getPdfLink(id: string) {
  return apiFetch<{ documentId: string; pdfUrl: string }>(`/documents/${id}/pdf-link`);
}
