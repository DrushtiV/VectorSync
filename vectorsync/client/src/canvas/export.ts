import { CanvasNode } from '../shared/types';

export type ExportFormat = 'svg' | 'png' | 'pdf';

export function exportNodes(nodes: CanvasNode[], format: ExportFormat, scale = 2): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./exportWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<{ result?: Blob; error?: string }>) => {
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error('Export worker returned no result'));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'Export worker failed'));
    };
    worker.postMessage({ nodes, format, scale });
  });
}

export async function downloadExport(nodes: CanvasNode[], format: ExportFormat): Promise<void> {
  const snapshot = nodes.map((node) => ({
    ...node,
    position: { ...node.position },
    size: { ...node.size },
    points: node.points?.map((point) => ({ ...point })),
    childrenIds: node.childrenIds ? [...node.childrenIds] : undefined,
  }));
  const blob = await exportNodes(snapshot, format);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `vectorsync-export.${format}`;
  anchor.type = blob.type;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
