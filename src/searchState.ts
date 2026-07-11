import { DocumentTag, SearchResult, SearchType, TagMode } from './api';

const searchStateKey = 'my-document-store.search';

export interface PersistedSearchState {
  query: string;
  type: SearchType;
  tagFilters?: DocumentTag[];
  tagMode?: TagMode;
  page: number;
  result: SearchResult;
}

export function readPersistedSearchState(): PersistedSearchState | undefined {
  try {
    const raw = sessionStorage.getItem(searchStateKey);
    return raw ? (JSON.parse(raw) as PersistedSearchState) : undefined;
  } catch {
    sessionStorage.removeItem(searchStateKey);
    return undefined;
  }
}

export function writePersistedSearchState(state: PersistedSearchState) {
  sessionStorage.setItem(searchStateKey, JSON.stringify(state));
}

export function clearPersistedSearchState() {
  sessionStorage.removeItem(searchStateKey);
}
