# Working files and revision recovery

[Research index](../README.md) · [Priority 3](../14-professional-feature-priorities/README.md#3-professional-file-handling-and-recovery) · [User guide](../../docs/FILES.md)

Implementation date: **November 13, 2026**. This extends the local library with an explicit desktop working-file association and bounded recovery. Feature 4 remains separate.

## Decisions and primary sources

Keep project geometry and embedded reference data portable. Store absolute working-file paths, expected file hashes, recent locations, and folder preferences in desktop user data. Electron supplies the platform user-data location and native dialogs; these are application preferences, not design metadata. [Electron application paths](https://www.electronjs.org/docs/latest/api/app), [native dialogs](https://www.electronjs.org/docs/latest/api/dialog).

Define file actions explicitly: library autosave preserves ongoing local work, Save updates the associated working file, Save As switches that association, and Save a Copy leaves it unchanged. Native Open retains project identity and adopts a disk revision; dashboard project cards open library state. A changed library design is checkpointed before opening another disk revision. These are product decisions intended to resolve the ambiguity observed in the earlier file-location workflow.

Use content hashes instead of modification times alone to detect external changes. Serialize each instance's operations, coordinate LotGrade writers with an exclusive lock directory, write/flush a unique temporary file, recheck the expected destination hash, then rename. Node exposes the filesystem primitives used by this protocol. A lock held by a live/unknown process is kept; only a recorded dead owner permits automatic reclamation. This is an optimistic local-file protocol, not a universal compare-and-swap or distributed locking guarantee. [Node filesystem API](https://nodejs.org/api/fs.html).

Expose the saved location using Electron's platform shell facility. Canonicalize file destinations before comparison so aliases cannot bypass internal-folder or working-file protections. [Show an item in its folder](https://www.electronjs.org/docs/latest/api/shell#shellshowiteminfolderfullpath).

Keep valid revisions separate from the active library files and show a chooser with reason, timestamp, and object count. Restore a separate project copy with no association rather than automatically replacing the file under review. Bound valid desktop history to ten snapshots per project and 200 MB / 200 snapshots overall. Space automatic library design snapshots by 30 seconds; explicit working saves and manual checkpoints preserve additional revisions. This is a chosen initial retention policy, not a measured office standard.

## Recovery and concurrency boundaries

Missing working files require a new location or an explicit relink to the last saved project revision. A changed file requires inspection or a separate Save As/Copy; same-path Save As does not bypass the conflict check. Imported survey sources remain embedded, so moving the original source does not create an external-reference failure.

Each session keeps its own expected library/file hashes. Merely listing projects does not reset the write guard; explicitly opening a library revision adopts that revision. Local preference updates merge other projects' associations without adopting another session's baseline. Damaged library entries are retained while other projects and valid recovery copies remain accessible. No valid backup means recovery cannot be assumed.

Browser development retains download semantics and a small bounded recovery store, with its limitations displayed explicitly. It does not pretend to hold desktop file handles.

## Verification

Temporary-directory filesystem tests cover Save/Save As/Copy, restarts, private path separation, external changes, missing files/relink validation, concurrent library/working writers, active locks, internal-folder guards, revision bounds, corrupt originals, schema 3 source/curve preservation, and deletion recovery. Browser/native workflows exercise the same choices through the UI and focused inspector edits. Existing drawing, import, and independent DXF gates remain required.

Cross-platform CI and real cloud/network working files need separate validation. A local reader check does not establish Civil 3D 2025 receiving behavior, and this feature does not change the terrain or grading engine.
