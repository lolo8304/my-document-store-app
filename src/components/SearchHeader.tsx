import { FormEvent, useEffect, useState } from 'react';
import { Brain, FileText, RefreshCw, Search, Square, X } from 'lucide-react';
import { SearchType } from '../api';

interface SearchHeaderProps {
  query: string;
  type: SearchType;
  loading: boolean;
  latestLoading: boolean;
  syncLoading: boolean;
  stopSyncLoading: boolean;
  syncProgress?: {
    current: number;
    total: number;
    running: boolean;
    status: string;
    phase?: string;
    fileName?: string;
    fileElapsedSeconds?: number;
  };
  vectorSearchEnabled: boolean;
  onQueryChange: (query: string) => void;
  onTypeChange: (type: SearchType) => void;
  onSubmit: () => void;
  onLatest: (limit: 1 | 2 | 10) => void;
  onSync: () => void;
  onStopSync: () => void;
}

export function SearchHeader({
  query,
  type,
  loading,
  latestLoading,
  syncLoading,
  stopSyncLoading,
  syncProgress,
  vectorSearchEnabled,
  onQueryChange,
  onTypeChange,
  onSubmit,
  onLatest,
  onSync,
  onStopSync,
}: SearchHeaderProps) {
  const [elapsedBaseline, setElapsedBaseline] = useState({
    fileName: undefined as string | undefined,
    seconds: undefined as number | undefined,
    receivedAt: Date.now(),
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setElapsedBaseline({
      fileName: syncProgress?.fileName,
      seconds: syncProgress?.fileElapsedSeconds,
      receivedAt: Date.now(),
    });
    setNow(Date.now());
  }, [syncProgress?.fileName, syncProgress?.fileElapsedSeconds]);

  useEffect(() => {
    if (!syncProgress?.running || syncProgress.fileElapsedSeconds === undefined) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [syncProgress?.running, syncProgress?.fileElapsedSeconds]);

  const displayedFileElapsedSeconds =
    syncProgress?.running &&
    syncProgress.fileName &&
    elapsedBaseline.fileName === syncProgress.fileName &&
    elapsedBaseline.seconds !== undefined
      ? elapsedBaseline.seconds + Math.floor((now - elapsedBaseline.receivedAt) / 1000)
      : syncProgress?.fileElapsedSeconds;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <section className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8">
        <div>
          <h1 className="text-5xl font-semibold tracking-normal">my-document-store</h1>
          <p className="mt-3 text-xl text-stone-600">Search scanned documents from Dropbox.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex h-16 min-w-0 flex-1 items-center gap-4 rounded border border-stone-300 bg-white px-4 shadow-sm focus-within:border-stone-900">
              <Search className="h-7 w-7 shrink-0 text-stone-500" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                className="h-14 min-w-0 flex-1 bg-transparent text-2xl outline-none"
                placeholder="Search documents"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  title="Clear search"
                  aria-label="Clear search"
                  onClick={() => onQueryChange('')}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                >
                  <X className="h-6 w-6" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="ml-auto flex shrink-0 items-center justify-end gap-3">
              {vectorSearchEnabled && (
                <div className="grid h-16 grid-cols-2 rounded border border-stone-300 bg-white p-1 shadow-sm">
                  <button
                    type="button"
                    title="Keyword search"
                    aria-label="Keyword search"
                    onClick={() => onTypeChange('query')}
                    className={`flex h-14 w-16 items-center justify-center rounded-sm ${
                      type === 'query' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <FileText className="h-7 w-7" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="Question search"
                    aria-label="Question search"
                    onClick={() => onTypeChange('question')}
                    className={`flex h-14 w-16 items-center justify-center rounded-sm ${
                      type === 'question' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    <Brain className="h-7 w-7" aria-hidden="true" />
                  </button>
                </div>
              )}

              <button
                type="submit"
                className="h-16 rounded bg-stone-900 px-8 text-xl font-medium text-white hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400 sm:min-w-36"
                disabled={loading}
              >
                {loading ? 'Searching' : 'Search'}
              </button>

              <button
                type="button"
                title="Sync Dropbox"
                aria-label="Sync Dropbox"
                onClick={onSync}
                disabled={syncLoading || syncProgress?.running}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
              >
                <RefreshCw className={`h-7 w-7 ${syncLoading || syncProgress?.running ? 'animate-spin' : ''}`} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-base text-stone-600">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onLatest(1)}
                disabled={latestLoading}
                className="h-8 rounded border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
              >
                last
              </button>
              <button
                type="button"
                onClick={() => onLatest(2)}
                disabled={latestLoading}
                className="h-8 rounded border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
              >
                2
              </button>
              <button
                type="button"
                onClick={() => onLatest(10)}
                disabled={latestLoading}
                className="h-8 rounded border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
              >
                10
              </button>
            </div>
            <span>{syncStatusText(syncProgress, syncLoading)}</span>
            {syncProgress?.running && syncProgress.total > 0 && (
              <span className="tabular-nums">
                {syncProgress.current} / {syncProgress.total}
              </span>
            )}
            {syncProgress?.running && syncProgress.phase && syncProgress.phase !== 'idle' && (
              <span>{phaseLabel(syncProgress.phase)}</span>
            )}
            {syncProgress?.running && syncProgress.fileName && (
              <span className="min-w-0 max-w-full truncate text-stone-500 sm:max-w-md" title={syncProgress.fileName}>
                {syncProgress.fileName}
                {displayedFileElapsedSeconds !== undefined && ` - ${displayedFileElapsedSeconds}s`}
              </span>
            )}
            {syncProgress?.running && (
              <button
                type="button"
                title={syncProgress.status === 'stopping' ? 'Stop requested' : 'Stop sync'}
                aria-label={syncProgress.status === 'stopping' ? 'Stop requested' : 'Stop sync'}
                onClick={onStopSync}
                disabled={stopSyncLoading || syncProgress.status === 'stopping'}
                className="flex h-8 w-8 items-center justify-center rounded text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-stone-300 disabled:hover:bg-transparent"
              >
                <Square className="h-4 w-4 fill-current" aria-hidden="true" />
              </button>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

function phaseLabel(phase: string) {
  const labels: Record<string, string> = {
    listing: 'Listing',
    checking: 'Checking',
    downloading: 'Download',
    extracting: 'OCR',
    spellchecking: 'Spellcheck',
    embedding: 'Embedding',
    storing: 'Storing',
    deleting: 'Cleanup',
  };
  return labels[phase] ?? phase;
}

function syncStatusText(syncProgress: SearchHeaderProps['syncProgress'], syncLoading: boolean) {
  if (syncLoading) {
    return 'Sync starting';
  }

  if (!syncProgress || syncProgress.status === 'idle') {
    return 'Sync idle';
  }

  const labels: Record<string, string> = {
    running: 'Sync running',
    stopping: 'Sync stopping',
    completed: 'Sync completed',
    failed: 'Sync failed',
    stopped: 'Sync stopped',
  };
  return labels[syncProgress.status] ?? 'Sync idle';
}
