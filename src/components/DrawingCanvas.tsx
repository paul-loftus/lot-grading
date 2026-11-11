import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { DrawingEntity, Point, Project } from '../core/types';
import { LAYERS } from '../core/types';
import {
  bulgeThroughPoint,
  entityBounds,
  entitySignedArea,
  entitySvgPath,
  validateEntityCurves,
} from '../core/geometry';
import { buildSnapIndex, findSnapTargets, snapPlacement } from '../core/snapping';
import type { SnapTarget } from '../core/snapping';

export type DrawingTool =
  'select' | 'pan' | 'polyline' | 'contour' | 'boundary' | 'boundary-rect' | 'building' | 'point';
export type SegmentMode = 'line' | 'arc';
export interface CanvasHandle {
  finish: () => void;
  cancel: () => void;
  fit: () => void;
  place: (point: Point) => void;
}
interface DrawingCanvasProps {
  project: Project;
  tool: DrawingTool;
  segmentMode: SegmentMode;
  elevation: number;
  objectSnaps: boolean;
  matchSnapElevation: boolean;
  intersectionSnaps: boolean;
  onElevationChange: (elevation: number) => void;
  onAnchorChange: (point: Point | null) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (entity: DrawingEntity) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onViewChange: (view: Project['view']) => void;
  onCursorChange: (point: Point | null) => void;
  onDraftChange: (count: number, pendingArc?: boolean) => void;
}

