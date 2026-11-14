import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { platform, isDesktop } from '../platform';
import type { Project } from '../core/types';
import type { RevisionInfo } from '../core/files';

export function RecoveryDialog({
  project,
  onClose,
  onRecover,
}: {
  project?: Project;
  onClose: () => void;
  onRecover: (project: Project) => Promise<void>;
}) {
  const [revisions, setRevisions] = useState<RevisionInfo[]>([]);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const host = useRef<HTMLElement>(null);
  const load = async () => setRevisions(await platform.listRevisions(project?.id));
  useEffect(() => {
    const previous = document.activeElement;
    host.current?.focus();
    void load().catch((e) => setError(e.message));
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [project?.id]);
  const action = async (callback: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await callback();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recovery failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop">
      <section
        className="modal recovery-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        ref={host}
        tabIndex={-1}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape' && !busy) onClose();
          if (event.key === 'Tab') {
            const items = [
              ...(host.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []),
            ];
            if (
              event.shiftKey &&
              (document.activeElement === items[0] || document.activeElement === host.current)
            ) {
              event.preventDefault();
              items.at(-1)?.focus();
            } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
              event.preventDefault();
              items[0]?.focus();
            }
          }
        }}
      >
        <button
          className="modal-close icon-button"
          aria-label="Close recovery"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <h2 id="recovery-title">Recovery and checkpoints</h2>
        <p>
          {project ? project.name : 'All local projects'} · Restore a separate recovered copy for
          inspection. Existing library entries and working files are kept.
        </p>
        <p>
          {isDesktop
            ? 'Up to 10 revisions per project, 200 MB / 200 revisions overall. Library design checkpoints are spaced by at least 30 seconds; explicit working-file saves and manual checkpoints also preserve revisions.'
            : 'Browser recovery keeps up to 5 small revisions per project, 10 / 2 MB overall. Use the desktop app for larger projects and working files.'}
        </p>
        {error && (
          <p className="recovery-error" role="alert">
            {error}
          </p>
        )}
        <div className="revision-list" aria-label="Saved revisions">
          {revisions.length ? (
            revisions.map((revision) => (
              <button
                key={revision.key}
                className={selected === revision.key ? 'selected' : ''}
                aria-pressed={selected === revision.key}
                onClick={() => setSelected(revision.key)}
                disabled={busy}
              >
                <strong>{revision.name}</strong>
                <span>
                  {new Date(revision.savedAt).toLocaleString()} · {revision.reason} ·{' '}
                  {revision.objectCount} objects
                </span>
              </button>
            ))
          ) : (
            <p>
              No valid recovery snapshots are available yet. A damaged library file stays on disk
              while other valid projects remain accessible.
            </p>
          )}
        </div>
        <div className="modal-actions">
          {project && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await platform.createCheckpoint(project);
                  await load();
                })
              }
            >
              Create checkpoint
            </button>
          )}
          <button className="secondary-button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={busy || !selected}
            onClick={() =>
              void action(async () => {
                await onRecover(await platform.recoverRevision(selected));
              })
            }
          >
            Restore as recovered copy
          </button>
        </div>
      </section>
    </div>
  );
}
