import { useCallback, useEffect, useRef, useState } from 'react';
import { FileDown, FileText } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getLatestDocuments, getSettings, searchDocuments, SearchResult, SearchType, stopDropboxSync, syncDropbox } from '../api';
import { SearchHeader } from '../components/SearchHeader';
import { Toast } from '../components/Toast';
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
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
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

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setStatusMessage(undefined), 10000);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

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
    setStatusMessage(undefined);
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
    setStatusMessage(undefined);
    try {
      await syncDropbox();
      setStatusMessage('Sync started. Check the status icon for progress.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncLoading(false);
    }
  }

  async function runLatest(limit: 1 | 2 | 10) {
    setLatestLoading(true);
    setError(undefined);
    setStatusMessage(undefined);
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
    setStatusMessage(undefined);
    try {
      await stopDropboxSync();
      setStatusMessage('Sync stop requested. Check the status icon for progress.');
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
    setStatusMessage(undefined);
    navigate('/');
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
            return (
              <article
                key={item.documentId}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/documents/${item.documentId}/text`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/documents/${item.documentId}/text`);
                  }
                }}
                className="cursor-pointer p-4 hover:bg-stone-50"
              >
                <div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-start gap-3">
                    <h2 className="min-w-0 flex-1 text-xl font-semibold">{item.fileName}</h2>
                    {item.language && <span className="shrink-0 text-lg font-medium text-stone-400">{languageLabel(item.language)}</span>}
                    <div className="flex shrink-0 justify-end gap-2">
                      {item.pdfUrl && (
                        <a
                          className="flex h-8 w-8 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
                          href={item.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="Open PDF"
                          aria-label={`Open PDF for ${item.fileName}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <FileDown className="h-5 w-5" aria-hidden="true" />
                        </a>
                      )}
                      <Link
                        className="flex h-8 w-8 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
                        to={`/documents/${item.documentId}/text`}
                        title="Open text"
                        aria-label={`Open text for ${item.fileName}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <FileText className="h-5 w-5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                  <p className="mt-1 text-base text-stone-500">{formatDate(item.modifiedAt ?? item.createdAt)}</p>
                  {itemMissingTerms.length > 0 && (
                    <p className="mt-1 text-sm text-stone-400">
                      {itemMissingTerms.map((term) => (
                        <span key={term} className="mr-2 line-through">
                          {term}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
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
      <Toast message={statusMessage} />
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