const COLORS: Record<DrawingEntity['kind'], string> = {
  polyline: '#697c87',
  contour: '#946a46',
  boundary: '#305b4b',
  building: '#53777b',
  point: '#a16549',
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const DrawingCanvas = forwardRef<CanvasHandle, DrawingCanvasProps>(function DrawingCanvas(
  {
    project,
    tool,
    segmentMode,
    elevation,
    objectSnaps,
    matchSnapElevation,
    intersectionSnaps,
    onElevationChange,
    onAnchorChange,
    selectedId,
    onSelect,
    onCreate,
    onMove,
    onViewChange,
    onCursorChange,
    onDraftChange,
  },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [draft, setDraft] = useState<Point[]>([]);
  const [draftBulges, setDraftBulges] = useState<number[]>([]);
  const [arcThrough, setArcThrough] = useState<Point | null>(null);
  const [drawingError, setDrawingError] = useState<string | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [snapTargets, setSnapTargets] = useState<SnapTarget[]>([]);
  const [snapChoice, setSnapChoice] = useState(0);
  const [suspendSnaps, setSuspendSnaps] = useState(false);
  const activeSnap = objectSnaps && !suspendSnaps ? snapTargets[snapChoice] : undefined;
  const [spaceDown, setSpaceDown] = useState(false);
  const [drag, setDrag] = useState<{
    kind: 'pan' | 'entity';
    x: number;
    y: number;
    view: Project['view'];
    id?: string;
  } | null>(null);
  const [movePreview, setMovePreview] = useState<{ id: string; dx: number; dy: number } | null>(
    null,
  );
  const [transientView, setTransientView] = useState<Project['view'] | null>(null);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestViewChange = useRef(onViewChange);
  latestViewChange.current = onViewChange;
  const view = transientView ?? project.view;
  const placementAnchor = arcThrough ?? draft.at(-1) ?? null;
  useEffect(() => onAnchorChange(placementAnchor), [placementAnchor, project.id]);
  const snapIndex = useMemo(
    () =>
      buildSnapIndex([
        ...project.entities,
        ...(draft.length
          ? [
              {
                id: 'current-draft',
                kind: 'polyline' as const,
                name: 'Current path',
                layer: '0',
                points:
                  tool === 'contour' ? draft.map((point) => ({ ...point, z: elevation })) : draft,
                bulges: draftBulges,
                closed: false,
              },
            ]
          : []),
      ]),
    [project.entities, draft, draftBulges, tool, elevation],
  );
  const screen = (p: Pick<Point, 'x' | 'y'>) => ({
    x: (p.x - view.centerX) * view.scale + size.width / 2,
    y: size.height / 2 - (p.y - view.centerY) * view.scale,
  });
  const world = (clientX: number, clientY: number, snap = true): Point => {
    const bounds = host.current?.getBoundingClientRect();
    let x = (clientX - (bounds?.left ?? 0) - size.width / 2) / view.scale + view.centerX;
    let y = (size.height / 2 - clientY + (bounds?.top ?? 0)) / view.scale + view.centerY;
    if (snap && project.settings.snapToGrid) {
      const step = project.settings.gridSize;
      x = Math.round(x / step) * step;
      y = Math.round(y / step) * step;
    }
    return { x, y, z: elevation };
  };
  const clearDraft = () => {
    setDraft([]);
    setDraftBulges([]);
    setArcThrough(null);
    setDrawingError(null);
    setHover(null);
    setSnapTargets([]);
    setSnapChoice(0);
    onDraftChange(0);
  };
  const create = (
    points: Point[],
    kind: DrawingEntity['kind'],
    closed: boolean,
    bulges: number[] = [],
  ) => {
    if (kind === 'contour') points = points.map((point) => ({ ...point, z: elevation }));
    const labels = {
      polyline: 'Line',
      contour: 'Contour',
      boundary: 'Lot boundary',
      building: 'Building',
      point: 'Spot elevation',
    };
    const count = project.entities.filter((entity) => entity.kind === kind).length + 1;
    const entity: DrawingEntity = {
      id: crypto.randomUUID(),
      kind,
      name: `${labels[kind]} ${count}`,
      points,
      closed,
      layer: LAYERS[kind],
      ...(bulges.some(Boolean) ? { bulges } : {}),
    };
    try {
      validateEntityCurves(entity);
      if (closed && Math.abs(entitySignedArea(entity)) < 1e-9) {
        setDrawingError('The boundary must enclose an area. Add another corner or curve.');
        return;
      }
    } catch (error) {
      setDrawingError(error instanceof Error ? error.message : 'This curve could not be created.');
      return;
    }
    onCreate(entity);
    onSelect(null);
    clearDraft();
  };
  const finish = () => {
    if (arcThrough) {
      setDrawingError(
        'Choose the arc endpoint before finishing, or switch to Line to discard the pending through point.',
      );
      return;
    }
    const closed = tool === 'boundary';
    if (draft.length >= (closed ? 3 : 2) && ['polyline', 'contour', 'boundary'].includes(tool)) {
      create(draft, tool as 'polyline' | 'contour' | 'boundary', closed, draftBulges);
    }
  };
  const fit = () => {
    if (!project.entities.length) {
      setTransientView(null);
      onViewChange({ centerX: 0, centerY: 0, scale: 8 });
      return;
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const entity of project.entities) {
      const bounds = entityBounds(entity);
      minX = Math.min(minX, bounds.minX);
      maxX = Math.max(maxX, bounds.maxX);
      minY = Math.min(minY, bounds.minY);
      maxY = Math.max(maxY, bounds.maxY);
    }
    const scale = Math.min(
      (size.width - 160) / Math.max(maxX - minX, 10),
      (size.height - 160) / Math.max(maxY - minY, 10),
    );
    setTransientView(null);
    onViewChange({
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
      scale: Math.max(0.05, Math.min(1000, scale)),
    });
  };
  useImperativeHandle(ref, () => ({
    finish,
    cancel: clearDraft,
    fit,
    place: (point) => {
      setSnapTargets([]);
      setHover(point);
      onCursorChange(point);
      placePoint(point, true);
    },
  }));
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSize({ width, height });
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    clearDraft();
  }, [tool, project.id]);
  useEffect(() => {
    // Switching segment types preserves completed segments, not an unfinished bend.
    setArcThrough(null);
    setDrawingError(null);
    onDraftChange(draft.length, false);
  }, [segmentMode]);
  useEffect(
    () => () => {
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    },
    [],
  );
  useEffect(() => {
    setTransientView(null);
  }, [project.id]);
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        setSuspendSnaps(true);
        setSnapTargets([]);
      }
      if ((event.target as HTMLElement).closest('input, textarea, select, form, [contenteditable]'))
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpaceDown(true);
      }
      if (event.key === 'Tab' && activeSnap && snapTargets.length > 1) {
        event.preventDefault();
        const index =
          (snapChoice + (event.shiftKey ? snapTargets.length - 1 : 1)) % snapTargets.length;
        setSnapChoice(index);
        const target = snapTargets[index];
        const point = {
          x: target.x,
          y: target.y,
          z: matchSnapElevation && target.z !== null ? target.z : elevation,
        };
        setHover(point);
        onCursorChange(point);
      }
      if (event.key === 'Escape') clearDraft();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceDown(false);
      if (event.key === 'Alt') setSuspendSnaps(false);
    };
    const blur = () => {
      setSpaceDown(false);
      setSuspendSnaps(false);
      setSnapTargets([]);
      if (drag?.kind === 'pan' && transientView) onViewChange(transientView);
      setTransientView(null);
      setDrag(null);
      setMovePreview(null);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  });
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button === 1 || tool === 'pan' || spaceDown) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ kind: 'pan', x: event.clientX, y: event.clientY, view: { ...view } });
      return;
    }
    if (event.button !== 0) return;
    event.currentTarget.focus({ preventScroll: true });
    if (tool === 'select') {
      onSelect(null);
      return;
    }
    const raw = world(event.clientX, event.clientY, false);
    const targets =
      objectSnaps && !event.altKey
        ? findSnapTargets(snapIndex, raw, 12 / view.scale, intersectionSnaps)
        : [];
    const target = targets.find((candidate) => candidate.key === activeSnap?.key) ?? targets[0];
    try {
      const point = target
        ? snapPlacement(target, elevation, matchSnapElevation)
        : world(event.clientX, event.clientY);
      placePoint(point, Boolean(target), Boolean(target) && matchSnapElevation);
    } catch (error) {
      setDrawingError(error instanceof Error ? error.message : 'This snap could not be used.');
    }
  };
  const placePoint = (point: Point, exact = false, acquiredElevation = false) => {
    if (['select', 'pan'].includes(tool)) return;
    if (Object.values(point).some((value) => !Number.isFinite(value) || Math.abs(value) > 1e12)) {
      setDrawingError('The point is outside the supported coordinate range.');
      return;
    }
    if (
      acquiredElevation &&
      draft.length === 0 &&
      (tool === 'contour' ||
        tool === 'building' ||
        tool === 'boundary-rect' ||
        (segmentMode === 'arc' && (tool === 'polyline' || tool === 'boundary')))
    )
      onElevationChange(point.z);
    if (tool === 'contour' && acquiredElevation && draft.length && point.z !== elevation) {
      setDrawingError(
        'This contour has one elevation. Turn off Match target elevation to snap XY only.',
      );
      return;
    }
    if (tool === 'point') {
      create([point], 'point', false);
      return;
    }
    if (tool === 'building' || tool === 'boundary-rect') {
      if (!draft.length) {
        setDraft([point]);
        onDraftChange(1);
      } else {
        const first = draft[0];
        if (acquiredElevation && point.z !== first.z) {
          setDrawingError(
            'This rectangle uses one drawing elevation. Turn off Match target elevation to snap XY only.',
          );
          return;
        }
        if (Math.abs(first.x - point.x) < 1e-9 || Math.abs(first.y - point.y) < 1e-9) return;
        create(
          [
            first,
            { x: point.x, y: first.y, z: elevation },
            point,
            { x: first.x, y: point.y, z: elevation },
          ],
          tool === 'building' ? 'building' : 'boundary',
          true,
        );
      }
      return;
    }
    if (draft.length && distance(draft[draft.length - 1], point) < 1e-9) return;
    if (['polyline', 'contour', 'boundary'].includes(tool)) {
      const hasArc = draftBulges.some(Boolean);
      if (
        tool !== 'contour' &&
        (segmentMode === 'arc' || hasArc) &&
        draft.some((vertex) => vertex.z !== point.z)
      ) {
        setDrawingError(
          `Curved paths need one elevation. Set Drawing elevation to ${draft[0].z}, or finish this line before starting an arc.`,
        );
        return;
      }
      if (segmentMode === 'arc' && draft.length) {
        if (!arcThrough) {
          setArcThrough(point);
          setDrawingError(null);
          onDraftChange(draft.length, true);
          return;
        }
        const closing =
          tool === 'boundary' &&
          draft.length >= 3 &&
          distance(draft[0], point) < (exact ? 1e-9 : 12 / view.scale);
        const end = closing ? draft[0] : point;
        const bulge = bulgeThroughPoint(draft.at(-1)!, arcThrough, end);
        if (bulge === null || bulge === 0) {
          setDrawingError(
            'These points do not define a circular arc. Choose a distinct endpoint away from the straight line.',
          );
          return;
        }
        const bulges = [...draftBulges];
        bulges[draft.length - 1] = bulge;
        if (closing) {
          create(draft, 'boundary', true, bulges);
        } else {
          setDraft([...draft, point]);
          setDraftBulges([...bulges, 0]);
          setArcThrough(null);
          setDrawingError(null);
          onDraftChange(draft.length + 1, false);
        }
        return;
      }
    }
    if (
      tool === 'boundary' &&
      draft.length >= 3 &&
      distance(draft[0], point) < (exact ? 1e-9 : 12 / view.scale)
    ) {
      finish();
      return;
    }
    setDraft([...draft, point]);
    setDraftBulges([...draftBulges, 0]);
    setDrawingError(null);
    onDraftChange(draft.length + 1);
  };
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const raw = world(event.clientX, event.clientY, false);
    const targets =
      objectSnaps && !event.altKey && !spaceDown && !drag && !['select', 'pan'].includes(tool)
        ? findSnapTargets(snapIndex, raw, 12 / view.scale, intersectionSnaps)
        : [];
    setSnapTargets(targets);
    setSnapChoice(0);
    const target = targets[0];
    const point = target
      ? {
          x: target.x,
          y: target.y,
          z: matchSnapElevation && target.z !== null ? target.z : elevation,
        }
      : world(event.clientX, event.clientY);
    setHover(point);
    onCursorChange(point);
    if (drag?.kind === 'pan') {
      setTransientView({
        ...drag.view,
        centerX: drag.view.centerX - (event.clientX - drag.x) / drag.view.scale,
        centerY: drag.view.centerY + (event.clientY - drag.y) / drag.view.scale,
      });
    }
    if (drag?.kind === 'entity' && drag.id) {
      let dx = (event.clientX - drag.x) / drag.view.scale;
      let dy = -(event.clientY - drag.y) / drag.view.scale;
      if (project.settings.snapToGrid) {
        const step = project.settings.gridSize;
        dx = Math.round(dx / step) * step;
        dy = Math.round(dy / step) * step;
      }
      setMovePreview({ id: drag.id, dx, dy });
    }
  };
  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag?.kind === 'entity' && movePreview && (movePreview.dx || movePreview.dy))
      onMove(movePreview.id, movePreview.dx, movePreview.dy);
    if (drag?.kind === 'pan' && transientView) {
      onViewChange(transientView);
      setTransientView(null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
    setMovePreview(null);
  };
  const wheel = (event: ReactWheelEvent<SVGSVGElement>) => {
    const before = world(event.clientX, event.clientY, false);
    const scale = Math.max(0.05, Math.min(1000, view.scale * Math.exp(-event.deltaY * 0.0015)));
    const ratio = view.scale / scale;
    const nextView = {
      scale,
      centerX: before.x - (before.x - view.centerX) * ratio,
      centerY: before.y - (before.y - view.centerY) * ratio,
    };
    setTransientView(nextView);
    if (wheelTimer.current) clearTimeout(wheelTimer.current);
    wheelTimer.current = setTimeout(() => {
      latestViewChange.current(nextView);
      setTransientView(null);
    }, 180);
  };
  const selectEntity = (event: ReactPointerEvent<SVGElement>, entity: DrawingEntity) => {
    if (tool !== 'select' || spaceDown || event.button !== 0) return;
    event.stopPropagation();
    onSelect(entity.id);
    const svg = event.currentTarget.ownerSVGElement;
    svg?.setPointerCapture(event.pointerId);
    setDrag({
      kind: 'entity',
      id: entity.id,
      x: event.clientX,
      y: event.clientY,
      view: { ...view },
    });
  };
  let gridStep = project.settings.gridSize;
  while (gridStep * view.scale < 16) gridStep *= 5;
  const gridPx = gridStep * view.scale;
  const origin = screen({ x: 0, y: 0 });
  const patternX = ((origin.x % gridPx) + gridPx) % gridPx;
  const patternY = ((origin.y % gridPx) + gridPx) % gridPx;
  const draftPreview = (() => {
    let points = draft;
    let bulges = draftBulges;
    if ((tool === 'building' || tool === 'boundary-rect') && hover) {
      if (!draft.length) return null;
      const first = draft[0];
      points = [
        first,
        { x: hover.x, y: first.y, z: elevation },
        hover,
        { x: first.x, y: hover.y, z: elevation },
        first,
      ];
      bulges = [];
    } else if (draft.length && hover) {
      const bulge = arcThrough ? bulgeThroughPoint(draft.at(-1)!, arcThrough, hover) : null;
      if (arcThrough && bulge !== null) {
        bulges = [...draftBulges];
        bulges[draft.length - 1] = bulge;
        bulges.push(0);
        points = [...draft, hover];
      } else {
        points = [...draft, ...(arcThrough ? [arcThrough] : []), hover];
        bulges = [...draftBulges, ...(arcThrough ? [0] : []), 0];
      }
    }
    return {
      id: 'draft',
      name: 'Draft',
      layer: '0',
      kind: 'polyline' as const,
      points,
      bulges,
      closed: false,
    };
  })();
  const scaleBarWorld =
    10 ** Math.floor(Math.log10(100 / view.scale)) *
    ([1, 2, 5, 10].find(
      (value) => value * 10 ** Math.floor(Math.log10(100 / view.scale)) * view.scale >= 70,
    ) ?? 10);

  return (
    <div className="drawing-canvas" ref={host} data-testid="drawing-canvas">
      <svg
        width="100%"
        height="100%"
        aria-label="Plan drawing canvas"
        role="application"
        tabIndex={0}
        className={`canvas-svg tool-${tool} ${spaceDown || drag?.kind === 'pan' ? 'is-panning' : ''}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => {
          setDrag(null);
          setMovePreview(null);
        }}
        onPointerLeave={() => {
          if (!drag) {
            onCursorChange(null);
            setHover(null);
            setSnapTargets([]);
          }
        }}
        onWheel={wheel}
        onDoubleClick={(event) => {
          event.preventDefault();
          finish();
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <defs>
          <pattern
            id="plan-grid"
            x={patternX}
            y={patternY}
            width={gridPx}
            height={gridPx}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${gridPx} 0 L 0 0 0 ${gridPx}`}
              fill="none"
              stroke="#dce1d9"
              strokeWidth="0.65"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#f7f8f4" />
        <rect width="100%" height="100%" fill="url(#plan-grid)" />
        {origin.x >= 0 && origin.x <= size.width && (
          <line
            x1={origin.x}
            x2={origin.x}
            y1="0"
            y2={size.height}
            stroke="#c5cec3"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
        )}
        {origin.y >= 0 && origin.y <= size.height && (
          <line
            y1={origin.y}
            y2={origin.y}
            x1="0"
            x2={size.width}
            stroke="#c5cec3"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
        )}
        {project.entities.map((entity) => {
          const offset = movePreview?.id === entity.id ? movePreview : { dx: 0, dy: 0 };
          const points = entity.points.map((p) => ({
            ...p,
            x: p.x + offset.dx,
            y: p.y + offset.dy,
          }));
          const selected = entity.id === selectedId;
          const color = selected ? '#c47b3f' : COLORS[entity.kind];
          const first = screen(points[0]);
          const label =
            entity.kind === 'contour'
              ? points[0].z.toFixed(2)
              : entity.kind === 'point'
                ? points[0].z.toFixed(2)
                : entity.name;
          const path = entitySvgPath({ ...entity, points }, screen, view.scale);
          return (
            <g
              key={entity.id}
              data-entity-id={entity.id}
              data-entity-kind={entity.kind}
              className={tool === 'select' ? 'selectable-entity' : ''}
            >
              {entity.kind === 'point' ? (
                <g onPointerDown={(event) => selectEntity(event, entity)}>
                  <circle cx={first.x} cy={first.y} r="14" fill="transparent" />
                  <path
                    d={`M ${first.x - 6} ${first.y} h 12 M ${first.x} ${first.y - 6} v 12`}
                    stroke={color}
                    strokeWidth="1.5"
                    pointerEvents="none"
                  />
                  <circle cx={first.x} cy={first.y} r="2" fill={color} pointerEvents="none" />
                </g>
              ) : (
                <>
                  {entity.closed && (
                    <path
                      d={path}
                      fill={entity.kind === 'building' ? '#53777b15' : '#305b4b07'}
                      stroke="none"
                      onPointerDown={(event) => selectEntity(event, entity)}
                    />
                  )}
                  <path
                    data-testid="feature-path"
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={selected ? 2.4 : entity.kind === 'boundary' ? 1.9 : 1.5}
                    strokeDasharray={entity.kind === 'boundary' ? '8 4' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="14"
                    onPointerDown={(event) => selectEntity(event, entity)}
                  />
                </>
              )}
              <text
                x={first.x + 10}
                y={first.y - 10}
                className={`canvas-feature-label ${entity.kind === 'contour' || entity.kind === 'point' ? 'numeric-label' : ''}`}
                fill={color}
                pointerEvents="none"
              >
                {label}
              </text>
              {selected &&
                points.map((point, i) => {
                  const p = screen(point);
                  return (
                    <rect
                      key={i}
                      x={p.x - 3.5}
                      y={p.y - 3.5}
                      width="7"
                      height="7"
                      fill="#fffdf7"
                      stroke="#c47b3f"
                      strokeWidth="1.5"
                      pointerEvents="none"
                    />
                  );
                })}
            </g>
          );
        })}
        {draftPreview && draftPreview.points.length > 1 && (
          <path
            data-testid="draft-path"
            d={entitySvgPath(draftPreview, screen, view.scale)}
            fill={tool === 'building' || tool === 'boundary-rect' ? '#305b4b0a' : 'none'}
            stroke="#c47b3f"
            strokeWidth="1.6"
            strokeDasharray="6 4"
            pointerEvents="none"
          />
        )}
        {draft.map((point, i) => {
          const p = screen(point);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill="#fffdf7"
              stroke="#c47b3f"
              strokeWidth="1.5"
              pointerEvents="none"
            />
          );
        })}
        {arcThrough && (
          <g pointerEvents="none" data-testid="arc-through-point">
            <circle cx={screen(arcThrough).x} cy={screen(arcThrough).y} r="5" fill="#c47b3f" />
            <text
              x={screen(arcThrough).x + 10}
              y={screen(arcThrough).y - 10}
              className="canvas-feature-label"
            >
              Through point
            </text>
          </g>
        )}
        {hover && !['select', 'pan'].includes(tool) && !drag && (
          <g pointerEvents="none">
            <rect
              x={screen(hover).x - 4}
              y={screen(hover).y - 4}
              width="8"
              height="8"
              fill="none"
              stroke="#c47b3f"
              strokeWidth="1"
            />
            <path
              d={`M ${screen(hover).x - 13} ${screen(hover).y} h 8 M ${screen(hover).x + 5} ${screen(hover).y} h 8 M ${screen(hover).x} ${screen(hover).y - 13} v 8 M ${screen(hover).x} ${screen(hover).y + 5} v 8`}
              stroke="#c47b3f"
              strokeWidth="0.8"
            />
          </g>
        )}
        {activeSnap && !drag && (
          <g
            pointerEvents="none"
            data-testid="snap-marker"
            stroke="#197b70"
            fill="#fffef4"
            strokeWidth="2"
          >
            {activeSnap.kind === 'midpoint' ? (
              <path d={`M ${screen(activeSnap).x} ${screen(activeSnap).y - 8} l 8 14 h -16 Z`} />
            ) : activeSnap.kind === 'center' || activeSnap.kind === 'point' ? (
              <circle cx={screen(activeSnap).x} cy={screen(activeSnap).y} r="7" />
            ) : activeSnap.kind === 'intersection' ? (
              <path
                d={`M ${screen(activeSnap).x - 7} ${screen(activeSnap).y - 7} l 14 14 m 0 -14 l -14 14`}
              />
            ) : (
              <rect
                x={screen(activeSnap).x - 6}
                y={screen(activeSnap).y - 6}
                width="12"
                height="12"
              />
            )}
          </g>
        )}
        <g
          transform={`translate(28 ${size.height - 30})`}
          className="canvas-scale"
          pointerEvents="none"
        >
          <path
            d={`M 0 -5 V 0 H ${scaleBarWorld * view.scale} V -5`}
            fill="none"
            stroke="#637368"
            strokeWidth="1.2"
          />
          <text x="0" y="-11">
            {scaleBarWorld} {project.units === 'meters' ? 'm' : 'ft'}
          </text>
        </g>
        <g transform={`translate(${size.width - 38} 44)`} pointerEvents="none">
          <text textAnchor="middle" y="-16" className="north-label">
            N
          </text>
          <path d="M 0 -7 L -5 10 L 0 6 L 5 10 Z" fill="#526a59" />
          <line y1="7" y2="28" stroke="#526a59" strokeWidth="1" />
        </g>
      </svg>
      {activeSnap && (
        <div className="canvas-snap-feedback" data-testid="snap-feedback" role="status">
          <strong>
            {activeSnap.kind === 'center'
              ? 'Arc center'
              : activeSnap.kind[0].toUpperCase() + activeSnap.kind.slice(1)}
          </strong>{' '}
          · {activeSnap.source}
          <span>
            {activeSnap.z === null ? 'Different source elevations' : `Source Z ${activeSnap.z}`} ·{' '}
            {matchSnapElevation ? 'Match XYZ' : 'XY only'}
          </span>
          {snapTargets.length > 1 && (
            <span>
              Tab cycles {snapChoice + 1}/{snapTargets.length}
            </span>
          )}
        </div>
      )}
      {(drawingError ||
        (segmentMode === 'arc' && ['polyline', 'contour', 'boundary'].includes(tool))) && (
        <div
          className={`canvas-curve-hint ${drawingError ? 'has-error' : ''}`}
          role={drawingError ? 'alert' : 'status'}
        >
          {drawingError ??
            (!draft.length
              ? 'Arc: choose the start point.'
              : arcThrough
                ? 'Choose the arc endpoint. The preview passes through the marked point.'
                : 'Choose a point on the arc, then its endpoint.')}
        </div>
      )}
      {!project.entities.length && !draft.length && (
        <div className="canvas-empty-hint" aria-hidden="true">
          <span className="eyebrow">YOUR LOT STARTS HERE</span>
          <h2>A clear space to work.</h2>
          <p>
            Choose a drawing tool, then click on the plan.
            <br />
            Your coordinates and elevations stay intact on export.
          </p>
        </div>
      )}
    </div>
  );
});
