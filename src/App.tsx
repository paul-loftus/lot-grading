import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ChevronDown,
  Copy,
  FileUp,
  FolderOpen,
  Layers3,
  LayoutGrid,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import Workspace from './components/Workspace';
import { createDemoProject, createProject, validateProject } from './core/project';
import { UNIT_LABELS, type Project, type Units } from './core/types';
import { isDesktop, platform } from './platform';

function relativeDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function MiniPlan({ project }: { project?: Project }) {
  const entities = project?.entities ?? [];
  const points = entities.flatMap((entity) => entity.points);
  const bounds = points.reduce(
    (b, p) => ({
      minX: Math.min(b.minX, p.x),
      minY: Math.min(b.minY, p.y),
      maxX: Math.max(b.maxX, p.x),
      maxY: Math.max(b.maxY, p.y),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  const minX = points.length ? bounds.minX : 0;
  const minY = points.length ? bounds.minY : 0;
  const width = points.length ? bounds.maxX - minX : 100;
  const height = points.length ? bounds.maxY - minY : 120;
  const margin = Math.max(width, height, 20) * 0.15;
  return (
    <svg
      className="mini-plan"
      viewBox={`${minX - margin} ${-minY - height - margin} ${width + 2 * margin || 20} ${height + 2 * margin || 20}`}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id={`grid-${project?.id ?? 'empty'}`}
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="0" cy="0" r=".3" fill="#bdc9b9" />
        </pattern>
      </defs>
      <rect
        x={minX - margin}
        y={-minY - height - margin}
        width={width + margin * 2}
        height={height + margin * 2}
        fill={`url(#grid-${project?.id ?? 'empty'})`}
      />
      {entities.map((entity) =>
        entity.kind === 'point' ? (
          <circle
            key={entity.id}
            cx={entity.points[0].x}
            cy={-entity.points[0].y}
            r={Math.max(width, height) * 0.012}
            fill="#4a7361"
          />
        ) : (
          <polyline
            key={entity.id}
            points={[...entity.points, ...(entity.closed ? [entity.points[0]] : [])]
              .map((p) => `${p.x},${-p.y}`)
              .join(' ')}
            fill={entity.kind === 'building' ? '#dce5d5' : 'none'}
            stroke={entity.kind === 'contour' ? '#8b9f80' : '#45654f'}
            strokeWidth={Math.max(width, height) * 0.006}
            strokeDasharray={entity.kind === 'boundary' ? '2 2' : undefined}
          />
        ),
      )}
      {!entities.length && (
        <g stroke="#9aab91" fill="none" strokeWidth="1">
          <path d="M15 -20L75 -20L75 -100L15 -100Z" strokeDasharray="3 3" />
          <path d="M33 -44H58V-75H33Z" />
          <path d="M5 -32Q45 -20 85 -40M5 -85Q45 -110 85 -93" />
        </g>
      )}
    </svg>
  );
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [dialog, setDialog] = useState<'new' | 'rename' | 'delete' | null>(null);
  const [target, setTarget] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [units, setUnits] = useState<Units>('feet');
  const [menu, setMenu] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [saveStatus, setSaveStatus] = useState('Saved to library');
  const activeRef = useRef(active);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const saveSequence = useRef(0);
  activeRef.current = active;

  const notifyError = useCallback(
    (error: unknown) =>
      setMessage(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      ),
    [],
  );
  useEffect(() => {
    platform
      .listProjects()
      .then(setProjects)
      .catch(notifyError)
      .finally(() => setLoading(false));
  }, [notifyError]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 7000);
    return () => clearTimeout(timer);
  }, [message]);

  const persist = useCallback(
    (project: Project): Promise<void> => {
      const valid = validateProject(project);
      const sequence = ++saveSequence.current;
      setSaveStatus('Saving…');
      setProjects((previous) => [...previous.filter((p) => p.id !== valid.id), valid]);
      const pending = writes.current.catch(() => {}).then(() => platform.saveProject(valid));
      writes.current = pending;
      pending
        .then(() => {
          if (sequence === saveSequence.current) setSaveStatus('Saved to library');
        })
        .catch((error) => {
          setSaveStatus('Save failed');
          notifyError(error);
        });
      return pending;
    },
    [notifyError],
  );
  const change = useCallback(
    (project: Project) => {
      try {
        const valid = validateProject({ ...project, updatedAt: new Date().toISOString() });
        activeRef.current = valid;
        setActive(valid);
        void persist(valid);
      } catch (error) {
        notifyError(error);
      }
    },
    [persist, notifyError],
  );
  const open = useCallback(async (project: Project) => {
    await writes.current.catch(() => {});
    setActive(project);
    activeRef.current = project;
    setMenu(null);
    setSaveStatus('Saved to library');
  }, []);
  const save = useCallback(async () => {
    try {
      if (activeRef.current) await persist(activeRef.current);
    } catch {
      /* persist reports the failure */
    }
  }, [persist]);
  const saveAs = useCallback(async () => {
    try {
      const project = activeRef.current;
      if (!project) return;
      const snapshot = validateProject(project);
      void persist(snapshot);
      const result = await platform.saveProjectFile(snapshot);
      if (result)
        setMessage('Project copy saved. Open the .lotgrade file on either Mac or Windows.');
    } catch (error) {
      notifyError(error);
    }
  }, [persist, notifyError]);
  const exportProject = useCallback(async () => {
    try {
      const project = activeRef.current;
      if (!project) return;
      const snapshot = validateProject(project);
      // A library failure must never prevent exporting valid in-memory work.
      void persist(snapshot);
      const result = await platform.exportDxf(snapshot);
      if (result)
        setMessage(
          'DXF exported with original coordinates and elevations. Open it directly in Civil 3D.',
        );
    } catch (error) {
      notifyError(error);
    }
  }, [persist, notifyError]);
  const importProject = useCallback(async () => {
    try {
      const imported = await platform.openProjectFile();
      if (!imported) return;
      const existing = projects.some((p) => p.id === imported.id);
      const copy = {
        ...imported,
        id: existing ? crypto.randomUUID() : imported.id,
        name: existing ? `${imported.name.slice(0, 105)} (imported)` : imported.name,
        updatedAt: new Date().toISOString(),
      };
      await persist(copy);
      await open(copy);
      setMessage('Project imported into your local library.');
    } catch (error) {
      notifyError(error);
    }
  }, [projects, persist, open, notifyError]);
  const newProject = useCallback(() => {
    setName('');
    setDescription('');
    setUnits('feet');
    setTarget(null);
    setDialog('new');
  }, []);
  const back = useCallback(async () => {
    try {
      if (activeRef.current) await persist(activeRef.current);
      setActive(null);
      activeRef.current = null;
    } catch {
      /* remain in drawing if saving failed */
    }
  }, [persist]);

  useEffect(
    () =>
      platform.onMenuAction((action) => {
        if (action === 'new') newProject();
        if (action === 'open') void importProject();
        if (action === 'save') void save();
        if (action === 'save-as') void saveAs();
        if (action === 'export') void exportProject();
        if (action === 'close') {
          void (async () => {
            try {
              if (activeRef.current) await persist(activeRef.current);
              await writes.current;
              await platform.closeWindow();
            } catch (error) {
              notifyError(error);
            }
          })();
        }
      }),
    [newProject, importProject, save, saveAs, exportProject, persist, notifyError],
  );
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (event.shiftKey) void saveAs();
        else void save();
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [save, saveAs]);

  const visible = useMemo(
    () =>
      projects
        .filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) =>
          sort === 'name'
            ? a.name.localeCompare(b.name)
            : Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
        ),
    [projects, search, sort],
  );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (dialog === 'new') {
        const project = createProject(name, units, description);
        await persist(project);
        setDialog(null);
        await open(project);
      } else if (dialog === 'rename' && target) {
        const project = {
          ...target,
          name: name.trim(),
          description: description.trim(),
          updatedAt: new Date().toISOString(),
        };
        await persist(project);
        if (active?.id === project.id) setActive(project);
        setDialog(null);
      }
    } catch (error) {
      notifyError(error);
    }
  }
  async function duplicate(project: Project) {
    try {
      const now = new Date().toISOString();
      const copy = {
        ...structuredClone(project),
        id: crypto.randomUUID(),
        name: project.name.slice(0, 110) + ' (copy)',
        createdAt: now,
        updatedAt: now,
      };
      await persist(copy);
      setMenu(null);
      setMessage('Project duplicated.');
    } catch (error) {
      notifyError(error);
    }
  }
  async function remove() {
    if (!target) return;
    try {
      await writes.current.catch(() => {});
      await platform.deleteProject(target.id);
      setProjects((previous) => previous.filter((p) => p.id !== target.id));
      setDialog(null);
      setTarget(null);
      setMenu(null);
    } catch (error) {
      notifyError(error);
    }
  }
  async function explore() {
    try {
      const demo = createDemoProject();
      await persist(demo);
      await open(demo);
    } catch (error) {
      notifyError(error);
    }
  }

  return (
    <>
      {active ? (
        <Workspace
          key={active.id}
          project={active}
          onChange={change}
          onBack={() => void back()}
          onSave={() => void save()}
          onSaveAs={() => void saveAs()}
          onExport={() => void exportProject()}
          onImport={() => void importProject()}
          saveStatus={saveStatus}
        />
      ) : (
        <div className="dashboard">
          <aside className="sidebar">
            <a
              className="brand"
              href="#"
              onClick={(e) => e.preventDefault()}
              aria-label="LotGrade home"
            >
              <span className="brand-mark">
                <Layers3 size={21} />
              </span>
              LotGrade<span className="version-tag">v0</span>
            </a>
            <div className="sidebar-section">WORKSPACE</div>
            <button className="nav-item active">
              <FolderOpen size={18} />
              All projects<span>{projects.length}</span>
            </button>
            <button className="nav-item" onClick={() => void importProject()}>
              <FileUp size={18} />
              Open project file
            </button>
            <div className="sidebar-bottom">
              <div className="local-indicator" />
              <div>
                <strong>Your workspace, locally.</strong>
                <p>
                  {isDesktop
                    ? 'Projects stay on this computer.'
                    : 'Browser preview · stored in this browser.'}
                </p>
              </div>
            </div>
            <div className="sidebar-footer">A little more clarity.</div>
          </aside>
          <main className="project-main">
            <header className="dashboard-top">
              <span>
                <span className="breadcrumb-muted">Workspace</span>
                <span className="breadcrumb-slash">/</span>Projects
              </span>
              <span className="private-badge">
                <span />
                Local workspace
              </span>
            </header>
            <div className="project-content">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">A CLEAR PLACE TO START</div>
                  <h1>
                    Your projects<span>.</span>
                  </h1>
                  <p>Room to draw. Space to think. Every lot in one place.</p>
                </div>
                <button className="primary-button" onClick={newProject}>
                  <Plus size={18} />
                  New project
                </button>
              </div>
              <section className="welcome-card">
                <div className="welcome-copy">
                  <span className="tiny-label">
                    <MapPin size={14} />
                    BUILT AROUND THE LOT
                  </span>
                  <h2>
                    From a blank canvas
                    <br />
                    to a clearer plan.
                  </h2>
                  <p>
                    Draw lot lines, sketch contours, and place elevations.
                    <br />
                    Take your work straight into Civil 3D with DXF export.
                  </p>
                  <button className="text-button" onClick={() => void explore()}>
                    Explore an example project
                    <ArrowRight size={17} />
                  </button>
                </div>
                <div className="welcome-art">
                  <MiniPlan project={undefined} />
                  <div className="art-tag">
                    <span />
                    YOUR NEXT LOT STARTS HERE
                  </div>
                </div>
              </section>
              <section className="projects-section">
                <div className="section-heading">
                  <h2>
                    All projects <span>{projects.length}</span>
                  </h2>
                  <div className="project-controls">
                    <label className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Search projects"
                        placeholder="Find a project…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <label className="sort-control">
                      <select
                        aria-label="Sort projects"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="recent">Last updated</option>
                        <option value="name">Project name</option>
                      </select>
                      <ChevronDown size={14} />
                    </label>
                    <span className="grid-indicator">
                      <LayoutGrid size={17} />
                    </span>
                  </div>
                </div>
                {loading ? (
                  <div className="empty-state">Opening your workspace…</div>
                ) : (
                  <div className="project-grid">
                    {visible.map((project) => (
                      <article className="project-card" key={project.id}>
                        <button
                          className="project-thumbnail"
                          onClick={() => void open(project)}
                          aria-label={`Open ${project.name}`}
                        >
                          <MiniPlan project={project} />
                          <span className="thumbnail-unit">{UNIT_LABELS[project.units]}</span>
                          <span className="thumbnail-open">
                            <ArrowRight size={17} />
                          </span>
                        </button>
                        <div className="project-card-body">
                          <div className="project-card-title">
                            <button onClick={() => void open(project)}>{project.name}</button>
                            <div className="project-menu-anchor">
                              <button
                                className="icon-button"
                                aria-label={`Options for ${project.name}`}
                                onClick={() => setMenu(menu === project.id ? null : project.id)}
                              >
                                <MoreHorizontal size={19} />
                              </button>
                              {menu === project.id && (
                                <div className="project-menu">
                                  <button
                                    onClick={() => {
                                      setTarget(project);
                                      setName(project.name);
                                      setDescription(project.description);
                                      setDialog('rename');
                                      setMenu(null);
                                    }}
                                  >
                                    Rename / details
                                  </button>
                                  <button onClick={() => void duplicate(project)}>
                                    <Copy size={14} />
                                    Duplicate
                                  </button>
                                  <button
                                    onClick={() => {
                                      setTarget(project);
                                      setDialog('delete');
                                      setMenu(null);
                                    }}
                                  >
                                    <Trash2 size={14} />
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          <p>{project.description || 'A fresh start for your next lot.'}</p>
                          <div className="project-card-meta">
                            <span>{project.entities.length} objects</span>
                            <span>Updated {relativeDate(project.updatedAt)}</span>
                          </div>
                        </div>
                      </article>
                    ))}
                    {!search && (
                      <button className="new-project-card" onClick={newProject}>
                        <span>
                          <Plus size={23} />
                        </span>
                        <strong>Create a project</strong>
                        <p>Good plans start with a little space.</p>
                      </button>
                    )}
                    {search && !visible.length && (
                      <div className="empty-state">No projects match “{search}”.</div>
                    )}
                  </div>
                )}
              </section>
              <footer className="dashboard-footer">
                <span>LotGrade v0 · A focused drawing workspace</span>
                <span>
                  <ArrowDownToLine size={13} />
                  Civil 3D DXF export, built in.
                </span>
              </footer>
            </div>
          </main>
        </div>
      )}
      {dialog && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialog(null);
          }}
        >
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
            <button
              className="modal-close icon-button"
              aria-label="Close dialog"
              onClick={() => setDialog(null)}
            >
              <X size={19} />
            </button>
            <span className="modal-icon">
              {dialog === 'delete' ? <Trash2 size={23} /> : <FolderOpen size={23} />}
            </span>
            <h2 id="dialog-title">
              {dialog === 'new'
                ? 'A fresh start.'
                : dialog === 'rename'
                  ? 'Project details'
                  : 'Delete this project?'}
            </h2>
            {dialog === 'delete' ? (
              <>
                <p>
                  This removes <strong>{target?.name}</strong> from this computer’s project library.
                  Saved .lotgrade copies are kept.
                </p>
                <div className="modal-actions">
                  <button className="secondary-button" onClick={() => setDialog(null)}>
                    Keep project
                  </button>
                  <button className="danger-button" onClick={() => void remove()}>
                    Delete project
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={(event) => void submit(event)}>
                <p>
                  {dialog === 'new'
                    ? 'Give your lot a name. You can add the details as you go.'
                    : 'Keep the details clear for your next visit.'}
                </p>
                <label>
                  Project name
                  <input
                    autoFocus
                    required
                    maxLength={120}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Willow Creek · Lot 12"
                  />
                </label>
                <label>
                  Description <span>(optional)</span>
                  <textarea
                    maxLength={2000}
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Location, client, or a note to yourself"
                  />
                </label>
                {dialog === 'new' && (
                  <label>
                    Drawing units
                    <select value={units} onChange={(e) => setUnits(e.target.value as Units)}>
                      <option value="feet">International feet</option>
                      <option value="meters">Meters</option>
                      <option value="us-survey-feet">US survey feet</option>
                    </select>
                    <small>Coordinates and elevations are exported in these units.</small>
                  </label>
                )}
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setDialog(null)}
                  >
                    Cancel
                  </button>
                  <button className="primary-button" type="submit" disabled={!name.trim()}>
                    {dialog === 'new' ? 'Create project' : 'Save details'}
                    <ArrowRight size={16} />
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button aria-label="Dismiss message" onClick={() => setMessage('')}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
