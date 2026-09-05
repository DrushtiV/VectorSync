// ---------------------------------------------------------------------------
// Minimal R-Tree spatial index.
//
// This trades some of the sophistication of a textbook R-Tree (no forced
// reinsertion, a simple linear split heuristic) for something small enough
// to read in one sitting while still giving O(log n)-ish query performance
// for the canvas sizes a collaborative whiteboard actually sees (thousands,
// not millions, of nodes).
// ---------------------------------------------------------------------------

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Entry<T> {
  box: BBox;
  item: T;
}

interface RNode<T> {
  box: BBox;
  leaf: boolean;
  children: RNode<T>[];
  entries: Entry<T>[];
}

const MAX_ENTRIES = 8;

function unionBox(a: BBox, b: BBox): BBox {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function boxArea(b: BBox): number {
  return Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
}

function intersects(a: BBox, b: BBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function emptyBox(): BBox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

function boxOfBoxed(items: { box: BBox }[]): BBox {
  return items.reduce((acc: BBox, it) => unionBox(acc, it.box), emptyBox());
}

/**
 * A simple bulk-rebuilt R-Tree. Rather than incrementally balancing on every
 * insert/delete (which is where R-Tree implementations get complex), this
 * index is rebuilt from the full node list whenever the scene graph changes.
 * For canvases with a few thousand shapes this rebuild costs well under a
 * millisecond and keeps the query path a clean O(log n) tree descent.
 */
export class RTree<T> {
  private root: RNode<T> | null = null;

  rebuild(entries: Entry<T>[]): void {
    if (entries.length === 0) {
      this.root = null;
      return;
    }
    this.root = this.buildNode(entries);
  }

  private buildNode(entries: Entry<T>[]): RNode<T> {
    if (entries.length <= MAX_ENTRIES) {
      return { box: boxOfBoxed(entries), leaf: true, children: [], entries };
    }
    // Sort by center-x then chunk into vertical strips, then sort each strip
    // by center-y — a cheap sort-tile-recursive-style bulk load.
    const sorted = [...entries].sort(
      (a, b) => (a.box.minX + a.box.maxX) / 2 - (b.box.minX + b.box.maxX) / 2
    );
    const stripCount = Math.ceil(Math.sqrt(sorted.length / MAX_ENTRIES)) || 1;
    const stripSize = Math.ceil(sorted.length / stripCount);
    const children: RNode<T>[] = [];

    for (let i = 0; i < sorted.length; i += stripSize) {
      const strip = sorted
        .slice(i, i + stripSize)
        .sort((a, b) => (a.box.minY + a.box.maxY) / 2 - (b.box.minY + b.box.maxY) / 2);
      for (let j = 0; j < strip.length; j += MAX_ENTRIES) {
        const chunk = strip.slice(j, j + MAX_ENTRIES);
        children.push({ box: boxOfBoxed(chunk), leaf: true, children: [], entries: chunk });
      }
    }

    // Recursively group children until we're back under MAX_ENTRIES at the root.
    let level = children;
    while (level.length > MAX_ENTRIES) {
      const grouped: RNode<T>[] = [];
      for (let i = 0; i < level.length; i += MAX_ENTRIES) {
        const group = level.slice(i, i + MAX_ENTRIES);
        grouped.push({ box: boxOfBoxed(group), leaf: false, children: group, entries: [] });
      }
      level = grouped;
    }

    return { box: boxOfBoxed(level), leaf: false, children: level, entries: [] };
  }

  /** Returns every item whose bounding box intersects the query box. */
  query(box: BBox): T[] {
    if (!this.root) return [];
    const results: T[] = [];
    const stack: RNode<T>[] = [this.root];
    while (stack.length) {
      const node = stack.pop()!;
      if (!intersects(node.box, box)) continue;
      if (node.leaf) {
        for (const e of node.entries) {
          if (intersects(e.box, box)) results.push(e.item);
        }
      } else {
        for (const c of node.children) stack.push(c);
      }
    }
    return results;
  }
}

export function area(b: BBox): number {
  return boxArea(b);
}
