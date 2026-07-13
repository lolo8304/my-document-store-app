import { FocusEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, FileDown, FileText, RefreshCw, SquarePen, X } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  DocumentTag,
  DocumentTagOption,
  clearDocumentMetadata,
  getDocumentText,
  getLatestDocuments,
  getPdfLink,
  getSettings,
  reprocessDocumentOcr,
  searchDocuments,
  SearchType,
  TagMode,
  stopDropboxSync,
  syncDropbox,
  updateDocumentTitle,
  updateDocumentMetadata,
} from '../api';
import { SearchHeader } from '../components/SearchHeader';
import { Toast } from '../components/Toast';
import { HighlightedText } from '../highlight';
import { clearPersistedSearchState, readPersistedSearchState, writePersistedSearchState } from '../searchState';
import { useSyncProgress } from '../useSyncProgress';

const searchPageSize = 10;
const postSyncRefreshDelayMs = 500;

export default function DocumentTextPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const persistedSearch = readPersistedSearchState();
  const [query, setQuery] = useState(persistedSearch?.query ?? '');
  const [type, setType] = useState<SearchType>(persistedSearch?.type ?? 'query');
  const [documentTags, setDocumentTags] = useState<DocumentTagOption[]>([]);
  const [tagFilters, setTagFilters] = useState<DocumentTag[]>(persistedSearch?.tagFilters ?? []);
  const [tagMode, setTagMode] = useState<TagMode>((persistedSearch?.tagFilters?.length ?? 0) > 1 ? persistedSearch?.tagMode ?? 'or' : 'or');
  const [documentTitle, setDocumentTitle] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleSaving, setTitleSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | undefined>();
  const [text, setText] = useState('');
  const [capturedMetadata, setCapturedMetadata] = useState<CapturedMetadata>({});
  const [pdfUrl, setPdfUrl] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [latestLoading, setLatestLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [stopSyncLoading, setStopSyncLoading] = useState(false);
  const [reprocessOcrLoading, setReprocessOcrLoading] = useState(false);
  const [clearMetadataLoading, setClearMetadataLoading] = useState(false);
  const [showAllMetadataFields, setShowAllMetadataFields] = useState(false);
  const [editingMetadataKey, setEditingMetadataKey] = useState<MetadataRowKey | undefined>();
  const [metadataDraft, setMetadataDraft] = useState<CapturedMetadata>({});
  const [metadataSaving, setMetadataSaving] = useState(false);
  const [vectorSearchEnabled, setVectorSearchEnabled] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [statusMessage, setStatusMessage] = useState<string | undefined>();
  const syncProgress = useSyncProgress();
  const highlightTerms = normalizeHighlightTerms(query);
  const refreshAfterSyncRef = useRef(false);
  const sawSyncRunningRef = useRef(false);
  const refreshRequestedAtRef = useRef(0);

  const loadDocument = useCallback(
    async (showLoading = true, cacheBust = false) => {
      if (!id) {
        return;
      }

      if (showLoading) {
        setLoading(true);
      }
      setError(undefined);

      const [textResponse, linkResponse] = await Promise.all([getDocumentText(id, cacheBust), getPdfLink(id, cacheBust)]);
      setDocumentTitle(textResponse.title ?? textResponse.fileName);
      setTitleDraft(textResponse.title ?? textResponse.fileName);
      setText(textResponse.text);
      setCapturedMetadata({
        sender: textResponse.sender,
        recipient: textResponse.recipient,
        sentAt: textResponse.sentAt,
        sentLocation: textResponse.sentLocation,
        subject: textResponse.subject,
        referenceNumber: textResponse.referenceNumber,
        invoiceNumber: textResponse.invoiceNumber,
        customerNumber: textResponse.customerNumber,
        accountNumber: textResponse.accountNumber,
        deadlineAt: textResponse.deadlineAt,
        paymentDueAt: textResponse.paymentDueAt,
      });
      setPdfUrl(linkResponse.pdfUrl);
      if (showLoading) {
        setLoading(false);
      }
    },
    [id],
  );

  const loadSavedDocumentAfterSync = useCallback(async () => {
    await delay(postSyncRefreshDelayMs);
    await loadDocument(false, true);
  }, [loadDocument]);

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
    if (!id) {
      return;
    }

    let active = true;
    loadDocument()
      .then(() => {
        if (!active) {
          return;
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load document');
          setLoading(false);
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
  }, [id, loadDocument]);

  useEffect(() => {
    if (!refreshAfterSyncRef.current) {
      return;
    }

    if (syncProgress.running) {
      sawSyncRunningRef.current = true;
      return;
    }

    const syncStartedAt = syncProgress.startedAt ? Date.parse(syncProgress.startedAt) : 0;
    const terminalStatusMatchesRequest =
      (syncProgress.status === 'completed' || syncProgress.status === 'stopped') &&
      syncStartedAt >= refreshRequestedAtRef.current - 2000;
    const syncFinished = sawSyncRunningRef.current || terminalStatusMatchesRequest;
    if (!syncFinished) {
      return;
    }

    refreshAfterSyncRef.current = false;
    sawSyncRunningRef.current = false;
    loadSavedDocumentAfterSync()
      .then(() => setStatusMessage('Document refreshed after sync.'))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not refresh document after sync'));
  }, [loadSavedDocumentAfterSync, syncProgress.running, syncProgress.startedAt, syncProgress.status]);

  useEffect(() => {
    if (!statusMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setStatusMessage(undefined), 10000);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  async function runSearch() {
    const nextQuery = query.trim();
    const effectiveTagMode = tagFilters.length > 1 ? tagMode : 'or';
    const latestLimit = parseLatestQuery(nextQuery);
    if (latestLimit) {
      await runLatest(latestLimit, tagFilters, effectiveTagMode);
      return;
    }

    if (!nextQuery && tagFilters.length === 0) {
      clearPersistedSearchState();
      navigate('/');
      return;
    }

    setError(undefined);
    try {
      const effectiveType = nextQuery && vectorSearchEnabled ? type : 'query';
      const result = await searchDocuments(nextQuery, effectiveType, 1, searchPageSize, tagFilters, effectiveTagMode);
      writePersistedSearchState({
        query: nextQuery,
        type: effectiveType,
        tagFilters,
        tagMode: effectiveTagMode,
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
      refreshRequestedAtRef.current = Date.now();
      await syncDropbox();
      refreshAfterSyncRef.current = true;
      sawSyncRunningRef.current = false;
      setStatusMessage('Sync started. Check the status icon for progress.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncLoading(false);
    }
  }

  async function runReprocessOcr() {
    if (!id) {
      return;
    }
    setReprocessOcrLoading(true);
    setError(undefined);
    setStatusMessage(undefined);
    try {
      refreshRequestedAtRef.current = Date.now();
      await reprocessDocumentOcr(id);
      refreshAfterSyncRef.current = true;
      sawSyncRunningRef.current = false;
      setStatusMessage('Re-OCR started. Check the status icon for progress.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Re-OCR failed');
    } finally {
      setReprocessOcrLoading(false);
    }
  }

  async function runLatest(limit: 1 | 2 | 10, nextTagFilters = tagFilters, nextTagMode = tagMode) {
    const effectiveTagMode = nextTagFilters.length > 1 ? nextTagMode : 'or';
    setLatestLoading(true);
    setError(undefined);
    setStatusMessage(undefined);
    try {
      const response = await getLatestDocuments(limit, nextTagFilters, effectiveTagMode);
      const latestResult = { ...response, total: response.items.length };
      const nextQuery = limit === 1 ? 'last' : `last ${limit}`;
      writePersistedSearchState({
        query: nextQuery,
        type: 'query',
        tagFilters: nextTagFilters,
        tagMode: effectiveTagMode,
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

  function resetSearch() {
    clearPersistedSearchState();
    setQuery('');
    setType('query');
    setTagFilters([]);
    setTagMode('or');
    setError(undefined);
    setStatusMessage(undefined);
    navigate('/');
  }

  function handleTagFiltersChange(nextTags: DocumentTag[]) {
    const nextTagMode = nextTags.length > 1 ? tagMode : 'or';
    setTagFilters(nextTags);
    setTagMode(nextTagMode);
    const latestLimit = parseLatestQuery(query);
    if (latestLimit) {
      void runLatest(latestLimit, nextTags, nextTagMode);
      return;
    }
    if (query.trim() || nextTags.length > 0) {
      const nextQuery = query.trim();
      const effectiveType = nextQuery && vectorSearchEnabled ? type : 'query';
      searchDocuments(nextQuery, effectiveType, 1, searchPageSize, nextTags, nextTagMode)
        .then((result) => {
          writePersistedSearchState({
            query: nextQuery,
            type: effectiveType,
            tagFilters: nextTags,
            tagMode: nextTagMode,
            page: 1,
            result,
          });
          navigate('/');
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Search failed'));
      return;
    }
    clearPersistedSearchState();
  }

  function handleAll() {
    setTagFilters([]);
    setTagMode('or');
    setQuery('all');
    searchDocuments('all', 'query', 1, searchPageSize, [], 'or')
      .then((result) => {
        writePersistedSearchState({
          query: 'all',
          type: 'query',
          tagFilters: [],
          tagMode: 'or',
          page: 1,
          result,
        });
        navigate('/');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Search failed'));
  }

  function handleTagModeChange(nextTagMode: TagMode) {
    if (tagFilters.length <= 1) {
      return;
    }

    setTagMode(nextTagMode);
    const latestLimit = parseLatestQuery(query);
    if (latestLimit) {
      void runLatest(latestLimit, tagFilters, nextTagMode);
      return;
    }

    const nextQuery = query.trim();
    if (nextQuery || tagFilters.length > 0) {
      const effectiveType = nextQuery && vectorSearchEnabled ? type : 'query';
      searchDocuments(nextQuery, effectiveType, 1, searchPageSize, tagFilters, nextTagMode)
        .then((result) => {
          writePersistedSearchState({
            query: nextQuery,
            type: effectiveType,
            tagFilters,
            tagMode: nextTagMode,
            page: 1,
            result,
          });
          navigate('/');
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Search failed'));
    }
  }

  function startTitleEdit() {
    setTitleDraft(documentTitle);
    setEditingTitle(true);
    setTitleError(undefined);
    setStatusMessage(undefined);
  }

  function cancelTitleEdit() {
    setTitleDraft(documentTitle);
    setEditingTitle(false);
  }

  async function saveTitle() {
    if (!id || titleSaving) {
      return;
    }

    const nextTitle = titleDraft.trim();
    if (!nextTitle) {
      setTitleError('Document title is required');
      return;
    }
    if (nextTitle === documentTitle) {
      setEditingTitle(false);
      return;
    }

    setTitleSaving(true);
    setTitleError(undefined);
    setStatusMessage(undefined);
    try {
      const response = await updateDocumentTitle(id, nextTitle);
      setDocumentTitle(response.title);
      setTitleDraft(response.title);
      setEditingTitle(false);
      updatePersistedDocumentTitle(id, response.title);
      setStatusMessage('Document title updated.');
    } catch (err) {
      setTitleError(err instanceof Error ? err.message : 'Could not update document title');
    } finally {
      setTitleSaving(false);
    }
  }

  async function clearMetadata() {
    if (!id || clearMetadataLoading) {
      return;
    }

    setClearMetadataLoading(true);
    setError(undefined);
    setStatusMessage(undefined);
    try {
      await clearDocumentMetadata(id);
      setCapturedMetadata({});
      setStatusMessage('Metadata cleared.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not clear metadata');
    } finally {
      setClearMetadataLoading(false);
    }
  }

  function startMetadataEdit(key: MetadataRowKey) {
    setEditingMetadataKey(key);
    setMetadataDraft(capturedMetadata);
    setStatusMessage(undefined);
    setError(undefined);
  }

  function cancelMetadataEdit() {
    setEditingMetadataKey(undefined);
    setMetadataDraft({});
  }

  async function saveMetadata() {
    if (!id || !editingMetadataKey || metadataSaving) {
      return;
    }

    const payload = metadataPayload(editingMetadataKey, metadataDraft);
    setMetadataSaving(true);
    setError(undefined);
    setStatusMessage(undefined);
    try {
      await updateDocumentMetadata(id, payload);
      setCapturedMetadata((current) => ({ ...current, ...payloadToCapturedMetadata(payload) }));
      setEditingMetadataKey(undefined);
      setMetadataDraft({});
      setStatusMessage('Metadata updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update metadata');
    } finally {
      setMetadataSaving(false);
    }
  }

  function handleMetadataEditorBlur(event: FocusEvent<HTMLFormElement>) {
    const nextFocusedElement = event.relatedTarget;
    if (nextFocusedElement instanceof Node && event.currentTarget.contains(nextFocusedElement)) {
      return;
    }
    void saveMetadata();
  }

  const allMetadataRows = metadataRows(capturedMetadata);
  const visibleMetadataRows = showAllMetadataFields ? allMetadataRows : allMetadataRows.filter((row) => hasMetadataValue(row.value));

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
        sortBy="scanned"
        missingSent={false}
        vectorSearchEnabled={vectorSearchEnabled}
        onQueryChange={setQuery}
        onTypeChange={setType}
        onTagFiltersChange={handleTagFiltersChange}
        onTagModeChange={handleTagModeChange}
        onAll={handleAll}
        onSubmit={() => void runSearch()}
        onLatest={(limit) => void runLatest(limit)}
        onReset={resetSearch}
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
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-stone-100"
              title="Re-OCR document"
              aria-label="Re-OCR document"
              disabled={syncProgress.running || reprocessOcrLoading}
              onClick={() => void runReprocessOcr()}
            >
              <RefreshCw className={`h-4 w-4 ${reprocessOcrLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
            {pdfUrl && (
              <a
                className="flex h-8 w-8 items-center justify-center rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-900"
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
        {!loading && !error && (
          <div className="mb-4">
            <div className="flex items-start gap-2">
              {editingTitle ? (
                <form
                  className="flex min-w-0 flex-1 items-start gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveTitle();
                  }}
                >
                  <input
                    className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-3 py-2 text-2xl font-semibold text-stone-950 outline-none focus:border-stone-500 disabled:bg-stone-100"
                    value={titleDraft}
                    disabled={titleSaving}
                    autoFocus
                    aria-label="Document title"
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={() => void saveTitle()}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelTitleEdit();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
                    title="Cancel edit"
                    aria-label="Cancel title edit"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      cancelTitleEdit();
                    }}
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                </form>
              ) : (
                <>
                  <button
                    type="button"
                    className="min-w-0 flex-1 break-words text-left text-2xl font-semibold leading-tight text-stone-950 hover:text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
                    title="Edit title"
                    aria-label="Edit title"
                    onClick={startTitleEdit}
                    onFocus={startTitleEdit}
                  >
                    {documentTitle}
                  </button>
                  <button
                    type="button"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
                    title="Edit title"
                    aria-label="Edit title"
                    onClick={startTitleEdit}
                  >
                    <SquarePen className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
            {titleError && <div className="mt-2 rounded border border-red-200 bg-red-50 p-3 text-base text-red-800">{titleError}</div>}
          </div>
        )}
        {loading && <div className="text-lg text-stone-600">Loading document text</div>}
        {error && <div className="rounded border border-red-200 bg-red-50 p-4 text-lg text-red-800">{error}</div>}
        {!loading && !error && allMetadataRows.length > 0 && (
          <section className="mb-4 border-y border-stone-200 bg-stone-50 p-4">
            <div className="mb-3 flex justify-end gap-2">
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-600 hover:bg-white hover:text-stone-950"
                title={showAllMetadataFields ? 'Show filled metadata only' : 'Show all metadata fields'}
                aria-label={showAllMetadataFields ? 'Show filled metadata only' : 'Show all metadata fields'}
                onClick={() => {
                  setShowAllMetadataFields((current) => !current);
                  cancelMetadataEdit();
                }}
              >
                {showAllMetadataFields ? <Eye className="h-4 w-4" aria-hidden="true" /> : <SquarePen className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-600 hover:bg-white hover:text-stone-950 disabled:cursor-not-allowed disabled:text-stone-300"
                title="Clear metadata"
                aria-label="Clear metadata"
                disabled={clearMetadataLoading}
                onClick={() => void clearMetadata()}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {visibleMetadataRows.map(({ key, label, value }) => (
                <div key={key} className="min-w-0">
                  <dt className="text-xs font-semibold uppercase text-stone-500">{label}</dt>
                  <dd className={`mt-1 break-words text-sm text-stone-900 ${key === 'sender' || key === 'recipient' ? 'whitespace-pre-wrap' : ''}`}>
                    {editingMetadataKey === key ? (
                      <form
                        className="flex min-w-0 items-start gap-2"
                        onBlur={handleMetadataEditorBlur}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveMetadata();
                        }}
                      >
                        <MetadataEditor
                          rowKey={key}
                          value={metadataDraft}
                          disabled={metadataSaving}
                          onChange={setMetadataDraft}
                          onCancel={cancelMetadataEdit}
                          onSave={() => void saveMetadata()}
                        />
                        <button
                          type="button"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
                          title="Cancel metadata edit"
                          aria-label="Cancel metadata edit"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            cancelMetadataEdit();
                          }}
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        className="min-h-6 w-full rounded px-1 text-left hover:bg-white focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2"
                        title={`Edit ${label}`}
                        aria-label={`Edit ${label}`}
                        onClick={() => startMetadataEdit(key)}
                      >
                        {value || '-'}
                      </button>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
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

function updatePersistedDocumentTitle(documentId: string, title: string) {
  const state = readPersistedSearchState();
  if (!state) {
    return;
  }

  writePersistedSearchState({
    ...state,
    result: {
      ...state.result,
      items: state.result.items.map((item) => (item.documentId === documentId ? { ...item, title } : item)),
    },
  });
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

interface CapturedMetadata {
  sender?: string;
  recipient?: string;
  sentAt?: string;
  sentLocation?: string;
  subject?: string;
  referenceNumber?: string;
  invoiceNumber?: string;
  customerNumber?: string;
  accountNumber?: string;
  deadlineAt?: string;
  paymentDueAt?: string;
}

type MetadataRowKey =
  | 'sender'
  | 'recipient'
  | 'sent'
  | 'subject'
  | 'referenceNumber'
  | 'invoiceNumber'
  | 'customerNumber'
  | 'accountNumber'
  | 'deadlineAt'
  | 'paymentDueAt';

function metadataRows(metadata: CapturedMetadata): Array<{ key: MetadataRowKey; label: string; value: string }> {
  const rows: Array<{ key: MetadataRowKey; label: string; value?: string }> = [
    { key: 'sender', label: 'Sender', value: metadata.sender },
    { key: 'recipient', label: 'Recipient', value: metadata.recipient },
    { key: 'sent', label: 'Sent', value: formatSentLocationDate(metadata.sentLocation, metadata.sentAt) },
    { key: 'subject', label: 'Subject', value: metadata.subject },
    { key: 'referenceNumber', label: 'Reference number', value: metadata.referenceNumber },
    { key: 'invoiceNumber', label: 'Invoice number', value: metadata.invoiceNumber },
    { key: 'customerNumber', label: 'Customer number', value: metadata.customerNumber },
    { key: 'accountNumber', label: 'Account number', value: metadata.accountNumber },
    { key: 'deadlineAt', label: 'Deadline', value: metadata.deadlineAt },
    { key: 'paymentDueAt', label: 'Payment due', value: metadata.paymentDueAt },
  ];

  return rows.map((row) => ({ ...row, value: row.value ?? '' }));
}

function hasMetadataValue(value: string): boolean {
  return value.trim().length > 0;
}

function MetadataEditor({
  rowKey,
  value,
  disabled,
  onChange,
  onCancel,
  onSave,
}: {
  rowKey: MetadataRowKey;
  value: CapturedMetadata;
  disabled: boolean;
  onChange: (next: CapturedMetadata) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const commonClass = 'min-w-0 flex-1 rounded border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900 outline-none focus:border-stone-600 disabled:bg-stone-100';
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
    if (event.key === 'Enter' && !(event.currentTarget instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      onSave();
    }
  };

  if (rowKey === 'sent') {
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
        <input
          className={commonClass}
          value={value.sentLocation ?? ''}
          disabled={disabled}
          autoFocus
          aria-label="Sent location"
          placeholder="Location"
          onChange={(event) => onChange({ ...value, sentLocation: event.target.value })}
          onKeyDown={handleKeyDown}
        />
        <input
          className={commonClass}
          type="date"
          value={value.sentAt ?? ''}
          disabled={disabled}
          aria-label="Sent date"
          onChange={(event) => onChange({ ...value, sentAt: event.target.value })}
          onKeyDown={handleKeyDown}
        />
      </div>
    );
  }

  if (rowKey === 'deadlineAt' || rowKey === 'paymentDueAt') {
    return (
      <input
        className={commonClass}
        type="date"
        value={value[rowKey] ?? ''}
        disabled={disabled}
        autoFocus
        aria-label={rowKey}
        onChange={(event) => onChange({ ...value, [rowKey]: event.target.value })}
        onKeyDown={handleKeyDown}
      />
    );
  }

  if (rowKey === 'sender' || rowKey === 'recipient') {
    return (
      <textarea
        className={`${commonClass} min-h-24`}
        value={value[rowKey] ?? ''}
        disabled={disabled}
        autoFocus
        aria-label={rowKey}
        onChange={(event) => onChange({ ...value, [rowKey]: event.target.value })}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <input
      className={commonClass}
      value={value[rowKey] ?? ''}
      disabled={disabled}
      autoFocus
      aria-label={rowKey}
      onChange={(event) => onChange({ ...value, [rowKey]: event.target.value })}
      onKeyDown={handleKeyDown}
    />
  );
}

function metadataPayload(key: MetadataRowKey, metadata: CapturedMetadata): Partial<Record<keyof CapturedMetadata, string | null>> {
  if (key === 'sent') {
    return {
      sentLocation: emptyToNull(metadata.sentLocation),
      sentAt: emptyToNull(metadata.sentAt),
    };
  }
  return { [key]: emptyToNull(metadata[key]) };
}

function payloadToCapturedMetadata(payload: Partial<Record<keyof CapturedMetadata, string | null>>): CapturedMetadata {
  return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, value ?? undefined])) as CapturedMetadata;
}

function emptyToNull(value?: string): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed ? trimmed : null;
}

function formatSentLocationDate(location?: string, sentAt?: string) {
  const formattedDate = formatSentDate(sentAt);
  if (location && formattedDate) {
    return `${location}, ${formattedDate}`;
  }
  return formattedDate || location || '';
}

function formatSentDate(value?: string) {
  if (!value) {
    return '';
  }
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
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
