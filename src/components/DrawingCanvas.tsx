import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { DrawingEntity, Point, Project } from '../core/types';
import { LAYERS } from '../core/types';

export type DrawingTool =
  'select' | 'pan' | 'polyline' | 'contour' | 'boundary' | 'boundary-rect' | 'building' | 'point';
export interface CanvasHandle {
  finish: () => void;
  cancel: () => void;
  fit: () => void;
}
interface DrawingCanvasProps {
  project: Project;
  tool: DrawingTool;
  elevation: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCreate: (entity: DrawingEntity) => void;
  onMove: (id: string, dx: number, dy: number) => void;
  onViewChange: (view: Project['view']) => void;
  onCursorChange: (point: Point | null) => void;
  onDraftChange: (count: number) => void;
}

const COLORS: Record<DrawingEntity['kind'], string> = {
  polyline: '#697c87',
  contour: '#946a46',
  boundary: '#305b4b',
  building: '#53777b',
  point: '#a16549',
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const signedArea = (points: Point[]) =>
  points.reduce((sum, p, i) => {
    const next = points[(i + 1) % points.length];
    const origin = points[0];
    return sum + (p.x - origin.x) * (next.y - origin.y) - (next.x - origin.x) * (p.y - origin.y);
  }, 0) / 2;

export const DrawingCanvas = forwardRef<CanvasHandle, DrawingCanvasProps>(function DrawingCanvas(
  {
    project,
    tool,
    elevation,
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
  const [hover, setHover] = useState<Point | null>(null);
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
    setHover(null);
    onDraftChange(0);
  };
  const create = (points: Point[], kind: DrawingEntity['kind'], closed: boolean) => {
    if (kind === 'contour') points = points.map((point) => ({ ...point, z: elevation }));
    if (closed && Math.abs(signedArea(points)) < 1e-9) return;
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
    };
    onCreate(entity);
    onSelect(null);
    clearDraft();
  };
  const finish = () => {
    const closed = tool === 'boundary';
    if (draft.length >= (closed ? 3 : 2) && ['polyline', 'contour', 'boundary'].includes(tool)) {
      create(draft, tool as 'polyline' | 'contour' | 'boundary', closed);
    }
  };
  const fit = () => {
    const points = project.entities.flatMap((entity) => entity.points);
    if (!points.length) {
      setTransientView(null);
      onViewChange({ centerX: 0, centerY: 0, scale: 8 });
      return;
    }
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
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
  useImperativeHandle(ref, () => ({ finish, cancel: clearDraft, fit }));
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
      if ((event.target as HTMLElement).closest('input, textarea, select, [contenteditable]'))
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpaceDown(true);
      }
      if (event.key === 'Escape') clearDraft();
      if (event.key === 'Enter') {
        event.preventDefault();
        finish();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceDown(false);
    };
    const blur = () => {
      setSpaceDown(false);
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
    const point = world(event.clientX, event.clientY);
    if (tool === 'select') {
      onSelect(null);
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
    if (tool === 'boundary' && draft.length >= 3 && distance(draft[0], point) * view.scale < 12) {
      finish();
      return;
    }
    setDraft([...draft, point]);
    onDraftChange(draft.length + 1);
  };
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const point = world(event.clientX, event.clientY);
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
  const draftPoints = (() => {
    if (!draft.length) return [];
    if ((tool === 'building' || tool === 'boundary-rect') && hover) {
      const first = draft[0];
      return [
        first,
        { x: hover.x, y: first.y, z: elevation },
        hover,
        { x: first.x, y: hover.y, z: elevation },
        first,
      ];
    }
    return hover ? [...draft, hover] : draft;
  })();
  const pointString = (points: Point[]) =>
    points
      .map((p) => {
        const s = screen(p);
        return `${s.x},${s.y}`;
      })
      .join(' ');
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
          const geometry = entity.closed ? [...points, points[0]] : points;
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
                    <polygon
                      points={pointString(points)}
                      fill={entity.kind === 'building' ? '#53777b15' : '#305b4b07'}
                      stroke="none"
                      onPointerDown={(event) => selectEntity(event, entity)}
                    />
                  )}
                  <polyline
                    points={pointString(geometry)}
                    fill="none"
                    stroke={color}
                    strokeWidth={selected ? 2.4 : entity.kind === 'boundary' ? 1.9 : 1.5}
                    strokeDasharray={entity.kind === 'boundary' ? '8 4' : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                  <polyline
                    points={pointString(geometry)}
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
        {draftPoints.length > 1 && (
          <polyline
            points={pointString(draftPoints)}
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
