import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  Copy,
  Crosshair,
  Download,
  Expand,
  FileDown,
  FolderOpen,
  Grid2X2,
  Hand,
  Layers,
  MapPin,
  MousePointer2,
  Pentagon,
  Plus,
  Redo2,
  Save,
  ScanLine,
  Slash,
  Square,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { DrawingEntity, Point, Project } from '../core/types';
import { UNIT_SYMBOLS } from '../core/types';
import { platform } from '../platform';
import { DrawingCanvas } from './DrawingCanvas';
import type { CanvasHandle, DrawingTool } from './DrawingCanvas';
import '../styles/workspace.css';

export interface WorkspaceProps {
  project: Project;
  onChange: (project: Project) => void;
  onBack: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onExport: () => void;
  onImport?: () => void;
  saveStatus: string;
}
const TOOL_INFO: Record<DrawingTool, { name: string; hint: string; shortcut: string }> = {
  select: {
    name: 'Select',
    hint: 'Click a feature to inspect it. Drag to move. Hold Space to pan.',
    shortcut: 'V',
  },
  pan: { name: 'Pan', hint: 'Drag to move around the plan. Scroll to zoom.', shortcut: 'H' },
  polyline: {
    name: 'Polyline',
    hint: 'Click to add vertices. Enter or double-click to finish. Esc to cancel.',
    shortcut: 'L',
  },
  contour: {
    name: 'Contour',
    hint: 'Set the elevation, then click to trace a contour. Enter to finish.',
    shortcut: 'C',
  },
  boundary: {
    name: 'Lot boundary',
    hint: 'Click boundary corners. Click the first point or Enter to close.',
    shortcut: 'B',
  },
  'boundary-rect': {
    name: 'Lot rectangle',
    hint: 'Click two opposite corners to draw a rectangular lot boundary.',
    shortcut: '',
  },
  building: {
    name: 'Building',
    hint: 'Click two opposite corners to draw a building footprint.',
    shortcut: 'R',
  },
  point: {
    name: 'Spot elevation',
    hint: 'Set the elevation, then click to place a spot.',
    shortcut: 'P',
  },
};
const ICONS = {
  select: MousePointer2,
  pan: Hand,
  polyline: Slash,
  contour: ScanLine,
  boundary: Pentagon,
  'boundary-rect': Square,
  building: Building2,
  point: MapPin,
};
const KIND_NAMES = {
  polyline: 'Polyline',
  contour: 'Contour',
  boundary: 'Boundary',
  building: 'Building',
  point: 'Spot elevation',
};
const cloneEntities = (entities: DrawingEntity[]) => structuredClone(entities);

function NumericField({
  value,
  label,
  suffix,
  onCommit,
  min,
  step = 'any',
  testId,
}: {
  value: number;
  label: string;
  suffix?: string;
  onCommit: (value: number) => void;
  min?: number;
  step?: string;
  testId?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const number = Number(text);
    if (
      text.trim() &&
      Number.isFinite(number) &&
      Math.abs(number) <= 1e12 &&
      (min === undefined || number >= min)
    ) {
      if (number !== value) onCommit(number);
    } else setText(String(value));
  };
  return (
    <label className="numeric-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          aria-label={label}
          data-testid={testId}
          value={text}
          min={min}
          step={step}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </div>
    </label>
  );
}

