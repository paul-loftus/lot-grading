import { useEffect, useMemo, useState } from 'react';
import type { DrawingEntity, Point, Project } from '../core/types';
import {
  gradeEditRestriction,
  gradeNumber,
  gradePercent,
  gradeRatio,
  measureGrade,
  previewGradeEdit,
  segmentControls,
} from '../core/grade';
import type { GradeControl, GradeMeasurement, GradeOverlay } from '../core/grade';

function GradeValues({ measurement: m, unit }: { measurement: GradeMeasurement; unit: string }) {
  return (
    <dl className="grade-values">
      <div>
        <dt>Horizontal run · XY</dt>
        <dd data-testid="grade-run">
          {gradeNumber(m.horizontal)} {unit}
        </dd>
      </div>
      <div>
        <dt>Elevation difference · B − A</dt>
        <dd data-testid="grade-rise">
          {gradeNumber(m.deltaZ, true)} {unit}
        </dd>
      </div>
      <div>
        <dt>Signed grade · A → B</dt>
        <dd data-testid="grade-percent">{gradePercent(m)}</dd>
      </div>
      <div>
        <dt>Slope ratio · horizontal : vertical</dt>
        <dd data-testid="grade-ratio">{gradeRatio(m)}</dd>
      </div>
      <div>
        <dt>Downhill direction</dt>
        <dd>
          {m.downhill === 'a-to-b'
            ? 'A → B'
            : m.downhill === 'b-to-a'
              ? 'B → A'
              : m.condition === 'level'
                ? 'Level · no fall'
                : m.condition === 'vertical'
                  ? 'Vertical · no plan direction'
                  : 'No plan direction'}
        </dd>
      </div>
    </dl>
  );
}

export function GradeCheckPanel({
  controls,
  unit,
  onClear,
}: {
  controls: GradeControl[];
  unit: string;
  onClear: () => void;
}) {
  const measurement =
    controls.length === 2 ? measureGrade(controls[0].point, controls[1].point) : null;
  return (
    <section className="grade-panel" aria-label="Grade check">
      <p>
        Pick A and B on existing endpoints, points, midpoints, arc centers or unambiguous
        intersections. Grade check always acquires source XYZ. Tab cycles nearby targets.
      </p>
      {controls.map((control, i) => (
        <p className="grade-control" key={i}>
          <strong>
            {i === 0 ? 'A' : 'B'} · {control.source}
          </strong>
          <br />X {control.point.x}, Y {control.point.y}, Z {control.point.z} {unit}
        </p>
      ))}
      {measurement ? (
        <GradeValues measurement={measurement} unit={unit} />
      ) : (
        <p role="status">{controls.length ? 'Choose control B.' : 'Choose control A.'}</p>
      )}
      <p>
        This is a two-point check of supplied elevations. It does not query a terrain surface or
        assess drainage or design criteria. A third pick starts a new pair; Escape clears the check.
      </p>
      <button className="precision-place" onClick={onClear} disabled={!controls.length}>
        Clear grade check
      </button>
    </section>
  );
}

