import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLatestDocuments, getSettings, searchDocuments, SearchResult, SearchType, stopDropboxSync, syncDropbox } from '../api';
import { SearchHeader } from '../components/SearchHeader';
import { Toast } from '../components/Toast';
import { HighlightedText } from '../highlight';
import { clearPersistedSearchState, readPersistedSearchState, writePersistedSearchState } from '../searchState';
import { useSyncProgress } from '../useSyncProgress';

const searchPageSize = 10;

export default function App() {
  const persistedSearch = readPersistedSearchState();
  const [query, setQuery] = useState(persistedSearch?.query ?? '');
  const [type, setType] = useState<SearchType>(persistedSearch?.type ?? 'query');
  const [page, setPage] = useState(persistedSearch?.page ?? 1);
  const [result, setResult] = useState<SearchResult | undefined>(persistedSearch?.result);
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
      setResult(latestResult);
      setPage(1);
      const nextQuery = limit === 1 ? 'last' : `last ${limit}`;
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
        loading={loading}
        latestLoading={latestLoading}
        syncLoading={syncLoading}
        stopSyncLoading={stopSyncLoading}
        syncProgress={syncProgress}
        vectorSearchEnabled={vectorSearchEnabled}
        onQueryChange={setQuery}
        onTypeChange={setType}
        onSubmit={() => void runSearch(1)}
        onLatest={(limit) => void runLatest(limit)}
        onSync={() => void runSync()}
        onStopSync={() => void runStopSync()}
      />

      <section className="mx-auto w-full max-w-5xl px-4 py-6">
        {error && <div className="rounded border border-red-200 bg-red-50 px-5 py-4 text-lg text-red-800">{error}</div>}

        {result && (
          <div className="mb-4 flex items-center justify-between text-lg text-stone-600">
            <span>
              {result.total} result{result.total === 1 ? '' : 's'}
            </span>
            <span>
              {result.items.length} / {result.total} shown
            </span>
          </div>
        )}

        <div className="divide-y divide-stone-200 border-y border-stone-200 bg-white">
          {result?.items.map((item) => (
            <article key={item.documentId} className="px-4 py-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h2 className="text-2xl font-semibold">{item.fileName}</h2>
                    {item.language && <span className="text-lg font-medium text-stone-400">{languageLabel(item.language)}</span>}
                  </div>
                  <p className="mt-1 text-base text-stone-500">{formatDate(item.modifiedAt ?? item.createdAt)}</p>
                </div>
                <div className="flex shrink-0 gap-4 text-lg">
                  <Link className="font-medium text-blue-700 hover:text-blue-900" to={`/documents/${item.documentId}/text`}>
                    Text
                  </Link>
                  {item.pdfUrl && (
                    <a className="font-medium text-blue-700 hover:text-blue-900" href={item.pdfUrl} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                  )}
                </div>
              </div>
              <p className="mt-4 max-w-4xl text-xl leading-8 text-stone-700">
                <HighlightedText text={item.excerpt} terms={item.matchedTerms} />
              </p>
            </article>
          ))}
        </div>

        <div id="search-scroll-sentinel" className="h-10" />
        {loadingMore && <div className="mt-3 text-center text-lg text-stone-500">Loading more results</div>}
      </section>
      <Toast message={statusMessage} />
    </main>
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
