import type { DrawingEntity, Project, ReferenceSource } from './types';

/** Hidden references are neither drawn nor offered as snap targets. */
export function visibleEntities(project: Project): DrawingEntity[] {
  return [
    ...(project.references ?? [])
      .filter((source) => source.visible)
      .flatMap((source) => source.entities),
    ...project.entities,
  ];
}

/** Export inclusion is independent of the current display visibility. */
export function exportEntities(project: Project): DrawingEntity[] {
  return [
    ...project.entities,
    ...(project.references ?? [])
      .filter((source) => source.includeInExport)
      .flatMap((source) => source.entities),
  ];
}

export function downloadOriginal(source: ReferenceSource): void {
  const bytes = Uint8Array.from(atob(source.contentBase64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = source.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
