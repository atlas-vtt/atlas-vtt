import type { SoundRecord } from '../sound/soundTypes';
import type { SoundOutput } from './soundOutput';
import type { SoundShelf } from './soundShelf';
import type { SoundTable } from './soundTable';
import { EMPTY_TABLE_SOUND, enteringLayer, OFFLINE_LEAD_MS } from './tableSound';

const PREVIEW_FADE_MS = 150;

/**
 * One sound to the GM alone while preparing: a state of its own on a player of its own, never the
 * table's, so it reaches nothing that listens to the table.
 */
export class SoundPreview {
  private previewing: string | null = null;
  private wanted: SoundRecord | null = null;

  constructor(
    private readonly output: SoundOutput,
    private readonly shelf: SoundShelf,
    private readonly table: SoundTable,
    private readonly onChange: (previewing: string | null) => void,
  ) {}

  toggle(record: SoundRecord | null): void {
    if (record === null || record.id === this.previewing) {
      this.wanted = null;
      this.previewing = null;
      this.output.setPreview(this.output.isOpen ? EMPTY_TABLE_SOUND : null);
      this.onChange(null);
      return;
    }
    this.wanted = record;
    this.previewing = record.id;
    this.output.unlock();
    this.table.keepPulsing();
    this.onChange(record.id);
    this.copiesChanged();
  }

  /** A sound without a copy starts once it has one. */
  copiesChanged(): void {
    const wanted = this.wanted;
    if (!wanted) return;
    const info = this.shelf.infoOf(wanted);
    if (!info) {
      this.shelf.request([wanted], true);
      return;
    }
    this.wanted = null;
    this.output.setPreview({ ...EMPTY_TABLE_SOUND, layers: [enteringLayer(info, 0, this.table.now() + OFFLINE_LEAD_MS, PREVIEW_FADE_MS)] });
  }

  reset(): void {
    this.wanted = null;
    this.previewing = null;
    this.onChange(null);
  }
}
