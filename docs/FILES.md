# Working files, local saves, and recovery

[Tutorial](tutorial/README.md) · [Development](DEVELOPMENT.md) · [Implementation decisions](../research/16-file-handling-and-recovery/README.md)

Rebuild and restart the desktop application with `npm start`. The file-status strip below the project header shows the working-file state and location. Hover a shortened path to see its full value, or use **Show in Finder/Explorer**.

## Choose where work is saved

| Action                                         | Desktop behavior                                                                                                                                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic library save                         | Keeps committed edits in this computer's local project library. It does not write the external working file.                                                            |
| Save project / Command or Ctrl + S             | Saves the library and updates the associated working file. Without an association, it saves the library; choose Save As to establish a working file.                    |
| Save project as… / Command or Ctrl + Shift + S | Writes a `.lotgrade` file to a chosen location and makes it the working file. The previous file remains.                                                                |
| Save a copy…                                   | Writes a portable snapshot to another path without changing the working-file association.                                                                               |
| Open project file                              | Opens a desktop working file and associates its path. Its project identity is retained, updating the matching library entry rather than creating an imported duplicate. |
| Open a dashboard project card                  | Opens the latest library snapshot, including edits not yet written to its working file.                                                                                 |
| Open a recent file                             | Opens that disk revision. When it differs from the existing library design, a recovery snapshot preserves the library revision before replacement.                      |

Finish drafts before saving; preview points are not committed drawing objects. Focused numeric edits are committed before file actions. Closing the desktop workspace preserves its library copy; writing the working file is an explicit **Save** action.

Use **Save a copy…** for a shareable snapshot or to preserve current valid work during a library-save failure. It must use a different path from the current working file. A project cannot be saved over another associated project's working file or into the application's internal library/recovery folders. DXF export uses a `.dxf` destination and cannot overwrite a known working project.

The desktop app remembers the last project-save folder, last successful DXF-export folder, and up to ten recent working-file locations. These are local preferences. The dashboard lists recent paths and missing-file indicators.

## Read the save state

The header's **Saved to library** describes the automatic local copy. The separate file-status strip describes the working file:

- **Library only:** choose Save As if you need an external working file.
- **Working file saved:** the current project matches the saved working revision.
- **Working file has unsaved changes:** the library/model differs from the last saved working revision. Save updates that file.
- **Working file missing:** locate the last saved revision with Relink, or choose another path with Save As. Save does not silently recreate a missing file.
- **Working file changed / unavailable:** external changes or read errors block Save. Current work remains available in memory and the separate library when its save succeeds.

The app checks file state after edits, on window focus, and through **Check file**. Every working-file write rechecks the expected file contents, even when the displayed status is older.

## Handle external changes or a moved file

For an external-change conflict, use **Save a copy…** or **Save project as…** with a different destination to retain current work. Open the external version to inspect/adopt it. Selecting the same conflicting path in Save As does not bypass the protection. The application does not automatically merge revisions or provide a force-overwrite command.

For a moved working file, choose **Relink working file…** and locate it. Relink verifies the project identity and last saved project content before updating the path; it keeps newer library edits. A different revision must be opened for inspection instead. A missing recent file also offers **Locate…** when its library project is available.

Imported survey sources are embedded in the project. Moving their original DXF/CSV files does not break those reference groups; they do not need external relinking.

## Make and recover checkpoints

1. Choose **Recovery / checkpoints** in a workspace, or from the dashboard to browse all local projects' snapshots.
2. Use **Create checkpoint** to capture the current committed design deliberately. Review snapshots by project name, time, reason, and object count.
3. Select a revision and choose **Restore as recovered copy**.
4. Inspect the recovered project. It has a new project identity, a `(recovered)` name, and no working-file association. Curves, elevations, layers, and embedded survey sources are preserved.
5. Use Save As to choose its working location after review. Original projects, working files, and damaged library files remain separate.

Desktop recovery keeps up to **10 valid revisions per project**, with an overall **200 MB / 200-revision** bound. It records the preceding design before an automatic library save at most once per 30 seconds, before changed working-file saves/replacements, before library deletion, and when opening another file revision. Manual checkpoints capture the current project. Pan/zoom and timestamp-only changes do not create library design checkpoints. This is bounded revision recovery, not an archive of every edit; Undo/Redo remains the immediate editing history.

Damaged library entries do not prevent other projects from loading. Valid existing recovery snapshots remain available from the dashboard. If an explicitly opened valid file replaces a corrupt library entry, the corrupt bytes are first preserved in a sibling `.recovery` file. Recovery is possible only where a valid checkpoint, library copy, or portable file exists; the app cannot reconstruct unsaved/corrupted data without one.

## Local storage and portability

The desktop user-data directory contains:

```text
projects/<project-id>.lotgrade   automatic library copies
revisions/                     bounded recovery snapshots
file-state.json                local paths, hashes, recent files, and folder preferences
```

Working-file paths stay in local preferences rather than the portable project, so this feature needs no project-schema or DXF-contract change. Sharing a `.lotgrade` project does not include these machine-local locations. Embedded survey source contents remain part of schema 3 projects, as described in the [import guide](IMPORT.md).

The writer flushes a temporary file and replaces the destination after checking its expected hash, while a cooperative lock coordinates LotGrade writers. This protects local-file writes and detects conflicting sessions; it is not a guarantee of distributed locking on network/cloud filesystems or power-loss recovery. Unknown/live locks block writes; a lock with a recorded dead process can be reclaimed. If saving file content succeeds but writing local preferences fails, preserve the reported file and inspect its state before retrying.

## Browser preview

The browser preview saves to its own library and downloads portable copies. It cannot associate, reveal, or relink arbitrary disk files, and does not offer native recent-file locations. Its status explicitly says **Browser library · downloads are copies**.

Browser recovery keeps up to **5 small snapshots per project**, **10 total**, within **2 MB**. Automatic snapshots are limited to preceding projects under 1 MB; larger designs should use the desktop app or portable copies. Browser storage quotas can still reject a save/checkpoint. Valid in-memory work can be downloaded or exported independently of a library failure.
