import { FormEvent, useEffect, useRef, useState } from 'react';
import { Brain, Cog, FileText, PlusCircle, RefreshCw, Search, Square, X } from 'lucide-react';
import { ArrowLongDownIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';
import { DocumentSortBy, DocumentTag, DocumentTagOption, SearchType, TagMode } from '../api';
import { DynamicHeroIcon, hasHeroIconInput, resolveHeroIconName } from '../dynamic-icons';

const noTagsFilterTag = 'no-symbol';

interface SearchHeaderProps {
  query: string;
  type: SearchType;
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
  documentTags: DocumentTagOption[];
  tagFilters: DocumentTag[];
  tagMode: TagMode;
  sortBy: DocumentSortBy;
  missingSent: boolean;
  showDocumentTagControls?: boolean;
  vectorSearchEnabled: boolean;
  onQueryChange: (query: string) => void;
  onTypeChange: (type: SearchType) => void;
  onTagFiltersChange: (tags: DocumentTag[]) => void;
  onTagModeChange: (tagMode: TagMode) => void;
  onSortChange?: (sortBy: DocumentSortBy) => void;
  onMissingSentChange?: (missingSent: boolean) => void;
  onToggleDocumentTagControls?: () => void;
  onAll: () => void;
  onSubmit: () => void;
  onLatest: (limit: 1 | 2 | 10) => void;
  onReset: () => void;
  onSync: () => void;
  onStopSync: () => void;
}

export function SearchHeader({
  query,
  type,
  latestLoading,
  syncLoading,
  stopSyncLoading,
  syncProgress,
  documentTags,
  tagFilters,
  tagMode,
  sortBy,
  missingSent,
  showDocumentTagControls,
  vectorSearchEnabled,
  onQueryChange,
  onTypeChange,
  onTagFiltersChange,
  onTagModeChange,
  onSortChange,
  onMissingSentChange,
  onToggleDocumentTagControls,
  onAll,
  onSubmit,
  onLatest,
  onReset,
  onSync,
  onStopSync,
}: SearchHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [elapsedBaseline, setElapsedBaseline] = useState({
    fileName: undefined as string | undefined,
    seconds: undefined as number | undefined,
    receivedAt: Date.now(),
  });
  const [now, setNow] = useState(Date.now());
  const [hideCompletedStatus, setHideCompletedStatus] = useState(false);

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

  useEffect(() => {
    if (syncProgress?.status !== 'completed') {
      setHideCompletedStatus(false);
      return;
    }

    setHideCompletedStatus(false);
    const timeout = window.setTimeout(() => setHideCompletedStatus(true), 10000);
    return () => window.clearTimeout(timeout);
  }, [syncProgress?.status]);

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

  function handleReset() {
    onReset();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function toggleTagFilter(tag: DocumentTag) {
    const nextTags = tagFilters.includes(tag)
      ? tagFilters.filter((item) => item !== tag)
      : tag === noTagsFilterTag
        ? [tag]
        : [...tagFilters.filter((item) => item !== noTagsFilterTag), tag];
    onTagFiltersChange(nextTags);
  }

  return (
    <section className="border-b border-stone-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pb-4 pt-0">
        <div>
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={handleReset}
              className="min-w-0 text-left text-3xl font-semibold tracking-normal hover:text-stone-700 sm:text-5xl"
            >
              Hänggi documents
            </button>
            <div className="flex shrink-0 items-center gap-2">
              {onToggleDocumentTagControls && (
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 hover:text-stone-950"
                  title={showDocumentTagControls ? 'Hide document tag buttons' : 'Show document tag buttons'}
                  aria-label={showDocumentTagControls ? 'Hide document tag buttons' : 'Show document tag buttons'}
                  aria-pressed={showDocumentTagControls}
                  onClick={onToggleDocumentTagControls}
                >
                  <DynamicHeroIcon className="h-5 w-5" name={showDocumentTagControls ? 'EyeSlashIcon' : 'EyeIcon'} aria-hidden="true" />
                </button>
              )}
              <Link
                className="flex h-10 w-10 items-center justify-center rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 hover:text-stone-950"
                to="/settings"
                title="Settings"
                aria-label="Settings"
              >
                <Cog className="h-5 w-5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded border border-stone-300 bg-white px-2 shadow-sm focus-within:border-stone-900 sm:px-3">
              <Search className="h-5 w-5 shrink-0 text-stone-500 sm:h-6 sm:w-6" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                className="h-10 min-w-0 flex-1 bg-transparent text-lg outline-none sm:text-xl"
                placeholder="Search documents"
                autoFocus
              />
              {query && (
                <button
                  type="button"
                  title="Clear search"
                  aria-label="Clear search"
                  onClick={() => {
                    onQueryChange('');
                    window.requestAnimationFrame(() => inputRef.current?.focus());
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </div>

            {vectorSearchEnabled && (
              <div className="grid h-12 grid-cols-2 rounded border border-stone-300 bg-white p-1 shadow-sm sm:justify-self-end">
                <button
                  type="button"
                  title="Keyword search"
                  aria-label="Keyword search"
                  onClick={() => onTypeChange('query')}
                  className={`flex h-10 w-12 items-center justify-center rounded-sm ${
                    type === 'query' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Question search"
                  aria-label="Question search"
                  onClick={() => onTypeChange('question')}
                  className={`flex h-10 w-12 items-center justify-center rounded-sm ${
                    type === 'question' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
                  }`}
                >
                  <Brain className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            )}

            <button
              type="button"
              title="Sync Dropbox"
              aria-label="Sync Dropbox"
              onClick={onSync}
              disabled={syncLoading || syncProgress?.running}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300 sm:justify-self-end"
            >
              <RefreshCw className={`h-5 w-5 ${syncLoading || syncProgress?.running ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>

          <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-1 text-base text-stone-600">
            <div className="contents" aria-label="Tag filters">
              {documentTags.map((tag) => {
                const active = tagFilters.includes(tag.value);
                return (
                  <button
                    key={tag.value}
                    type="button"
                    title={tag.name}
                    aria-label={`Filter ${tag.name}`}
                    aria-pressed={active}
                    onClick={() => toggleTagFilter(tag.value)}
                    className={`flex h-8 min-w-8 items-center justify-center rounded border px-1 text-sm font-semibold ${
                      active ? 'border-stone-950 bg-stone-950 text-white' : 'border-stone-950 bg-white text-stone-950 hover:bg-stone-100'
                    }`}
                  >
                    <TagLabel tag={tag} />
                  </button>
                );
              })}
              {tagFilters.length > 1 && (
                <button
                  type="button"
                  title={tagMode === 'and' ? 'Match any selected tag' : 'Match all selected tags'}
                  aria-label={tagMode === 'and' ? 'Use OR tag search' : 'Use AND tag search'}
                  aria-pressed={tagMode === 'and'}
                  onClick={() => onTagModeChange(tagMode === 'and' ? 'or' : 'and')}
                  className={`flex h-8 w-8 items-center justify-center rounded border ${
                    tagMode === 'and' ? 'border-stone-950 bg-stone-950 text-white' : 'border-stone-950 bg-white text-stone-950 hover:bg-stone-100'
                  }`}
                >
                  <PlusCircle className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
            {!syncProgress?.running && (
              <>
                <button
                  type="button"
                  onClick={onAll}
                  disabled={latestLoading}
                  className="h-8 rounded border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:text-stone-300"
                >
                  all
                </button>
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
              </>
            )}
            {!syncProgress?.running && onSortChange && onMissingSentChange && (
              <div className="ml-1 contents">
                <button
                  type="button"
                  title={sortBy === 'sent' ? 'Switch to scanned date descending' : 'Switch to sent date descending'}
                  aria-label={sortBy === 'sent' ? 'Switch to scanned date descending' : 'Switch to sent date descending'}
                  aria-pressed="true"
                  onClick={() => onSortChange(sortBy === 'sent' ? 'scanned' : 'sent')}
                  disabled={latestLoading}
                  className="ml-1 flex h-8 items-center gap-1 rounded border border-stone-400 bg-stone-300 px-2 text-sm font-medium text-stone-900 hover:bg-stone-400 disabled:cursor-not-allowed disabled:bg-white disabled:text-stone-300"
                >
                  <span>{sortBy === 'sent' ? 'sent' : 'scan'}</span>
                  <ArrowLongDownIcon className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title="Show documents without a sent date"
                  aria-label="Show documents without a sent date"
                  aria-pressed={missingSent}
                  onClick={() => onMissingSentChange(!missingSent)}
                  disabled={latestLoading}
                  className={`h-8 rounded border px-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-stone-300 ${
                    missingSent
                      ? 'border-stone-950 bg-stone-950 text-white'
                      : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  !sent
                </button>
              </div>
            )}
            <span className="h-8 rounded border border-transparent px-2 text-sm leading-8">
              {syncStatusText(syncProgress, syncLoading, hideCompletedStatus)}
            </span>
            {syncProgress?.running && syncProgress.total > 0 && (
              <span className="h-8 rounded border border-transparent px-2 text-sm leading-8 tabular-nums">
                {syncProgress.current} / {syncProgress.total}
              </span>
            )}
            {syncProgress?.running && syncProgress.phase && syncProgress.phase !== 'idle' && (
              <span className="h-8 rounded border border-transparent px-2 text-sm leading-8">{phaseLabel(syncProgress.phase)}</span>
            )}
            {syncProgress?.running && syncProgress.fileName && (
              <span className="h-8 min-w-0 max-w-full truncate rounded border border-transparent px-2 text-sm leading-8 text-stone-500 sm:max-w-md" title={syncProgress.fileName}>
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

function TagLabel({ tag }: { tag: DocumentTagOption }) {
  const iconName = resolveHeroIconName(tag.icon);
  if (iconName || hasHeroIconInput(tag.icon)) {
    return <DynamicHeroIcon className="h-6 w-6" name={iconName ?? 'QuestionMarkCircleIcon'} aria-hidden="true" />;
  }
  return tag.label;
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

function syncStatusText(syncProgress: SearchHeaderProps['syncProgress'], syncLoading: boolean, hideCompletedStatus: boolean) {
  if (syncLoading) {
    return 'Sync starting';
  }

  if (!syncProgress || syncProgress.status === 'idle' || (syncProgress.status === 'completed' && hideCompletedStatus)) {
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