function TextField({
  value,
  label,
  onCommit,
  maxLength = 200,
  validate,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  validate?: (value: string) => string | null;
}) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(value);
    setError(null);
  }, [value]);
  return (
    <label className="text-field">
      <span>{label}</span>
      <input
        value={text}
        maxLength={maxLength}
        aria-label={label}
        aria-invalid={!!error}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          const next = text.trim();
          const message = !next ? 'Enter a value.' : validate?.(next);
          if (message) {
            setError(message);
            setText(value);
            return;
          }
          if (next !== value) onCommit(next);
          else setText(value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

export function Workspace({
  project,
  onChange,
  onBack,
  onSave,
  onSaveAs,
  onExport,
  onImport,
  saveStatus,
}: WorkspaceProps) {
  const [tool, setTool] = useState<DrawingTool>('select');
  const [elevation, setElevation] = useState(100);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [draftCount, setDraftCount] = useState(0);
  const [tab, setTab] = useState<'properties' | 'features'>('properties');
  const [menu, setMenu] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const history = useRef<{ past: DrawingEntity[][]; future: DrawingEntity[][] }>({
    past: [],
    future: [],
  });
  const canvas = useRef<CanvasHandle>(null);
  const selected = project.entities.find((entity) => entity.id === selectedId) ?? null;
  const unit = UNIT_SYMBOLS[project.units];
  const precision = (value: number) =>
    value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  useEffect(() => {
    history.current = { past: [], future: [] };
    setSelectedId(null);
    setHistoryVersion((value) => value + 1);
  }, [project.id]);
  const commit = (entities: DrawingEntity[]) => {
    history.current.past.push(cloneEntities(project.entities));
    if (history.current.past.length > 100) history.current.past.shift();
    history.current.future = [];
    setHistoryVersion((value) => value + 1);
    onChange({ ...project, entities, updatedAt: new Date().toISOString() });
  };
  const updateSelected = (changes: Partial<DrawingEntity>) => {
    if (selected)
      commit(
        project.entities.map((entity) =>
          entity.id === selected.id ? { ...entity, ...changes } : entity,
        ),
      );
  };
  const deleteSelected = () => {
    if (selected) {
      commit(project.entities.filter((entity) => entity.id !== selected.id));
      setSelectedId(null);
    }
  };
  const duplicateSelected = () => {
    if (!selected) return;
    const step = project.settings.gridSize * 2;
    const copy: DrawingEntity = {
      ...selected,
      id: crypto.randomUUID(),
      name: `${selected.name.slice(0, 195)} copy`,
      points: selected.points.map((p) => ({ ...p, x: p.x + step, y: p.y - step })),
    };
    commit([...project.entities, copy]);
    setSelectedId(copy.id);
  };
  const undo = () => {
    canvas.current?.cancel();
    const entities = history.current.past.pop();
    if (!entities) return;
    history.current.future.push(cloneEntities(project.entities));
    setHistoryVersion((value) => value + 1);
    onChange({ ...project, entities, updatedAt: new Date().toISOString() });
  };
  const redo = () => {
    canvas.current?.cancel();
    const entities = history.current.future.pop();
    if (!entities) return;
    history.current.past.push(cloneEntities(project.entities));
    setHistoryVersion((value) => value + 1);
    onChange({ ...project, entities, updatedAt: new Date().toISOString() });
  };
  useEffect(() =>
    platform.onMenuAction((action) => {
      if (action !== 'undo' && action !== 'redo') return;
      if (document.activeElement?.matches('input, textarea, [contenteditable]')) {
        document.execCommand(action);
      } else if (action === 'undo') undo();
      else redo();
    }),
  );
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const input = (event.target as HTMLElement).closest(
        'input, textarea, select, [contenteditable]',
      );
      if (event.metaKey || event.ctrlKey) {
        if (!input && event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) redo();
          else undo();
          return;
        }
        if (!input && event.key.toLowerCase() === 'y') {
          event.preventDefault();
          redo();
          return;
        }
        return;
      }
      if (input) return;
      const shortcuts: Record<string, DrawingTool> = {
        v: 'select',
        h: 'pan',
        l: 'polyline',
        c: 'contour',
        b: 'boundary',
        r: 'building',
        p: 'point',
      };
      const next = shortcuts[event.key.toLowerCase()];
      if (next) {
        event.preventDefault();
        setTool(next);
        if (next !== 'select') setSelectedId(null);
        setTab('properties');
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelected();
      }
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  });
  const patchSettings = (settings: Partial<Project['settings']>) =>
    onChange({
      ...project,
      settings: { ...project.settings, ...settings },
      updatedAt: new Date().toISOString(),
    });
  const selectTool = (next: DrawingTool) => {
    setTool(next);
    if (next !== 'select') setSelectedId(null);
    setTab('properties');
  };
  const selectFeature = (id: string | null) => {
    setSelectedId(id);
    if (id) setTab('properties');
  };
  const length =
    selected?.points.reduce((sum, point, i, points) => {
      if (i === 0) return sum;
      return sum + Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y);
    }, 0) ?? 0;
  const perimeter =
    selected?.closed && selected.points.length
      ? length +
        Math.hypot(
          selected.points.at(-1)!.x - selected.points[0].x,
          selected.points.at(-1)!.y - selected.points[0].y,
        )
      : length;
  const area = selected?.closed
    ? Math.abs(
        selected.points.reduce((sum, point, i, points) => {
          const next = points[(i + 1) % points.length];
          const origin = points[0];
          return (
            sum +
            (point.x - origin.x) * (next.y - origin.y) -
            (next.x - origin.x) * (point.y - origin.y)
          );
        }, 0) / 2,
      )
    : 0;
  void historyVersion;

  return (
    <main className="workspace" data-testid="workspace">
      <header className="workspace-header">
        <button className="workspace-back" onClick={onBack} aria-label="Back to projects">
          <ArrowLeft size={17} />
          <span>Projects</span>
        </button>
        <span className="header-divider" />
        <div className="workspace-project-title">
          <span className="workspace-version">
            LOTGRADE <span>v0</span>
          </span>
          <h1>{project.name}</h1>
        </div>
        <div className="workspace-header-actions">
          <span className="save-status">
            <span className="status-dot" />
            {saveStatus}
          </span>
          <div className="save-button-group">
            <button className="workspace-btn" onClick={onSave}>
              <Save size={15} />
              Save project
            </button>
            <button
              className="workspace-btn save-more"
              aria-label="More save options"
              onClick={() => setMenu(!menu)}
            >
              <ChevronDown size={13} />
            </button>
            {menu && (
              <div className="workspace-dropdown">
                <button
                  onClick={() => {
                    onSaveAs();
                    setMenu(false);
                  }}
                >
                  <FileDown size={15} />
                  Save project as…
                </button>
                {onImport && (
                  <button
                    onClick={() => {
                      onImport();
                      setMenu(false);
                    }}
                  >
                    <FolderOpen size={15} />
                    Open project file…
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            className="workspace-btn workspace-btn-primary"
            onClick={onExport}
            data-testid="export-dxf"
          >
            <Download size={15} />
            Export DXF
            <ArrowUpRight size={13} />
          </button>
        </div>
      </header>
      <div className="workspace-toolbar">
        <div className="toolbar-section">
          <span className="toolbar-label">PLAN WORKSPACE</span>
          <span className="view-badge">2D</span>
        </div>
        <div className="toolbar-section toolbar-history">
          <button
            aria-label="Undo"
            title="Undo (⌘/Ctrl Z)"
            disabled={!history.current.past.length}
            onClick={undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            aria-label="Redo"
            title="Redo (⌘/Ctrl Shift Z)"
            disabled={!history.current.future.length}
            onClick={redo}
          >
            <Redo2 size={17} />
          </button>
          <span className="toolbar-divider" />
          <button
            title="Fit drawing to view"
            aria-label="Fit drawing"
            onClick={() => canvas.current?.fit()}
          >
            <Expand size={16} />
          </button>
        </div>
        <div className="toolbar-section toolbar-settings">
          <button
            className={`snap-toggle ${project.settings.snapToGrid ? 'active' : ''}`}
            aria-pressed={project.settings.snapToGrid}
            onClick={() => patchSettings({ snapToGrid: !project.settings.snapToGrid })}
          >
            <Grid2X2 size={14} />
            Grid snap<span>{project.settings.snapToGrid ? 'ON' : 'OFF'}</span>
          </button>
          <span className="toolbar-divider" />
          <span className="project-units">
            {project.units === 'meters'
              ? 'METERS'
              : project.units === 'us-survey-feet'
                ? 'US SURVEY FEET'
                : 'FEET'}
          </span>
        </div>
      </div>
      <div className="workspace-body">
        <nav className="drawing-tools" aria-label="Drawing tools">
          {(
            [
              'select',
              'pan',
              'polyline',
              'contour',
              'boundary',
              'building',
              'point',
            ] as DrawingTool[]
          ).map((item, i) => {
            const Icon = ICONS[item];
            const active = tool === item || (item === 'boundary' && tool === 'boundary-rect');
            return (
              <div key={item}>
                {i === 2 && <div className="tool-separator" />}
                <button
                  className={`drawing-tool ${active ? 'active' : ''}`}
                  aria-label={TOOL_INFO[item].name}
                  aria-pressed={active}
                  title={`${TOOL_INFO[item].name} (${TOOL_INFO[item].shortcut})`}
                  onClick={() => selectTool(item)}
                  data-testid={`tool-${item}`}
                >
                  <Icon size={20} strokeWidth={1.6} />
                  <span>
                    {item === 'boundary'
                      ? 'Boundary'
                      : item === 'point'
                        ? 'Spot'
                        : TOOL_INFO[item].name}
                  </span>
                </button>
              </div>
            );
          })}
          <div className="tools-bottom">
            <span className="tool-version">V.0</span>
          </div>
        </nav>
        <section className="canvas-region" aria-label="Drawing workspace">
          <div className="canvas-context">
            <span className="canvas-context-dot" />
            <span>{TOOL_INFO[tool].name}</span>
            {!['select', 'pan'].includes(tool) && (
              <>
                <span className="context-divider" />
                <span className="context-elevation">
                  EL. {precision(elevation)} {unit}
                </span>
              </>
            )}
          </div>
          <DrawingCanvas
            ref={canvas}
            project={project}
            tool={tool}
            elevation={elevation}
            selectedId={selectedId}
            onSelect={selectFeature}
            onCreate={(entity) => commit([...project.entities, entity])}
            onMove={(id, dx, dy) =>
              commit(
                project.entities.map((entity) =>
                  entity.id === id
                    ? {
                        ...entity,
                        points: entity.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
                      }
                    : entity,
                ),
              )
            }
            onViewChange={(view) => onChange({ ...project, view })}
            onCursorChange={setCursor}
            onDraftChange={setDraftCount}
          />
          {draftCount > 0 && (
            <div className="draft-actions">
              <span>
                {draftCount} {draftCount === 1 ? 'point' : 'points'} placed
              </span>
              {['polyline', 'contour', 'boundary'].includes(tool) && (
                <button
                  onClick={() => canvas.current?.finish()}
                  disabled={draftCount < (tool === 'boundary' ? 3 : 2)}
                >
                  <Check size={14} />
                  Finish{tool === 'boundary' ? ' boundary' : ' line'}
                </button>
              )}
              <button
                className="draft-cancel"
                onClick={() => canvas.current?.cancel()}
                aria-label="Cancel drawing"
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="canvas-zoom-controls">
            <button
              aria-label="Zoom in"
              onClick={() =>
                onChange({
                  ...project,
                  view: { ...project.view, scale: Math.min(1000, project.view.scale * 1.25) },
                })
              }
            >
              <ZoomIn size={17} />
            </button>
            <button
              aria-label="Zoom out"
              onClick={() =>
                onChange({
                  ...project,
                  view: { ...project.view, scale: Math.max(0.05, project.view.scale / 1.25) },
                })
              }
            >
              <ZoomOut size={17} />
            </button>
            <span />
            <button aria-label="Fit drawing to view" onClick={() => canvas.current?.fit()}>
              <Expand size={16} />
            </button>
          </div>
        </section>
        <aside className="drawing-inspector" aria-label="Drawing properties">
          <div className="inspector-tabs">
            <button
              className={tab === 'properties' ? 'active' : ''}
              onClick={() => setTab('properties')}
            >
              Properties
            </button>
            <button
              className={tab === 'features' ? 'active' : ''}
              onClick={() => setTab('features')}
            >
              Features<span>{project.entities.length}</span>
            </button>
          </div>
          {tab === 'features' ? (
            <div className="feature-list">
              <div className="inspector-section-heading">
                <Layers size={14} />
                <span>DRAWING FEATURES</span>
              </div>
              {project.entities.length ? (
                project.entities.map((entity) => {
                  const Icon = ICONS[entity.kind === 'point' ? 'point' : entity.kind];
                  return (
                    <button
                      key={entity.id}
                      className={`feature-row ${entity.id === selectedId ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedId(entity.id);
                        setTool('select');
                        setTab('properties');
                      }}
                    >
                      <Icon size={16} />
                      <span>
                        <strong>{entity.name}</strong>
                        <small>
                          {KIND_NAMES[entity.kind]} · {entity.points.length}{' '}
                          {entity.points.length === 1 ? 'vertex' : 'vertices'}
                        </small>
                      </span>
                      <span className="feature-elevation">{precision(entity.points[0].z)}</span>
                    </button>
                  );
                })
              ) : (
                <div className="inspector-empty">
                  <Layers size={26} strokeWidth={1} />
                  <p>
                    Your drawing features
                    <br />
                    will appear here.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="inspector-content">
              {selected ? (
                <>
                  <div className="inspector-selection-heading">
                    <span className={`feature-kind-dot kind-${selected.kind}`} />
                    <span>{KIND_NAMES[selected.kind].toUpperCase()}</span>
                    <button aria-label="Clear selection" onClick={() => setSelectedId(null)}>
                      <X size={14} />
                    </button>
                  </div>
                  <TextField
                    label="Feature name"
                    value={selected.name}
                    onCommit={(name) => updateSelected({ name })}
                  />
                  <NumericField
                    label={
                      selected.points.every((p) => p.z === selected.points[0].z)
                        ? 'Elevation'
                        : 'Set all elevations'
                    }
                    value={selected.points[0].z}
                    suffix={unit}
                    onCommit={(z) =>
                      updateSelected({ points: selected.points.map((point) => ({ ...point, z })) })
                    }
                  />
                  <TextField
                    label="DXF layer"
                    value={selected.layer}
                    maxLength={100}
                    validate={(layer) =>
                      /[<>/\\":;?*|=,\u0000-\u001f\u007f]/.test(layer)
                        ? 'Use a layer name without punctuation such as commas or colons.'
                        : null
                    }
                    onCommit={(layer) => updateSelected({ layer })}
                  />
                  <div className="feature-measurements">
                    <div>
                      <span>Vertices</span>
                      <strong>{selected.points.length}</strong>
                    </div>
                    {selected.kind !== 'point' && (
                      <div>
                        <span>{selected.closed ? 'Perimeter' : 'Length'}</span>
                        <strong>
                          {precision(perimeter)} <small>{unit}</small>
                        </strong>
                      </div>
                    )}
                    {selected.closed && (
                      <div>
                        <span>Area</span>
                        <strong>
                          {precision(area)} <small>{unit}²</small>
                        </strong>
                      </div>
                    )}
                  </div>
                  <details className="vertex-details">
                    <summary>
                      Vertex coordinates
                      <ChevronDown size={13} />
                    </summary>
                    <div>
                      {selected.points.map((point, index) => (
                        <div className="vertex-editor" key={`${selected.id}-${index}`}>
                          <span className="vertex-number">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <div>
                            {(['x', 'y', 'z'] as const).map((axis) => (
                              <NumericField
                                key={axis}
                                label={`${axis.toUpperCase()} · vertex ${index + 1}`}
                                value={point[axis]}
                                onCommit={(value) =>
                                  updateSelected({
                                    points: selected.points.map((p, i) =>
                                      (selected.kind === 'contour' && axis === 'z') || i === index
                                        ? { ...p, [axis]: value }
                                        : p,
                                    ),
                                  })
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                  <div className="inspector-object-actions">
                    <button onClick={duplicateSelected}>
                      <Copy size={14} />
                      Duplicate
                    </button>
                    <button
                      className="danger-text"
                      onClick={deleteSelected}
                      aria-label="Delete selected feature"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="inspector-tool-heading">
                    <span className="eyebrow">DRAWING TOOL</span>
                    <h2>{TOOL_INFO[tool].name}</h2>
                    <p>{TOOL_INFO[tool].hint}</p>
                  </div>
                  {!['select', 'pan'].includes(tool) && (
                    <>
                      <NumericField
                        label="Drawing elevation"
                        value={elevation}
                        suffix={unit}
                        onCommit={setElevation}
                        testId="drawing-elevation"
                      />
                      {(tool === 'boundary' || tool === 'boundary-rect') && (
                        <div className="shape-mode">
                          <span>Boundary shape</span>
                          <div>
                            <button
                              className={tool === 'boundary' ? 'active' : ''}
                              onClick={() => setTool('boundary')}
                            >
                              <Pentagon size={14} />
                              Polygon
                            </button>
                            <button
                              className={tool === 'boundary-rect' ? 'active' : ''}
                              onClick={() => setTool('boundary-rect')}
                            >
                              <Square size={14} />
                              Rectangle
                            </button>
                          </div>
                        </div>
                      )}
                      {tool === 'contour' && (
                        <div className="elevation-step-buttons">
                          <button
                            onClick={() =>
                              setElevation(elevation - project.settings.contourInterval)
                            }
                          >
                            − {project.settings.contourInterval} {unit}
                          </button>
                          <button
                            onClick={() =>
                              setElevation(elevation + project.settings.contourInterval)
                            }
                          >
                            <Plus size={13} />
                            {project.settings.contourInterval} {unit}
                          </button>
                        </div>
                      )}
                      <div className="drawing-note">
                        <Crosshair size={15} />
                        <p>Elevations are preserved in your Civil 3D DXF export.</p>
                      </div>
                    </>
                  )}
                  {tool === 'select' && (
                    <div className="inspector-empty">
                      <MousePointer2 size={30} strokeWidth={1} />
                      <p>
                        Select a feature on the plan
                        <br />
                        to edit its properties.
                      </p>
                      <button onClick={() => setTab('features')}>
                        Browse {project.entities.length} features
                        <ArrowUpRight size={12} />
                      </button>
                    </div>
                  )}
                  <div className="inspector-section-heading settings-heading">
                    <Grid2X2 size={14} />
                    <span>DRAWING SETTINGS</span>
                  </div>
                  <NumericField
                    label="Grid spacing"
                    value={project.settings.gridSize}
                    min={0.001}
                    suffix={unit}
                    onCommit={(gridSize) => patchSettings({ gridSize })}
                  />
                  <NumericField
                    label="Contour step"
                    value={project.settings.contourInterval}
                    min={0.001}
                    suffix={unit}
                    onCommit={(contourInterval) => patchSettings({ contourInterval })}
                  />
                  <div className="inspector-scope-note">
                    <span className="eyebrow">VERSION 0</span>
                    <p>
                      Draw and edit elevated linework. Automated surface grading is coming in a
                      later version.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
          <div className="inspector-export-note">
            <Check size={13} />
            <span>All drawing tools support DXF export</span>
          </div>
        </aside>
      </div>
      <footer className="workspace-statusbar">
        <div className="tool-help">
          <span className="status-dot" />
          <span>{TOOL_INFO[tool].hint}</span>
        </div>
        <div className="coordinate-readout">
          <span>
            E <strong>{cursor ? precision(cursor.x) : '—'}</strong>
          </span>
          <span>
            N <strong>{cursor ? precision(cursor.y) : '—'}</strong>
          </span>
          <span>
            Z <strong>{precision(elevation)}</strong>
          </span>
          <span className="coordinate-unit">{unit}</span>
        </div>
      </footer>
    </main>
  );
}

export default Workspace;
