import { useCallback, useEffect, useRef, useState } from 'react';
import { FileDown, FileText, SquarePen, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getLatestDocuments, getSettings, searchDocuments, SearchResult, SearchType, stopDropboxSync, syncDropbox, updateDocumentTitle } from '../api';
import { SearchHeader } from '../components/SearchHeader';
import { HighlightedText } from '../highlight';
import { clearPersistedSearchState, readPersistedSearchState, writePersistedSearchState } from '../searchState';
import { useSyncProgress } from '../useSyncProgress';

const searchPageSize = 10;

export default function App() {
  const navigate = useNavigate();
  const persistedSearch = readPersistedSearchState();
  const [query, setQuery] = useState(persistedSearch?.query ?? '');
  const [type, setType] = useState<SearchType>(persistedSearch?.type ?? 'query');
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
  const [vectorSearchEnabled, setVectorSearchEnabled] = useState(false);
  const loadingMoreRef = useRef(false);
  const syncProgress = useSyncProgress();

  useEffect(() => {
    let active = true;
    getSettings()
      .then((settings) => {
        if (active) {
          setVectorSearchEnabled(settings.features.vectorSearchEnabled);
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

  const runSearch = useCallback(async (nextPage = 1, append = false) => {
    if (!query.trim()) {
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
      const effectiveType = vectorSearchEnabled ? type : 'query';
      const response = await searchDocuments(query.trim(), effectiveType, nextPage, searchPageSize);
      const nextResult = append && result ? { ...response, items: [...result.items, ...response.items] } : response;
      setResult(nextResult);
      setResultQuery(query.trim());
      setPage(nextPage);
      writePersistedSearchState({
        query: query.trim(),
        type: effectiveType,
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
  }, [query, result, type, vectorSearchEnabled]);

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

  async function runLatest(limit: 1 | 2 | 10) {
    setLatestLoading(true);
    setError(undefined);
    try {
      const response = await getLatestDocuments(limit);
      const latestResult = { ...response, total: response.items.length };
      const nextQuery = limit === 1 ? 'last' : `last ${limit}`;
      setResult(latestResult);
      setResultQuery(nextQuery);
      setPage(1);
      setQuery(nextQuery);
      setType('query');
      writePersistedSearchState({
        query: nextQuery,
        type: 'query',
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
    clearPersistedSearchState();
    setQuery('');
    setType('query');
    setPage(1);
    setResult(undefined);
    setResultQuery('');
    setError(undefined);
    navigate('/');
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
        vectorSearchEnabled={vectorSearchEnabled}
        onQueryChange={setQuery}
        onTypeChange={setType}
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
                          className="flex h-8 w-8 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
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
                <div
                  role="link"
                  tabIndex={0}
                  className="mt-1 cursor-pointer rounded p-1 -mx-1 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
                  aria-label={`Open text for ${title}`}
                  onClick={() => navigate(`/documents/${item.documentId}/text`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/documents/${item.documentId}/text`);
                    }
                  }}
                >
                  <p className="text-base text-stone-500">{formatDate(item.modifiedAt ?? item.createdAt)}</p>
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
                </div>
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

function languageLabel(language: string) {
  const labels: Record<string, string> = {
    deu: 'DE',
    eng: 'EN',
    fra: 'FR',
    fre: 'FR',
  };
  return labels[language] ?? language.toUpperCase();
}
