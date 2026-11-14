import type { FileState } from '../core/files';
import { isDesktop } from '../platform';

export function FileStatusBar({
  state,
  onCheck,
  onReveal,
  onRelink,
  onRecovery,
}: {
  state: FileState | null;
  onCheck: () => void;
  onReveal: () => void;
  onRelink: () => void;
  onRecovery: () => void;
}) {
  const labels = {
    library: 'Library only · Save As to choose a working file',
    saved: 'Working file saved',
    modified: 'Working file has unsaved changes',
    missing: 'Working file missing',
    conflict: 'Working file changed / unavailable',
  };
  return (
    <div className={`file-status-bar file-status-${state?.status ?? 'library'}`}>
      <div className="file-location">
        <span data-testid="working-file-status" role="status">
          {isDesktop
            ? state
              ? labels[state.status]
              : 'Checking file location…'
            : 'Browser library · downloads are copies'}
        </span>
        <code
          data-testid="working-file-path"
          title={state?.workingPath ?? state?.libraryPath ?? undefined}
        >
          {state?.workingPath ?? state?.libraryPath ?? 'Stored in this browser'}
        </code>
        {state?.detail && (
          <span className="file-problem" role="alert">
            {state.detail}
          </span>
        )}
      </div>
      <div className="file-status-actions">
        {isDesktop && (
          <>
            <button onClick={onCheck}>Check file</button>
            <button onClick={onReveal}>Show in Finder/Explorer</button>
            {state?.workingPath && <button onClick={onRelink}>Relink working file…</button>}
          </>
        )}
        <button onClick={onRecovery}>Recovery / checkpoints</button>
      </div>
    </div>
  );
}