export function SegmentGradePanel({
  project,
  entity,
  unit,
  onApply,
  onOverlay,
}: {
  project: Project;
  entity: DrawingEntity;
  unit: string;
  onApply: (entity: DrawingEntity) => boolean;
  onOverlay: (overlay: GradeOverlay | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [segment, setSegment] = useState(0);
  const [hold, setHold] = useState<'a' | 'b'>('a');
  const [requested, setRequested] = useState('');
  const [applyError, setApplyError] = useState('');
  const geometry = JSON.stringify([entity.kind, entity.closed, entity.points, entity.bulges]);
  const count = entity.points.length - (entity.closed ? 0 : 1);
  const index = Math.min(segment, count - 1);
  const { a, b, aIndex, bIndex } = segmentControls(entity, index);
  const measurement = measureGrade(a, b),
    restriction = gradeEditRestriction(entity);
  const preview = useMemo(() => {
    if (!requested.trim() || restriction) return { edit: null, error: '' };
    try {
      return {
        edit: previewGradeEdit(project, entity.id, index, hold, Number(requested)),
        error: '',
      };
    } catch (error) {
      return {
        edit: null,
        error: error instanceof Error ? error.message : 'The grade cannot be applied.',
      };
    }
  }, [geometry, index, hold, requested, restriction, entity.id]);
  useEffect(() => {
    setRequested('');
    setApplyError('');
  }, [geometry, index]);
  useEffect(() => {
    if (!open) {
      onOverlay(null);
      return;
    }
    const next = preview.edit ? segmentControls(preview.edit.entity, index) : { a, b };
    onOverlay({ a: next.a, b: next.b, preview: Boolean(preview.edit) });
    return () => onOverlay(null);
  }, [open, geometry, index, hold, requested]);
  return (
    <details
      className="vertex-details grade-panel"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Grade / slope</summary>
      <div>
        <label className="curve-select">
          <span>Measured segment</span>
          <select
            aria-label="Grade segment"
            value={index}
            onChange={(event) => setSegment(Number(event.target.value))}
          >
            {Array.from({ length: count }, (_, i) => (
              <option key={i} value={i}>
                Segment {i + 1}: A vertex {i + 1} → B vertex {((i + 1) % entity.points.length) + 1}
              </option>
            ))}
          </select>
        </label>
        <p>
          A: vertex {aIndex + 1}, Z {a.z} {unit}
          <br />
          B: vertex {bIndex + 1}, Z {b.z} {unit}
        </p>
        <GradeValues measurement={measurement} unit={unit} />
        {entity.bulges?.[index] ? (
          <p>Horizontal run is the endpoint chord, not arc length. The path has one elevation.</p>
        ) : null}
        {restriction ? (
          <p className="grade-restriction">{restriction}</p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!preview.edit) return;
              if (onApply(preview.edit.entity)) setRequested('');
              else
                setApplyError(
                  'The grade edit could not be applied. Review the drawing validation message.',
                );
            }}
          >
            <label className="curve-select">
              <span>Held elevation</span>
              <select
                aria-label="Held grade endpoint"
                value={hold}
                onChange={(event) => setHold(event.target.value as 'a' | 'b')}
              >
                <option value="a">Hold A · vertex {aIndex + 1}</option>
                <option value="b">Hold B · vertex {bIndex + 1}</option>
              </select>
            </label>
            <label className="numeric-field">
              <span>Grade from A to B · %</span>
              <input
                type="number"
                step="any"
                aria-label="Target grade percent"
                value={requested}
                onChange={(event) => setRequested(event.target.value)}
                placeholder="Enter a signed percent"
              />
            </label>
            <p>
              Positive means B is higher than A; negative means B is lower. The sign always follows
              A → B, whichever endpoint is held.
            </p>
            {(preview.error || applyError) && (
              <p className="grade-error" role="alert">
                {preview.error || applyError}
              </p>
            )}
            {preview.edit && (
              <div className="grade-edit-preview" data-testid="grade-edit-preview" role="status">
                <strong>Preview · vertex {preview.edit.movedIndex + 1}</strong>
                <p>
                  Z {preview.edit.beforeZ} → {preview.edit.afterZ} {unit}
                  <br />
                  Held vertex {preview.edit.heldIndex + 1}: Z{' '}
                  {entity.points[preview.edit.heldIndex].z} {unit}
                  <br />
                  Resulting A → B grade: {gradePercent(preview.edit.measurement)}
                </p>
                {preview.edit.adjacent.map((change) => (
                  <p key={change.segment}>
                    Also changes segment {change.segment + 1}: {gradePercent(change.before)} →{' '}
                    {gradePercent(change.after)}
                  </p>
                ))}
                <p>
                  Apply changes only this polyline vertex's Z. Other vertices keep their
                  coordinates. Nearby features and survey references remain independent controls.
                </p>
              </div>
            )}
            <button
              className="precision-place"
              type="submit"
              disabled={!preview.edit || preview.edit.beforeZ === preview.edit.afterZ}
            >
              Apply grade
            </button>
          </form>
        )}
      </div>
    </details>
  );
}
