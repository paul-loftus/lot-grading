import type { Project, ReferenceSource } from '../core/types';
import { UNIT_LABELS } from '../core/types';
import { downloadOriginal } from '../core/references';

export function ReferencePanel({
  project,
  onChange,
}: {
  project: Project;
  onChange: (sources: ReferenceSource[]) => void;
}) {
  const sources = project.references ?? [];
  const patch = (id: string, changes: Partial<ReferenceSource>) =>
    onChange(sources.map((source) => (source.id === id ? { ...source, ...changes } : source)));
  return (
    <section className="reference-panel" aria-label="Reference sources">
      <h3>Locked reference sources · {sources.length}</h3>
      <p>
        Horizontal: {project.coordinateContext?.horizontal || 'Unknown'}
        <br />
        Vertical: {project.coordinateContext?.vertical || 'Unknown'}
      </p>
      {sources.map((source) => (
        <details className="reference-card" key={source.id}>
          <summary>
            {source.fileName} · {source.entities.length} objects
          </summary>
          <p>
            {UNIT_LABELS[source.units]} · {source.format.toUpperCase()}
            <br />
            Imported {new Date(source.importedAt).toLocaleString()}
            <br />
            SHA-256 <code>{source.sha256}</code>
          </p>
          <label>
            <input
              type="checkbox"
              aria-label={`Show reference ${source.fileName}`}
              checked={source.visible}
              onChange={(event) => patch(source.id, { visible: event.target.checked })}
            />
            Show reference / allow snaps
          </label>
          <label>
            <input
              type="checkbox"
              aria-label={`Include reference ${source.fileName} in DXF`}
              checked={source.includeInExport}
              onChange={(event) => patch(source.id, { includeInExport: event.target.checked })}
            />
            Include reference in DXF export
          </label>
          <p>
            Source geometry is locked. Export inclusion is separate from visibility; references are
            excluded from DXF until selected here.
          </p>
          <div className="reference-buttons">
            <button className="workspace-btn" onClick={() => downloadOriginal(source)}>
              Download original
            </button>
            <button
              className="workspace-btn"
              onClick={() => onChange(sources.filter((item) => item.id !== source.id))}
            >
              Remove reference
            </button>
          </div>
          <details>
            <summary>Source objects and controls</summary>
            <div className="import-table">
              <table>
                <thead>
                  <tr>
                    <th>Source record</th>
                    <th>Object</th>
                    <th>First XYZ</th>
                  </tr>
                </thead>
                <tbody>
                  {source.entities.slice(0, 100).map((entity, i) => (
                    <tr key={entity.id}>
                      <td>
                        {source.records[i]?.record}
                        <br />
                        {source.records[i]?.pointNumber}
                        <br />
                        {source.records[i]?.description}
                      </td>
                      <td>
                        {entity.name}
                        <br />
                        {entity.layer} · {entity.points.length} vertices
                      </td>
                      <td>
                        {entity.points[0].x}
                        <br />
                        {entity.points[0].y}
                        <br />
                        {entity.points[0].z}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {source.entities.length > 100 && <p>Showing the first 100 source objects.</p>}
          </details>
          <details>
            <summary>Import report · {source.issues.length} skipped</summary>
            <ul>
              {source.issues.slice(0, 100).map((issue, i) => (
                <li key={i}>
                  {issue.record} · {issue.type}: {issue.message}
                </li>
              ))}
            </ul>
            {source.issues.length > 100 && (
              <p>
                The first 100 entries are shown; the complete report is preserved in the project.
              </p>
            )}
            {(() => {
              const entity = source.entities.find((item) => item.id === source.alignment.objectId),
                point = entity?.points[source.alignment.vertex];
              return (
                <p>
                  Confirmed alignment control: {entity?.name}, vertex {source.alignment.vertex + 1}
                  <br />
                  XYZ {point?.x}, {point?.y}, {point?.z}
                  {source.alignment.expected && (
                    <>
                      <br />
                      Expected XYZ {source.alignment.expected.x}, {source.alignment.expected.y},{' '}
                      {source.alignment.expected.z}
                    </>
                  )}
                </p>
              );
            })()}
          </details>
        </details>
      ))}
    </section>
  );
}
