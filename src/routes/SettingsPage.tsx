import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  createDocumentTagDefinition,
  deleteDocumentTagDefinition,
  DocumentTagDefinition,
  SearchResultItem,
  getDocumentTagDefinitions,
  reorderDocumentTagDefinitions,
  searchDocuments,
  updateDocumentTagDefinition,
  updateDocumentTags,
} from '../api';
import { DynamicHeroIcon, hasHeroIconInput, resolveHeroIconName } from '../dynamic-icons';

interface TagRow {
  id: string;
  short: string;
  text: string;
  icon: string;
  originalShort: string;
  originalText: string;
  originalIcon: string;
  persisted: boolean;
}

export default function SettingsPage() {
  const [rows, setRows] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [draggingId, setDraggingId] = useState<string | undefined>();
  const [dragSnapshot, setDragSnapshot] = useState<TagRow[] | undefined>();
  const rowsRef = useRef(rows);
  const draggingIdRef = useRef<string | undefined>(undefined);
  const dragSnapshotRef = useRef<TagRow[] | undefined>(undefined);
  const dragCanceledRef = useRef(false);

  useEffect(() => {
    let active = true;
    getDocumentTagDefinitions()
      .then((tags) => {
        if (active) {
          setRows(withEmptyRows(tags.map(toRow)));
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load tags');
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
  }, []);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    if (!draggingId || !dragSnapshot) {
      return;
    }

    const snapshot = dragSnapshot;
    function cancelDrag(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      dragCanceledRef.current = true;
      setRows(snapshot);
      rowsRef.current = snapshot;
      draggingIdRef.current = undefined;
      dragSnapshotRef.current = undefined;
      setDraggingId(undefined);
      setDragSnapshot(undefined);
    }

    window.addEventListener('keydown', cancelDrag);
    return () => window.removeEventListener('keydown', cancelDrag);
  }, [dragSnapshot, draggingId]);

  function updateDraft(id: string, field: 'short' | 'text' | 'icon', value: string) {
    setRows((current) => withEmptyRows(current.map((row) => (row.id === id ? { ...row, [field]: value } : row))));
  }

  async function saveRow(row: TagRow) {
    const nextShort = row.short.trim();
    const nextText = row.text.trim();
    const nextIcon = resolveHeroIconName(row.icon) ?? row.icon.trim();
    if (!nextShort || !nextText) {
      return;
    }
    if (row.persisted && row.originalShort === nextShort && row.originalText === nextText && row.originalIcon === nextIcon) {
      return;
    }

    setError(undefined);
    try {
      const documentsToMigrate = row.persisted && row.originalText !== nextText ? await findDocumentTagMigrationTargets(row.originalText) : [];
      const saved = row.persisted
        ? await updateDocumentTagDefinition(row.id, nextShort, nextText, nextIcon)
        : await createDocumentTagDefinition(nextShort, nextText, nextIcon);
      if (row.persisted && row.originalText !== nextText) {
        await migrateDocumentTag(documentsToMigrate, row.originalText, nextText);
      }
      setRows((current) => withEmptyRows(current.map((item) => (item.id === row.id ? toRow(saved) : item))));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save tag');
    }
  }

  async function deleteRow(row: TagRow) {
    if (!window.confirm(`Delete tag "${row.short}"? Existing document tags stay stored but will be hidden.`)) {
      return;
    }

    setError(undefined);
    try {
      await deleteDocumentTagDefinition(row.id);
      setRows((current) => withEmptyRows(current.filter((item) => item.id !== row.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete tag');
    }
  }

  function startDrag(row: TagRow) {
    if (!row.persisted) {
      return;
    }
    setDraggingId(row.id);
    draggingIdRef.current = row.id;
    dragSnapshotRef.current = rowsRef.current;
    dragCanceledRef.current = false;
    setDragSnapshot(rowsRef.current);
  }

  function dragOver(targetId: string) {
    const activeDraggingId = draggingIdRef.current;
    if (!activeDraggingId || activeDraggingId === targetId) {
      return;
    }
    const nextRows = movePersistedRow(rowsRef.current, activeDraggingId, targetId);
    rowsRef.current = nextRows;
    setRows(nextRows);
  }

  async function finishDrag() {
    const activeDraggingId = draggingIdRef.current;
    if (!activeDraggingId) {
      return;
    }

    const canceled = dragCanceledRef.current;
    const snapshot = dragSnapshotRef.current;
    draggingIdRef.current = undefined;
    dragSnapshotRef.current = undefined;
    dragCanceledRef.current = false;
    setDraggingId(undefined);
    setDragSnapshot(undefined);
    if (canceled) {
      return;
    }

    const persistedIds = rowsRef.current.filter((row) => row.persisted).map((row) => row.id);
    const snapshotIds = snapshot?.filter((row) => row.persisted).map((row) => row.id);
    if (snapshotIds && persistedIds.join(',') === snapshotIds.join(',')) {
      return;
    }

    setError(undefined);
    try {
      const saved = await reorderDocumentTagDefinitions(persistedIds);
      setRows(withEmptyRows(saved.map(toRow)));
    } catch (err) {
      if (snapshot) {
        setRows(snapshot);
      }
      setError(err instanceof Error ? err.message : 'Could not reorder tags');
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-stone-950">
      <section className="mx-auto w-full max-w-5xl p-4">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            className="flex h-8 w-8 items-center justify-center rounded border border-stone-300 bg-stone-100 text-stone-700 hover:bg-white hover:text-stone-950"
            to="/"
            title="Back"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <h1 className="min-w-0 flex-1 text-3xl font-semibold">Settings</h1>
        </div>

        {loading && <div className="text-lg text-stone-600">Loading settings</div>}
        {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-lg text-red-800">{error}</div>}

        {!loading && (
          <div className="border-y border-stone-200 bg-white">
            <div className="grid grid-cols-[2.5rem_3.5rem_minmax(0,1fr)_2.5rem] items-start gap-2 border-b border-stone-200 bg-stone-50 p-3 text-sm font-semibold text-stone-600">
              <span />
              <span>short</span>
              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <span>text</span>
                <a className="text-stone-700 underline hover:text-stone-950" href="https://heroicons.com/" target="_blank" rel="noreferrer">
                  icon
                </a>
              </div>
              <span />
            </div>
            {rows.map((row) => (
              <div
                key={row.id}
                className={`grid grid-cols-[2.5rem_3.5rem_minmax(0,1fr)_2.5rem] items-start gap-2 border-b border-stone-200 p-3 last:border-b-0 ${
                  draggingId === row.id ? 'bg-stone-200' : ''
                }`}
                onDragOver={(event) => {
                  if (!row.persisted) {
                    return;
                  }
                  event.preventDefault();
                  dragOver(row.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  void finishDrag();
                }}
              >
                {row.persisted ? (
                  <button
                    type="button"
                    className="flex h-10 w-10 cursor-grab items-center justify-center rounded text-stone-500 hover:bg-stone-100 hover:text-stone-950 active:cursor-grabbing"
                    title="Move tag"
                    aria-label={`Move ${row.short}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', row.id);
                      startDrag(row);
                    }}
                    onDragEnd={() => void finishDrag()}
                  >
                    <DynamicHeroIcon className="h-5 w-5" name="Bars3BottomRightIcon" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="h-10 w-10" />
                )}
                <input
                  className="h-10 rounded border border-stone-300 bg-white px-3 text-base outline-none focus:border-stone-500"
                  value={row.short}
                  maxLength={3}
                  aria-label="Tag short"
                  onChange={(event) => updateDraft(row.id, 'short', event.target.value)}
                  onBlur={() => void saveRow(row)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur();
                    }
                  }}
                />
                <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                  <input
                    className="h-10 min-w-0 rounded border border-stone-300 bg-white px-3 text-base outline-none focus:border-stone-500"
                    value={row.text}
                    aria-label="Tag text"
                    onChange={(event) => updateDraft(row.id, 'text', event.target.value)}
                    onBlur={() => void saveRow(row)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      className="h-10 min-w-0 flex-1 rounded border border-stone-300 bg-white px-3 text-base outline-none focus:border-stone-500"
                      value={row.icon}
                      aria-label="Tag icon"
                      placeholder="icon"
                      onChange={(event) => updateDraft(row.id, 'icon', event.target.value)}
                      onBlur={() => void saveRow(row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.currentTarget.blur();
                        }
                      }}
                    />
                    <IconPreview value={row.icon} />
                  </div>
                </div>
                {row.persisted ? (
                  <button
                    type="button"
                    className="ml-auto flex h-9 w-9 items-center justify-center rounded text-stone-500 hover:bg-red-50 hover:text-red-800"
                    title="Delete tag"
                    aria-label={`Delete ${row.short}`}
                    onClick={() => void deleteRow(row)}
                  >
                    <X className="h-5 w-5" aria-hidden="true" />
                  </button>
                ) : (
                  <span className="h-9 w-9" />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function toRow(tag: DocumentTagDefinition): TagRow {
  return {
    id: tag.id,
    short: tag.short,
    text: tag.text,
    icon: tag.icon ?? '',
    originalShort: tag.short,
    originalText: tag.text,
    originalIcon: tag.icon ?? '',
    persisted: true,
  };
}

function withEmptyRows(rows: TagRow[]): TagRow[] {
  const emptyCount = rows.filter((row) => !row.persisted && !row.short && !row.text && !row.icon).length;
  const additions = Array.from({ length: Math.max(0, 1 - emptyCount) }, () => emptyRow());
  return [...rows, ...additions];
}

function emptyRow(): TagRow {
  return {
    id: `new-${createDraftId()}`,
    short: '',
    text: '',
    icon: '',
    originalShort: '',
    originalText: '',
    originalIcon: '',
    persisted: false,
  };
}

function createDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function movePersistedRow(rows: TagRow[], movingId: string, targetId: string) {
  const persistedRows = rows.filter((row) => row.persisted);
  const draftRows = rows.filter((row) => !row.persisted);
  const movingIndex = persistedRows.findIndex((row) => row.id === movingId);
  const targetIndex = persistedRows.findIndex((row) => row.id === targetId);
  if (movingIndex < 0 || targetIndex < 0) {
    return rows;
  }

  const nextPersistedRows = [...persistedRows];
  const [movingRow] = nextPersistedRows.splice(movingIndex, 1);
  nextPersistedRows.splice(targetIndex, 0, movingRow);
  return [...nextPersistedRows, ...draftRows];
}

async function findDocumentTagMigrationTargets(previousTag: string) {
  const pageSize = 100;
  const documents: SearchResultItem[] = [];

  for (let page = 1; ; page += 1) {
    const result = await searchDocuments('all', 'query', page, pageSize, [previousTag], 'or');
    documents.push(...result.items.filter((item) => item.tags.includes(previousTag)));
    if (documents.length >= result.total || result.items.length === 0) {
      return documents;
    }
  }
}

async function migrateDocumentTag(documents: SearchResultItem[], previousTag: string, nextTag: string) {
  for (const document of documents) {
    await updateDocumentTags(document.documentId, replaceDocumentTag(document.tags, previousTag, nextTag));
  }
}

function replaceDocumentTag(tags: string[], previousTag: string, nextTag: string) {
  return Array.from(new Set(tags.map((tag) => (tag === previousTag ? nextTag : tag))));
}

function IconPreview({ value }: { value: string }) {
  const iconName = resolveHeroIconName(value);
  if (!iconName && !hasHeroIconInput(value)) {
    return <span className="h-9 w-9 shrink-0" />;
  }

  const valid = Boolean(iconName);
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded border ${
        valid ? 'border-stone-300 bg-stone-50 text-stone-800' : 'border-red-200 bg-red-50 text-red-800'
      }`}
      title={iconName ?? 'Icon not found'}
    >
      <DynamicHeroIcon className="h-5 w-5" name={iconName ?? 'QuestionMarkCircleIcon'} aria-hidden="true" />
    </span>
  );
}
