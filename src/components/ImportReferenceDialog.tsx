import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { entityBounds, entitySvgPath } from '../core/geometry';
import {
  importReference,
  previewDxf,
  previewPoints,
  readPointTable,
  readSource,
} from '../core/import';
import type { ImportPreview, PointFormat, SourceFile } from '../core/import';
import type { Project, Units } from '../core/types';
import { UNIT_LABELS } from '../core/types';

const initialFormat: PointFormat = {
  delimiter: ',',
  header: false,
  columns: { x: 0, y: 1, z: 2, pointNumber: null, description: null },
};

export function ImportReferenceDialog({
  project,
  onApply,
  onClose,
}: {
  project: Project;
  onApply: (next: Project) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<SourceFile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [format, setFormat] = useState<PointFormat>(initialFormat);
  const [sourceUnits, setSourceUnits] = useState<Units | ''>('');
  const [horizontal, setHorizontal] = useState(project.coordinateContext?.horizontal ?? '');
  const [vertical, setVertical] = useState(project.coordinateContext?.vertical ?? '');
  const [controlObject, setControlObject] = useState(0);
  const [controlVertex, setControlVertex] = useState(0);
  const [compare, setCompare] = useState(false);
  const [expected, setExpected] = useState({ x: '', y: '', z: '' });
  const [confirmed, setConfirmed] = useState(false);
  const [acceptIssues, setAcceptIssues] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const generation = useRef(0);
  const isDxf = file?.name.toLowerCase().endsWith('.dxf') ?? false;
  const parsed = useMemo((): {
    preview?: ImportPreview;
    table?: ReturnType<typeof readPointTable>;
    error?: string;
  } => {
    if (!file) return {};
    try {
      if (isDxf) return { preview: previewDxf(file.text) };
      const table = readPointTable(file.text, format.delimiter);
      try {
        return { table, preview: previewPoints(table, format) };
      } catch (cause) {
        return {
          table,
          error: cause instanceof Error ? cause.message : 'Review the column mapping.',
        };
      }
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : 'The source could not be read.' };
    }
  }, [file, format, isDxf]);
  const preview = parsed.preview;
  const units = preview?.declaredUnits ?? sourceUnits;
  const control = preview?.entities[controlObject]?.points[controlVertex];
  const expectedPoint = { x: Number(expected.x), y: Number(expected.y), z: Number(expected.z) };
  const expectedValid =
    !compare ||
    Object.values(expected).every(
      (v) => v.trim() && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 1e12,
    );
  const unitsValid = Boolean(units && units === project.units && !preview?.unsupportedUnits);
  const bounds = useMemo(
    () =>
      preview?.entities.reduce(
        (b, entity) => {
          const e = entityBounds(entity);
          return {
            minX: Math.min(b.minX, e.minX),
            minY: Math.min(b.minY, e.minY),
            maxX: Math.max(b.maxX, e.maxX),
            maxY: Math.max(b.maxY, e.maxY),
          };
        },
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      ),
    [preview],
  );
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.focus();
    return () => {
      generation.current++;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  useEffect(() => {
    setConfirmed(false);
    setAcceptIssues(false);
    setControlObject(0);
    setControlVertex(0);
  }, [file, format]);
  const chooseFile = async (input: HTMLInputElement) => {
    const selected = input.files?.[0];
    if (!selected) return;
    const current = ++generation.current;
    setLoading(true);
    setError('');
    setFile(null);
    setSourceUnits('');
    try {
      if (selected.size > 4 * 1024 * 1024) throw new Error('Choose a source file up to 4 MB.');
      const source = await readSource(selected.name, new Uint8Array(await selected.arrayBuffer()));
      if (generation.current === current) setFile(source);
    } catch (cause) {
      if (generation.current === current)
        setError(cause instanceof Error ? cause.message : 'The source could not be opened.');
    } finally {
      if (generation.current === current) setLoading(false);
    }
  };
  const apply = () => {
    if (!file || !preview || !units || !expectedValid) return;
    try {
      onApply(
        importReference(project, file, preview, {
          format: isDxf ? 'dxf' : 'points',
          units,
          context: { horizontal: horizontal.trim(), vertical: vertical.trim() },
          ...(isDxf ? {} : { pointFormat: format }),
          acceptIssues,
          alignment: {
            object: controlObject,
            vertex: controlVertex,
            confirmed,
            ...(compare ? { expected: expectedPoint } : {}),
          },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The reference could not be imported.');
    }
  };
  return (
    <div className="modal-backdrop" onPointerDown={(event) => event.stopPropagation()}>
      <section
        className="modal reference-import"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-title"
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') {
            event.preventDefault();
            onClose();
          }
          if (event.key === 'Tab') {
            const elements = [
              ...(dialog.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
              ) ?? []),
            ];
            const first = elements[0],
              last = elements.at(-1);
            if (
              event.shiftKey &&
              (document.activeElement === first || document.activeElement === dialog.current)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <button
          className="modal-close icon-button"
          aria-label="Close reference import"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <h2 id="reference-title">Import survey / reference</h2>
        <p>
          Preview a DXF base plan or mapped survey points. References stay locked. Coordinates and
          elevations are used as supplied.
        </p>
        <label>
          Source file · DXF, CSV, TXT or XYZ
          <input
            aria-label="Reference source file"
            type="file"
            accept=".dxf,.csv,.txt,.xyz"
            onChange={(event) => void chooseFile(event.currentTarget)}
          />
        </label>
        {loading && <p role="status">Reading source…</p>}
        {file && (
          <p className="source-fingerprint">
            {file.name} · SHA-256 {file.sha256.slice(0, 16)}…<br />
            Original bytes are preserved inside the saved project. Only the file name is stored,
            with no machine path.
          </p>
        )}
        {file && !isDxf && (
          <fieldset>
            <legend>Survey point format</legend>
            <div className="import-grid">
              <label>
                Delimiter
                <select
                  aria-label="Point delimiter"
                  value={format.delimiter}
                  onChange={(event) =>
                    setFormat({
                      ...format,
                      delimiter: event.target.value as PointFormat['delimiter'],
                    })
                  }
                >
                  <option value=",">Comma</option>
                  <option value=";">Semicolon</option>
                  <option value={'\t'}>Tab</option>
                  <option value="space">Whitespace</option>
                </select>
              </label>
              <label>
                Column preset
                <select
                  aria-label="Point column preset"
                  value={
                    format.columns.pointNumber === 0 &&
                    format.columns.description === 4 &&
                    format.columns.z === 3 &&
                    format.columns.x === 2 &&
                    format.columns.y === 1
                      ? 'pnezd'
                      : format.columns.pointNumber === 0 &&
                          format.columns.description === 4 &&
                          format.columns.z === 3 &&
                          format.columns.x === 1 &&
                          format.columns.y === 2
                        ? 'penzd'
                        : format.columns.x === 0 &&
                            format.columns.y === 1 &&
                            format.columns.z === 2 &&
                            format.columns.pointNumber === null &&
                            format.columns.description === null
                          ? 'xyz'
                          : 'custom'
                  }
                  onChange={(event) => {
                    const preset = event.target.value;
                    if (preset === 'custom') return;
                    setFormat({
                      ...format,
                      columns:
                        preset === 'xyz'
                          ? initialFormat.columns
                          : {
                              x: preset === 'pnezd' ? 2 : 1,
                              y: preset === 'pnezd' ? 1 : 2,
                              z: 3,
                              pointNumber: 0,
                              description: 4,
                            },
                    });
                  }}
                >
                  <option value="custom">Custom mapping</option>
                  <option value="xyz">XYZ / ENZ</option>
                  <option value="pnezd">PNEZD</option>
                  <option value="penzd">PENZD</option>
                </select>
              </label>
            </div>
            <label className="import-check">
              <input
                type="checkbox"
                checked={format.header}
                onChange={(event) => setFormat({ ...format, header: event.target.checked })}
              />
              First record is a header
            </label>
            <div className="import-grid mapping-grid">
              {(['x', 'y', 'z', 'pointNumber', 'description'] as const).map((key) => (
                <label key={key}>
                  {
                    {
                      x: 'X / Easting',
                      y: 'Y / Northing',
                      z: 'Z / Elevation',
                      pointNumber: 'Point number',
                      description: 'Description',
                    }[key]
                  }
                  <select
                    aria-label={`Column ${key}`}
                    value={format.columns[key] ?? ''}
                    onChange={(event) =>
                      setFormat({
                        ...format,
                        columns: {
                          ...format.columns,
                          [key]: event.target.value === '' ? null : Number(event.target.value),
                        },
                      })
                    }
                  >
                    {['pointNumber', 'description'].includes(key) && (
                      <option value="">Not supplied</option>
                    )}
                    {Array.from({ length: Math.max(parsed.table?.width ?? 0, 3) }, (_, i) => (
                      <option key={i} value={i}>
                        {i + 1}
                        {format.header && parsed.table?.rows[0]?.cells[i]
                          ? ` · ${parsed.table.rows[0].cells[i].slice(0, 35)}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {parsed.table && (
              <details>
                <summary>Raw source rows</summary>
                <div className="import-table">
                  <table>
                    <tbody>
                      {parsed.table.rows.slice(0, 5).map((row) => (
                        <tr key={row.line}>
                          <th>Line {row.line}</th>
                          {row.cells.map((cell, i) => (
                            <td key={i}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </fieldset>
        )}
        {(error || parsed.error) && (
          <p className="import-error" role="alert">
            {error || parsed.error}
          </p>
        )}
        {preview && (
          <>
            <fieldset>
              <legend>Units and coordinate context</legend>
              <p>
                Project: {UNIT_LABELS[project.units]}. DXF declaration:{' '}
                {isDxf ? preview.unitLabel : 'Not supplied by a point file'}. No scaling, origin
                shift, reprojection or vertical adjustment is performed.
              </p>
              <label>
                Source units
                <select
                  aria-label="Source units"
                  value={units}
                  disabled={Boolean(preview.declaredUnits) || preview.unsupportedUnits}
                  onChange={(event) => {
                    setSourceUnits(event.target.value as Units);
                    setConfirmed(false);
                  }}
                >
                  <option value="">Confirm source units…</option>
                  {Object.entries(UNIT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {!unitsValid && (
                <p className="import-error">
                  Confirm matching source units. Sources with different or unsupported units must be
                  converted explicitly before import.
                </p>
              )}
              <div className="import-grid">
                <label>
                  Horizontal coordinate system
                  <input
                    aria-label="Horizontal coordinate system"
                    value={horizontal}
                    maxLength={500}
                    placeholder="Unknown"
                    onChange={(event) => {
                      setHorizontal(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>
                <label>
                  Vertical datum / local benchmark
                  <input
                    aria-label="Vertical datum or benchmark"
                    value={vertical}
                    maxLength={500}
                    placeholder="Unknown"
                    onChange={(event) => {
                      setVertical(event.target.value);
                      setConfirmed(false);
                    }}
                  />
                </label>
              </div>
              <p>
                Blank labels remain unknown. Entering a label does not establish or transform a
                coordinate system.
              </p>
            </fieldset>
            <fieldset>
              <legend>
                Preview · {preview.entities.length} supported / {preview.issues.length} skipped
              </legend>
              <p>
                {Object.entries(preview.counts)
                  .map(([type, count]) => `${type}: ${count}`)
                  .join(' · ') || 'No source objects'}
                . Colors, line types, labels and CAD styles are not reproduced.
              </p>
              {bounds &&
                preview.entities.length > 0 &&
                (() => {
                  const width = Math.max(bounds.maxX - bounds.minX, 1),
                    height = Math.max(bounds.maxY - bounds.minY, 1),
                    margin = Math.max(width, height) * 0.05;
                  return (
                    <svg
                      className="import-plan"
                      role="img"
                      aria-label="Reference geometry preview"
                      viewBox={`${-margin} ${-margin} ${width + 2 * margin} ${height + 2 * margin}`}
                    >
                      {preview.entities
                        .slice(0, 500)
                        .map((entity) =>
                          entity.kind === 'point' ? (
                            <circle
                              key={entity.id}
                              cx={entity.points[0].x - bounds.minX}
                              cy={bounds.maxY - entity.points[0].y}
                              r={Math.max(width, height) * 0.005}
                              fill="#537b72"
                            />
                          ) : (
                            <path
                              key={entity.id}
                              d={entitySvgPath(
                                entity,
                                (p) => ({ x: p.x - bounds.minX, y: bounds.maxY - p.y }),
                                1,
                              )}
                              stroke="#537b72"
                              strokeWidth={Math.max(width, height) * 0.002}
                              fill="none"
                            />
                          ),
                        )}
                    </svg>
                  );
                })()}
              {preview.entities.length > 500 && (
                <p>
                  Plan preview shows the first 500 supported objects. Counts and import include all
                  supported objects.
                </p>
              )}
              <div className="import-table">
                <table>
                  <thead>
                    <tr>
                      <th>Object</th>
                      <th>Name / layer</th>
                      <th>Vertices</th>
                      <th>First X</th>
                      <th>First Y</th>
                      <th>First Z</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.entities.slice(0, 8).map((entity, i) => (
                      <tr key={entity.id}>
                        <td>{i + 1}</td>
                        <td>
                          {entity.name}
                          <br />
                          {entity.layer}
                        </td>
                        <td>{entity.points.length}</td>
                        <td>{entity.points[0].x}</td>
                        <td>{entity.points[0].y}</td>
                        <td>{entity.points[0].z}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.issues.length > 0 && (
                <>
                  <details>
                    <summary>Skipped records · {preview.issues.length}</summary>
                    <ul>
                      {preview.issues.slice(0, 100).map((issue, i) => (
                        <li key={i}>
                          <strong>
                            {issue.record} · {issue.type}:
                          </strong>{' '}
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                    {preview.issues.length > 100 && (
                      <p>
                        The first 100 skipped records are shown. The full report will be saved with
                        the reference.
                      </p>
                    )}
                  </details>
                  <label className="import-check">
                    <input
                      type="checkbox"
                      checked={acceptIssues}
                      onChange={(event) => setAcceptIssues(event.target.checked)}
                    />
                    I reviewed the skipped records and accept a partial import.
                  </label>
                </>
              )}
            </fieldset>
            {control && (
              <fieldset>
                <legend>Known-coordinate alignment check</legend>
                <div className="import-grid">
                  <label>
                    Control object
                    <input
                      aria-label="Control object"
                      type="number"
                      min={1}
                      max={preview.entities.length}
                      value={controlObject + 1}
                      onChange={(event) => {
                        const next = Number(event.target.value) - 1;
                        if (Number.isInteger(next) && next >= 0 && next < preview.entities.length) {
                          setControlObject(next);
                          setControlVertex(0);
                          setConfirmed(false);
                        }
                      }}
                    />
                  </label>
                  <label>
                    Control vertex
                    <input
                      aria-label="Control vertex"
                      type="number"
                      min={1}
                      max={preview.entities[controlObject].points.length}
                      value={controlVertex + 1}
                      onChange={(event) => {
                        const next = Number(event.target.value) - 1;
                        if (
                          Number.isInteger(next) &&
                          next >= 0 &&
                          next < preview.entities[controlObject].points.length
                        ) {
                          setControlVertex(next);
                          setConfirmed(false);
                        }
                      }}
                    />
                  </label>
                </div>
                <p>
                  {preview.entities[controlObject].name}
                  <br />
                  Source X {control.x}, Y {control.y}, Z {control.z}
                </p>
                <label className="import-check">
                  <input
                    type="checkbox"
                    checked={compare}
                    onChange={(event) => {
                      setCompare(event.target.checked);
                      setConfirmed(false);
                    }}
                  />
                  Compare with a known coordinate
                </label>
                {compare && (
                  <>
                    <div className="import-grid mapping-grid">
                      {(['x', 'y', 'z'] as const).map((axis) => (
                        <label key={axis}>
                          Expected {axis.toUpperCase()}
                          <input
                            aria-label={`Expected ${axis.toUpperCase()}`}
                            type="number"
                            step="any"
                            value={expected[axis]}
                            onChange={(event) => {
                              setExpected({ ...expected, [axis]: event.target.value });
                              setConfirmed(false);
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    {expectedValid ? (
                      <p role="status">
                        Source − expected: ΔX {control.x - expectedPoint.x}, ΔY{' '}
                        {control.y - expectedPoint.y}, ΔZ {control.z - expectedPoint.z}. These are
                        differences only; the source is not moved.
                      </p>
                    ) : (
                      <p className="import-error">Enter all three expected coordinates.</p>
                    )}
                  </>
                )}
                <label className="import-check">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  I confirmed the source units and coordinate alignment.
                </label>
              </fieldset>
            )}
          </>
        )}
        <div className="modal-actions">
          <button className="workspace-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="workspace-btn workspace-btn-primary"
            disabled={
              loading ||
              !preview?.entities.length ||
              !unitsValid ||
              !control ||
              !expectedValid ||
              !confirmed ||
              Boolean(preview.issues.length && !acceptIssues)
            }
            onClick={apply}
          >
            Import locked reference
          </button>
        </div>
      </section>
    </div>
  );
}
