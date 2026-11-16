/** A binary heap of items by cost, least first; among equal costs, the one pushed first. */
export class MinHeap<T> {
  private readonly items: { cost: number; order: number; item: T }[] = [];
  private pushed = 0;

  get size(): number {
    return this.items.length;
  }

  push(item: T, cost: number): void {
    const items = this.items;
    items.push({ cost, order: this.pushed++, item });
    for (let i = items.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (!this.before(i, parent)) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }

  /** The least item and its cost, or undefined when empty. */
  pop(): { item: T; cost: number } | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (!top || !last) return undefined;
    if (items.length > 0) {
      items[0] = last;
      for (let i = 0; ; ) {
        const left = 2 * i + 1;
        const right = left + 1;
        let least = i;
        if (left < items.length && this.before(left, least)) least = left;
        if (right < items.length && this.before(right, least)) least = right;
        if (least === i) break;
        [items[i], items[least]] = [items[least]!, items[i]!];
        i = least;
      }
    }
    return { item: top.item, cost: top.cost };
  }

  private before(a: number, b: number): boolean {
    const p = this.items[a]!;
    const q = this.items[b]!;
    return p.cost < q.cost || (p.cost === q.cost && p.order < q.order);
  }
}
