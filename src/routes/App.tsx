import { useCallback, useEffect, useRef, useState } from 'react';
import { FileDown, FileText, SquarePen, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DocumentSortBy,
  DocumentTag,
  DocumentTagOption,
  getLatestDocuments,
  getSettings,
  searchDocuments,
  SearchResult,
  SearchType,
  TagMode,
  stopDropboxSync,
  syncDropbox,
  updateDocumentSentDate,
  updateDocumentTags,
  updateDocumentTitle,
} from '../api';
import { SearchHeader } from '../components/SearchHeader';
import { HighlightedText } from '../highlight';
import { clearPersistedSearchState, readPersistedSearchState, writePersistedSearchState } from '../searchState';
import { useSyncProgress } from '../useSyncProgress';
import { DynamicHeroIcon, hasHeroIconInput, resolveHeroIconName } from '../dynamic-icons';

const searchPageSize = 10;
const noTagsFilterTag = 'no-symbol';
const documentTagControlsKey = 'my-document-store.showDocumentTagControls';
const defaultSortBy: DocumentSortBy = 'scanned';

export default function App() {
  const navigate = useNavigate();
  const persistedSearch = readPersistedSearchState();
  const [query, setQuery] = useState(persistedSearch?.query ?? '');
  const [type, setType] = useState<SearchType>(persistedSearch?.type ?? 'query');
  const [documentTags, setDocumentTags] = useState<DocumentTagOption[]>([]);
  const [tagFilters, setTagFilters] = useState<DocumentTag[]>(persistedSearch?.tagFilters ?? []);
  const [tagMode, setTagMode] = useState<TagMode>((persistedSearch?.tagFilters?.length ?? 0) > 1 ? persistedSearch?.tagMode ?? 'or' : 'or');
  const [sortBy, setSortBy] = useState<DocumentSortBy>(persistedSearch?.sortBy ?? defaultSortBy);
  const [missingSent, setMissingSent] = useState(persistedSearch?.missingSent ?? false);
  const [page, setPage] = useState(persistedSearch?.page ?? 1);
  const [result, setResult] = useState<SearchResult | undefined>(persistedSearch?.result);
  const [resultQuery, setResultQuery] = useState(persistedSearch?.query ?? '');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [latestLoading, setLatestLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [stopSyncLoading, setStopSyncLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [editingTitleId, setEditingTitleId] = useState<string | undefined>();
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSavingId, setTitleSavingId] = useState<string | undefined>();
  const [titleError, setTitleError] = useState<{ documentId: string; message: string } | undefined>();
  const [tagSavingId, setTagSavingId] = useState<string | undefined>();
  const [tagError, setTagError] = useState<{ documentId: string; message: string } | undefined>();
  const [editingSentDateId, setEditingSentDateId] = useState<string | undefined>();
  const [sentDateDraft, setSentDateDraft] = useState('');
  const [sentDateSavingId, setSentDateSavingId] = useState<string | undefined>();
  const [sentDateError, setSentDateError] = useState<{ documentId: string; message: string } | undefined>();
  const [editedDocumentIds, setEditedDocumentIds] = useState<Set<string>>(() => new Set());
  const [vectorSearchEnabled, setVectorSearchEnabled] = useState(false);
  const [showDocumentTagControls, setShowDocumentTagControls] = useState(readDocumentTagControlsPreference);
  const loadingMoreRef = useRef(false);
  const sentDateInputRef = useRef<HTMLInputElement>(null);
  const syncProgress = useSyncProgress();

  useEffect(() => {
    let active = true;
    getSettings()
      .then((settings) => {
        if (active) {
          setVectorSearchEnabled(settings.features.vectorSearchEnabled);
          setDocumentTags(settings.documentTags.map(toDocumentTagOption));
          if (!settings.features.vectorSearchEnabled) {
            setType('query');
          }
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load settings');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!editingSentDateId) {
      return;
    }
    window.requestAnimationFrame(() => sentDateInputRef.current?.focus());
  }, [editingSentDateId]);

  const runSearch = useCallback(
    async (
      nextPage = 1,
      append = false,
      nextTagFilters = tagFilters,
      queryOverride = query,
      nextTagMode = tagMode,
      nextSortBy = sortBy,
      nextMissingSent = missingSent,
    ) => {
    const nextQuery = queryOverride.trim();
    const effectiveTagMode = nextTagFilters.length > 1 ? nextTagMode : 'or';
    const latestLimit = parseLatestQuery(nextQuery);
    if (!append) {
      setEditedDocumentIds(new Set());
    }
    if (latestLimit) {
      setLatestLoading(true);
      setError(undefined);
      try {
        const response = await getLatestDocuments(latestLimit, nextTagFilters, effectiveTagMode, nextSortBy, nextMissingSent);
        const latestResult = { ...response, total: response.items.length };
        setResult(latestResult);
        setResultQuery(nextQuery);
        setPage(1);
        setType('query');
        setTagMode(effectiveTagMode);
        setSortBy(nextSortBy);
        setMissingSent(nextMissingSent);
        writePersistedSearchState({
          query: nextQuery,
          type: 'query',
          tagFilters: nextTagFilters,
          tagMode: effectiveTagMode,
          sortBy: nextSortBy,
          missingSent: nextMissingSent,
          page: 1,
          result: latestResult,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load latest documents');
      } finally {
        setLatestLoading(false);
      }
      return;
    }

    if (!nextQuery && nextTagFilters.length === 0 && !nextMissingSent) {
      setResult(undefined);
      clearPersistedSearchState();
      return;
    }

    if (append) {
      setLoadingMore(true);
      loadingMoreRef.current = true;
    } else {
      setLoading(true);
    }
    setError(undefined);
    try {
      const effectiveQuery = nextQuery || 'all';
      const effectiveType = nextQuery && vectorSearchEnabled ? type : 'query';
      const response = await searchDocuments(effectiveQuery, effectiveType, nextPage, searchPageSize, nextTagFilters, effectiveTagMode, nextSortBy, nextMissingSent);
      const nextResult = append && result ? { ...response, items: [...result.items, ...response.items] } : response;
      setResult(nextResult);
      setResultQuery(effectiveQuery);
      setPage(nextPage);
      setTagMode(effectiveTagMode);
      setSortBy(nextSortBy);
      setMissingSent(nextMissingSent);
      writePersistedSearchState({
        query: effectiveQuery,
        type: effectiveType,
        tagFilters: nextTagFilters,
        tagMode: effectiveTagMode,
        sortBy: nextSortBy,
        missingSent: nextMissingSent,
        page: nextPage,
        result: nextResult,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      if (append) {
        setLoadingMore(false);
        loadingMoreRef.current = false;
      } else {
        setLoading(false);
      }
    }
    },
    [missingSent, query, result, sortBy, tagFilters, tagMode, type, vectorSearchEnabled],
  );

  async function runSync() {
    setSyncLoading(true);
    setError(undefined);
    try {
      await syncDropbox();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncLoading(false);
    }
  }

  async function runLatest(limit: 1 | 2 | 10, nextTagFilters = tagFilters, nextTagMode = tagMode, nextSortBy = sortBy, nextMissingSent = missingSent) {
    const effectiveTagMode = nextTagFilters.length > 1 ? nextTagMode : 'or';
    setEditedDocumentIds(new Set());
    setLatestLoading(true);
    setError(undefined);
    try {
      const response = await getLatestDocuments(limit, nextTagFilters, effectiveTagMode, nextSortBy, nextMissingSent);
      const latestResult = { ...response, total: response.items.length };
      const nextQuery = limit === 1 ? 'last' : `last ${limit}`;
      setResult(latestResult);
      setResultQuery(nextQuery);
      setPage(1);
      setQuery(nextQuery);
      setType('query');
      setTagMode(effectiveTagMode);
      setSortBy(nextSortBy);
      setMissingSent(nextMissingSent);
      writePersistedSearchState({
        query: nextQuery,
        type: 'query',
        tagFilters: nextTagFilters,
        tagMode: effectiveTagMode,
        sortBy: nextSortBy,
        missingSent: nextMissingSent,
        page: 1,
        result: latestResult,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load latest documents');
    } finally {
      setLatestLoading(false);
    }
  }

  async function runStopSync() {
    setStopSyncLoading(true);
    setError(undefined);
    try {
      await stopDropboxSync();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not stop sync');
    } finally {
      setStopSyncLoading(false);
    }
  }

  function resetSearch() {
    setEditedDocumentIds(new Set());
    clearPersistedSearchState();
    setQuery('');
    setType('query');
    setTagFilters([]);
    setTagMode('or');
    setSortBy(defaultSortBy);
    setMissingSent(false);
    setPage(1);
    setResult(undefined);
    setResultQuery('');
    setError(undefined);
    navigate('/');
  }

  function handleTagFiltersChange(nextTags: DocumentTag[]) {
    setEditedDocumentIds(new Set());
    const nextTagMode = nextTags.length > 1 ? tagMode : 'or';
    setTagFilters(nextTags);
    setTagMode(nextTagMode);
    const latestLimit = parseLatestQuery(query);
    if (latestLimit) {
      void runLatest(latestLimit, nextTags, nextTagMode);
      return;
    }
    if (query.trim() || nextTags.length > 0 || missingSent) {
      void runSearch(1, false, nextTags, query, nextTagMode);
      return;
    }
    setResult(undefined);
    setResultQuery('');
    setPage(1);
    clearPersistedSearchState();
  }

  function handleAll() {
    setEditedDocumentIds(new Set());
    setTagFilters([]);
    setTagMode('or');
    setSortBy(defaultSortBy);
    setMissingSent(false);
    setQuery('all');
    void runSearch(1, false, [], 'all', 'or', defaultSortBy, false);
  }

  function handleTagModeChange(nextTagMode: TagMode) {
    if (tagFilters.length <= 1) {
      return;
    }

    setEditedDocumentIds(new Set());
    setTagMode(nextTagMode);
    const latestLimit = parseLatestQuery(query);
    if (latestLimit) {
      void runLatest(latestLimit, tagFilters, nextTagMode);
      return;
    }
    if (query.trim() || tagFilters.length > 0 || missingSent) {
      void runSearch(1, false, tagFilters, query, nextTagMode);
    }
  }

  function toggleDocumentTagControls() {
    setShowDocumentTagControls((current) => {
      const next = !current;
      localStorage.setItem(documentTagControlsKey, next ? 'true' : 'false');
      return next;
    });
  }

  function handleSortChange(nextSortBy: DocumentSortBy) {
    setEditedDocumentIds(new Set());
    const effectiveSortBy = nextSortBy === sortBy ? (nextSortBy === 'sent' ? 'scanned' : 'sent') : nextSortBy;
    setSortBy(effectiveSortBy);
    const nextQuery = query.trim() || resultQuery.trim() || 'all';
    setQuery(nextQuery);
    const latestLimit = parseLatestQuery(nextQuery);
    if (latestLimit) {
      void runLatest(latestLimit, tagFilters, tagMode, effectiveSortBy, missingSent);
      return;
    }
    void runSearch(1, false, tagFilters, nextQuery, tagMode, effectiveSortBy, missingSent);
  }

  function handleMissingSentChange(nextMissingSent: boolean) {
    setEditedDocumentIds(new Set());
    setMissingSent(nextMissingSent);
    const nextQuery = query.trim() || resultQuery.trim() || (nextMissingSent ? 'all' : '');
    setQuery(nextQuery);
    if (!nextQuery && tagFilters.length === 0) {
      setResult(undefined);
      setResultQuery('');
      setPage(1);
      clearPersistedSearchState();
      return;
    }
    const latestLimit = parseLatestQuery(nextQuery);
    if (latestLimit) {
      void runLatest(latestLimit, tagFilters, tagMode, sortBy, nextMissingSent);
      return;
    }
    void runSearch(1, false, tagFilters, nextQuery, tagMode, sortBy, nextMissingSent);
  }

  function startTitleEdit(documentId: string, title: string) {
    setEditingTitleId(documentId);
    setTitleDraft(title);
    setTitleError(undefined);
  }

  function cancelTitleEdit() {
    setEditingTitleId(undefined);
    setTitleDraft('');
    setTitleError(undefined);
  }

  async function saveTitle(documentId: string, currentTitle: string) {
    if (titleSavingId) {
      return;
    }

    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError({ documentId, message: 'Document title is required' });
      return;
    }
    if (nextTitle === currentTitle) {
      cancelTitleEdit();
      return;
    }

    setTitleSavingId(documentId);
    setTitleError(undefined);
    try {
      const response = await updateDocumentTitle(documentId, nextTitle);
      setEditedDocumentIds((current) => {
        const next = new Set(current);
        next.add(documentId);
        return next;
      });
      setResult((current) => {
        if (!current) {
          return current;
        }
        const nextResult = {
          ...current,
          items: current.items.map((item) => (item.documentId === documentId ? { ...item, title: response.title } : item)),
        };
        writePersistedSearchState({
          query: resultQuery,
          type,
          tagFilters,
          tagMode,
          sortBy,
          missingSent,
          page,
          result: nextResult,
        });
        return nextResult;
      });
      setEditingTitleId(undefined);
      setTitleDraft('');
    } catch (err) {
      setTitleError({ documentId, message: err instanceof Error ? err.message : 'Could not update document title' });
    } finally {
      setTitleSavingId(undefined);
    }
  }

  function startSentDateEdit(documentId: string, currentSentDate?: string, fallbackDate?: string) {
    setEditingSentDateId(documentId);
    setSentDateDraft(currentSentDate ?? toDateInputValue(fallbackDate) ?? '');
    setSentDateError(undefined);
  }

  function cancelSentDateEdit() {
    setEditingSentDateId(undefined);
    setSentDateDraft('');
    setSentDateError(undefined);
  }

  async function saveSentDate(documentId: string, currentSentDate?: string) {
    if (sentDateSavingId) {
      return;
    }

    const nextSentDate = sentDateDraft || undefined;
    if (nextSentDate === currentSentDate) {
      cancelSentDateEdit();
      return;
    }

    setSentDateSavingId(documentId);
    setSentDateError(undefined);
    try {
      const response = await updateDocumentSentDate(documentId, nextSentDate ?? null);
      setEditedDocumentIds((current) => {
        const next = new Set(current);
        next.add(documentId);
        return next;
      });
      setResult((current) => {
        if (!current) {
          return current;
        }
        const nextResult = {
          ...current,
          items: current.items.map((item) =>
            item.documentId === documentId ? { ...item, sentAt: response.sentAt, hasSentDate: response.hasSentDate } : item,
          ),
        };
        writePersistedSearchState({
          query: resultQuery,
          type,
          tagFilters,
          tagMode,
          sortBy,
          missingSent,
          page,
          result: nextResult,
        });
        return nextResult;
      });
      setEditingSentDateId(undefined);
      setSentDateDraft('');
    } catch (err) {
      setSentDateError({ documentId, message: err instanceof Error ? err.message : 'Could not update sent date' });
    } finally {
      setSentDateSavingId(undefined);
    }
  }

  async function toggleDocumentTag(documentId: string, currentTags: DocumentTag[], tag: DocumentTag) {
    if (tagSavingId) {
      return;
    }

    const nextTags = currentTags.includes(tag) ? currentTags.filter((item) => item !== tag) : [...currentTags, tag];
    setTagSavingId(documentId);
    setTagError(undefined);
    try {
      const response = await updateDocumentTags(documentId, nextTags);
      setEditedDocumentIds((current) => {
        const next = new Set(current);
        next.add(documentId);
        return next;
      });
      setResult((current) => {
        if (!current) {
          return current;
        }
        const nextResult = {
          ...current,
          items: current.items.map((item) => (item.documentId === documentId ? { ...item, tags: response.tags } : item)),
        };
        writePersistedSearchState({
          query: resultQuery,
          type,
          tagFilters,
          tagMode,
          sortBy,
          missingSent,
          page,
          result: nextResult,
        });
        return nextResult;
      });
    } catch (err) {
      setTagError({ documentId, message: err instanceof Error ? err.message : 'Could not update document tags' });
    } finally {
      setTagSavingId(undefined);
    }
  }

  const hasMoreResults = result ? result.items.length < result.total : false;

  useEffect(() => {
    if (!hasMoreResults || loading || loadingMore) {
      return;
    }

    const sentinel = document.getElementById('search-scroll-sentinel');
    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingMoreRef.current) {
          void runSearch(page + 1, true);
        }
      },
      { rootMargin: '400px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreResults, loading, loadingMore, page, runSearch]);

  return (
    <main className="min-h-screen bg-stone-50 text-stone-950">
      <SearchHeader
        query={query}
        type={type}
        latestLoading={latestLoading}
        syncLoading={syncLoading}
        stopSyncLoading={stopSyncLoading}
        syncProgress={syncProgress}
        documentTags={documentTags}
        tagFilters={tagFilters}
        tagMode={tagMode}
        sortBy={sortBy}
        missingSent={missingSent}
        showDocumentTagControls={showDocumentTagControls}
        vectorSearchEnabled={vectorSearchEnabled}
        onQueryChange={setQuery}
        onTypeChange={setType}
        onTagFiltersChange={handleTagFiltersChange}
        onTagModeChange={handleTagModeChange}
        onSortChange={handleSortChange}
        onMissingSentChange={handleMissingSentChange}
        onToggleDocumentTagControls={toggleDocumentTagControls}
        onAll={handleAll}
        onSubmit={() => void runSearch(1)}
        onLatest={(limit) => void runLatest(limit)}
        onReset={resetSearch}
        onSync={() => void runSync()}
        onStopSync={() => void runStopSync()}
      />

      <section className="mx-auto w-full max-w-5xl">
        {error && <div className="rounded border border-red-200 bg-red-50 p-4 text-lg text-red-800">{error}</div>}

        {result && (
          <div className="flex items-center justify-between p-4 text-lg text-stone-600">
            <span>
              {result.total} result{result.total === 1 ? '' : 's'}
            </span>
            <span>
              {result.items.length} / {result.total} shown
            </span>
          </div>
        )}

        <div className="divide-y divide-stone-200 border-y border-stone-200 bg-white">
          {result?.items.map((item) => {
            const itemMissingTerms = missingTerms(resultQuery, item.matchedTerms);
            const title = item.title ?? item.fileName;
            return (
              <article
                key={item.documentId}
                className="p-4"
              >
                <div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-3">
                    <div className="min-w-0">
                      {editingTitleId === item.documentId ? (
                        <form
                          className="flex min-w-0 items-start gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void saveTitle(item.documentId, title);
                          }}
                        >
                          <input
                            className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-xl font-semibold text-stone-950 outline-none focus:border-stone-500 disabled:bg-stone-100"
                            value={titleDraft}
                            disabled={titleSavingId === item.documentId}
                            autoFocus
                            aria-label={`Edit title for ${title}`}
                            onChange={(event) => setTitleDraft(event.target.value)}
                            onBlur={() => void saveTitle(item.documentId, title)}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                cancelTitleEdit();
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
                            title="Cancel edit"
                            aria-label={`Cancel title edit for ${title}`}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              cancelTitleEdit();
                            }}
                          >
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </form>
                      ) : (
                        <div className="flex min-w-0 items-start gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 break-words text-left text-xl font-semibold text-stone-950 hover:text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
                            title="Edit title"
                            aria-label={`Edit title for ${title}`}
                            onClick={() => startTitleEdit(item.documentId, title)}
                            onFocus={() => startTitleEdit(item.documentId, title)}
                          >
                            {title}
                          </button>
                          <button
                            type="button"
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
                            title="Edit title"
                            aria-label={`Edit title for ${title}`}
                            onClick={() => startTitleEdit(item.documentId, title)}
                          >
                            <SquarePen className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                      {titleError?.documentId === item.documentId && (
                        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{titleError.message}</div>
                      )}
                    </div>
                    {item.language && <span className="shrink-0 text-lg font-medium text-stone-400">{languageLabel(item.language)}</span>}
                    <div className="flex shrink-0 justify-end gap-2">
                      {item.pdfUrl && (
                        <a
                          className="flex h-8 w-8 items-center justify-center rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-900"
                          href={item.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open PDF"
                          aria-label={`Open PDF for ${title}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <FileDown className="h-5 w-5" aria-hidden="true" />
                        </a>
                      )}
                      <Link
                        className="flex h-8 w-8 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
                        to={`/documents/${item.documentId}/text`}
                        title="Open text"
                        aria-label={`Open text for ${title}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-base text-stone-500">scanned: {formatDate(item.modifiedAt ?? item.createdAt)}</p>
                  {editingSentDateId === item.documentId ? (
                    <form
                      className="flex items-center gap-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveSentDate(item.documentId, item.sentAt);
                      }}
                    >
                      <span className="text-base text-stone-500">sent:</span>
                      <input
                        ref={sentDateInputRef}
                        type="date"
                        value={sentDateDraft}
                        disabled={sentDateSavingId === item.documentId}
                        className="h-8 rounded border border-stone-300 bg-white px-2 text-sm text-stone-700 outline-none focus:border-stone-900 disabled:cursor-not-allowed disabled:text-stone-300"
                        aria-label={`Sent date for ${title}`}
                        onChange={(event) => setSentDateDraft(event.target.value)}
                        onBlur={() => void saveSentDate(item.documentId, item.sentAt)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            void saveSentDate(item.documentId, item.sentAt);
                            return;
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            cancelSentDateEdit();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
                        title="Cancel sent date edit"
                        aria-label={`Cancel sent date edit for ${title}`}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          cancelSentDateEdit();
                        }}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="text-base text-stone-500 hover:text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
                      title="Edit sent date"
                      aria-label={`Edit sent date for ${title}`}
                      onClick={() => startSentDateEdit(item.documentId, item.sentAt, item.createdAt)}
                    >
                      sent: {item.sentAt ? formatSentDate(item.sentAt) : '-'}
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {showDocumentTagControls && (
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1" aria-label={`Tags for ${title}`}>
                      {editedDocumentIds.has(item.documentId) && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-600"
                          title="Edited since last search"
                          aria-label="Edited since last search"
                        />
                      )}
                      {documentTags.filter(isAssignableDocumentTag).map((tag) => {
                        const tagged = item.tags?.includes(tag.value) ?? false;
                        return (
                          <button
                            key={tag.value}
                            type="button"
                            title={tag.name}
                            aria-label={`${tagged ? 'Remove' : 'Add'} ${tag.name} tag for ${title}`}
                            aria-pressed={tagged}
                            disabled={tagSavingId === item.documentId}
                            onClick={() => void toggleDocumentTag(item.documentId, item.tags ?? [], tag.value)}
                            className={`flex h-7 min-w-7 items-center justify-center rounded border px-0.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                              tagged ? 'border-stone-950 bg-stone-950 text-white' : 'border-stone-950 bg-white text-stone-950 hover:bg-stone-100'
                            }`}
                          >
                            <TagLabel tag={tag} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {sentDateError?.documentId === item.documentId && (
                  <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{sentDateError.message}</div>
                )}
                {showDocumentTagControls && tagError?.documentId === item.documentId && (
                  <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-800">{tagError.message}</div>
                )}
                {itemMissingTerms.length > 0 && (
                  <p className="mt-1 text-sm text-stone-400">
                    {itemMissingTerms.map((term) => (
                      <span key={term} className="mr-2 line-through">
                        {term}
                      </span>
                    ))}
                  </p>
                )}
                <p className="mt-2 max-w-4xl text-l leading-6 text-stone-700">
                  <HighlightedText text={item.excerpt} terms={item.matchedTerms} />
                </p>
              </article>
            );
          })}
        </div>

        <div id="search-scroll-sentinel" className="h-10" />
        {loadingMore && <div className="mt-3 text-center text-lg text-stone-500">Loading more results</div>}
      </section>
    </main>
  );
}

function TagLabel({ tag }: { tag: DocumentTagOption }) {
  const iconName = resolveHeroIconName(tag.icon);
  if (iconName || hasHeroIconInput(tag.icon)) {
    return <DynamicHeroIcon className="h-6 w-6" name={iconName ?? 'QuestionMarkCircleIcon'} aria-hidden="true" />;
  }
  return tag.label;
}

function toDocumentTagOption(tag: { id: string; short: string; text: string; icon?: string }): DocumentTagOption {
  return {
    id: tag.id,
    value: tag.text,
    label: tag.short,
    name: tag.text,
    icon: tag.icon,
  };
}

function isAssignableDocumentTag(tag: DocumentTagOption) {
  return tag.value !== noTagsFilterTag;
}

function readDocumentTagControlsPreference() {
  return localStorage.getItem(documentTagControlsKey) === 'true';
}

function missingTerms(query: string, matchedTerms: string[]) {
  const terms = normalizeQueryTerms(query);
  if (terms.length <= 1) {
    return [];
  }
  const matched = new Set(matchedTerms.map((term) => term.toLowerCase()));
  return terms.filter((term) => !matched.has(term));
}

function normalizeQueryTerms(input: string) {
  return Array.from(
    new Set(
      input
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .map((term) => term.trim())
        .filter((term) => term.length > 1 && term !== 'last'),
    ),
  );
}

function formatDate(value?: string) {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function formatSentDate(value?: string) {
  if (!value) {
    return '';
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${value}T00:00:00`));
}

function toDateInputValue(value?: string) {
  if (!value) {
    return undefined;
  }
  return new Date(value).toISOString().slice(0, 10);
}

function languageLabel(language: string) {
  const labels: Record<string, string> = {
    deu: 'DE',
    eng: 'EN',
    fra: 'FR',
    fre: 'FR',
  };
  return labels[language] ?? language.toUpperCase();
}

function parseLatestQuery(value: string): 1 | 2 | 10 | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'last') {
    return 1;
  }
  if (normalized === 'last 2') {
    return 2;
  }
  if (normalized === 'last 10') {
    return 10;
  }
  return undefined;
}
