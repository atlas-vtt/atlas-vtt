import type { SoundImportError } from '../sound/codec/soundImporter';
import type { SoundRecord } from '../sound/soundTypes';

/**
 * What the GM is told of sounds that could not be converted: each sound once, and a folder that refuses a write
 * (a full disk, a folder that cannot be written) once as a whole, from its first sound. What waits in the
 * background in such a folder is let go until the next start; a press still tries.
 */
export class CopyRefusals {
  private readonly told = new Set<string>();
  private readonly refusingRoots = new Set<string>();

  constructor(
    private readonly rootOf: (record: SoundRecord) => string | null,
    private readonly tell: (record: SoundRecord, reason: SoundImportError['reason']) => void,
    private readonly letGo: (root: string) => void,
  ) {}

  /** Whether the record's folder refused a write this session, so the background leaves it. */
  holdsBack(record: SoundRecord): boolean {
    const root = this.rootOf(record);
    return root !== null && this.refusingRoots.has(root);
  }

  refused(record: SoundRecord, reason: SoundImportError['reason']): void {
    const root = reason === 'cannot-write' ? this.rootOf(record) : null;
    if (root !== null) {
      const toldOfRoot = this.refusingRoots.has(root);
      this.refusingRoots.add(root);
      this.letGo(root);
      if (toldOfRoot) return;
    }
    if (this.told.has(record.id)) return;
    this.told.add(record.id);
    this.tell(record, reason);
  }
}
