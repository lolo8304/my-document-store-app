import { useEffect, useState } from 'react';
import { ArrowLeft, FileDown, FileText } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getDocumentText, getLatestDocuments, getPdfLink, getSettings, searchDocuments, SearchType, stopDropboxSync, syncDropbox } from '../api';
import { SearchHeader } from '../components/SearchHeader';
import { Toast } from '../components/Toast';
import { HighlightedText } from '../highlight';
import { clearPersistedSearchState, readPersistedSearchState, writePersistedSearchState } from '../searchState';
import { useSyncProgress } from '../useSyncProgress';

const searchPageSize = 10;

export default function DocumentTextPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const persistedSearch = readPersistedSearchState();
  const [query, setQuery] = useState(persistedSearch?.query ?? '');
  const [type, setType] = useState<SearchType>(persistedSearch?.type ?? 'query');
  const [text, setText] = useState('');
  const [pdfUrl, setPdfUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [latestLoading, setLatestLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [stopSyncLoading, setStopSyncLoading] = useState(false);
  const [vectorSearchEnabled, setVectorSearchEnabled] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
  const syncProgress = useSyncProgress();
  const highlightTerms = normalizeHighlightTerms(query);

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
    if (!id) {
      return;
    }

    let active = true;
    setLoading(true);
    setError(undefined);

    Promise.all([getDocumentText(id), getPdfLink(id)])
      .then(([textResponse, linkResponse]) => {
        if (!active) {
          return;
        }
        setText(textResponse.text);
        setPdfUrl(linkResponse.pdfUrl);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load document');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setStatusMessage(undefined), 10000);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  async function runSearch() {
    if (!query.trim()) {
      clearPersistedSearchState();
      navigate('/');
      return;
    }

    setError(undefined);
    try {
      const effectiveType = vectorSearchEnabled ? type : 'query';
      const result = await searchDocuments(query.trim(), effectiveType, 1, searchPageSize);
      writePersistedSearchState({
        query: query.trim(),
        type: effectiveType,
        page: 1,
        result,
      });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    }
  }

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
      writePersistedSearchState({
        query: nextQuery,
        type: 'query',
        page: 1,
        result: latestResult,
      });
      navigate('/');
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
        onSubmit={() => void runSearch()}
        onLatest={(limit) => void runLatest(limit)}
        onSync={() => void runSync()}
        onStopSync={() => void runStopSync()}
      />

      <section className="mx-auto w-full max-w-5xl p-4">
        <div className="mb-4 flex items-center justify-between">
          <Link
            className="flex h-8 w-8 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
            to="/"
            title="Back to results"
            aria-label="Back to results"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex shrink-0 justify-end gap-2">
            {pdfUrl && (
              <a
                className="flex h-8 w-8 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
                href={pdfUrl}
                target="_blank"
                rel="noreferrer"
                title="Open PDF"
                aria-label="Open PDF"
              >
                <FileDown className="h-5 w-5" aria-hidden="true" />
              </a>
            )}
            <span
              className="flex h-8 w-8 items-center justify-center rounded border border-stone-300 bg-stone-200 text-stone-950"
              title="Text"
              aria-label="Text"
            >
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
          </div>
        </div>
        {loading && <div className="text-lg text-stone-600">Loading document text</div>}
        {error && <div className="rounded border border-red-200 bg-red-50 p-4 text-lg text-red-800">{error}</div>}
        {!loading && !error && (
          <div className="max-w-full overflow-x-hidden whitespace-pre-wrap break-words border-y border-stone-200 bg-white p-4 font-mono text-sm leading-7 text-stone-800 [overflow-wrap:anywhere]">
            <HighlightedText text={text} terms={highlightTerms} />
          </div>
        )}
      </section>
      <Toast message={statusMessage} />
    </main>
  );
}

function normalizeHighlightTerms(input: string): string[] {
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
