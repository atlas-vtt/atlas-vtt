import { Modal, Setting, type App } from 'obsidian';
import type { WorldDated } from '../worldDated';
import type { StoreApi } from 'zustand';
import type { ViewAtlasState } from 'src/app/storeFactory';
import { ATLAS_NATIVE_MODAL_CLASSES } from 'src/app/ui/nativeModal';
import type { ObjectDateChanges } from '../store/worldTimeSlice';
import { CalendarService } from '../calendar/CalendarService';
import { effectiveDates, linkedNotePath, type DatedKind } from '../dating/effectiveDates';
import { WorldNoteIndex } from '../notes/WorldNoteIndex';
import { addDateField } from './dateSetting';

export interface DatedRef {
  kind: DatedKind;
  id: string;
}

const KIND_LABELS: Record<DatedKind, string> = { pin: 'pin', token: 'token', text: 'text', drawing: 'drawing' };

/** The value all `values` share, or undefined when they differ. */
function shared<T>(values: readonly T[]): T | undefined {
  const [first] = values;
  return values.every((value) => value === first) ? first : undefined;
}

/**
 * Sets when map objects exist. Ends left empty fall back to
 * the linked note's frontmatter unless inheriting is switched off. Saving
 * applies to every object in one undo step.
 */
export class WorldDatesModal extends Modal {
  private readonly changes: ObjectDateChanges = {};

  constructor(app: App, private readonly store: StoreApi<ViewAtlasState>, private readonly refs: readonly DatedRef[]) {
    super(app);
  }

  private objectOf(ref: DatedRef): WorldDated | undefined {
    const { objects } = this.store.getState();
    if (ref.kind === 'pin') return objects.pins[ref.id];
    if (ref.kind === 'token') return objects.tokens[ref.id];
    if (ref.kind === 'text') return objects.texts[ref.id];
    return objects.drawings[ref.id];
  }

  onOpen(): void {
    const { contentEl } = this;
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-world-modal');
    const objects = this.refs.map((ref) => this.objectOf(ref)).filter((object): object is WorldDated => object !== undefined);
    const single = this.refs.length === 1 ? this.refs[0] : undefined;
    this.setTitle(single ? `Dates of this ${KIND_LABELS[single.kind]}` : `Dates of ${this.refs.length} objects`);
    const calendar = CalendarService.forApp(this.app).calendar();

    contentEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'The object shows only while the viewing date lies between these dates. Empty ends are open.',
    });
    const from = shared(objects.map((object) => object.from));
    const to = shared(objects.map((object) => object.to));
    const mixed = (value: string | undefined, key: 'from' | 'to'): string =>
      value === undefined && objects.some((object) => object[key] !== undefined) ? '(mixed: unchanged)' : 'open';
    addDateField(new Setting(contentEl).setName('From'), calendar, from, (date) => { this.changes.from = date; }, mixed(from, 'from'));
    addDateField(new Setting(contentEl).setName('To'), calendar, to, (date) => { this.changes.to = date; }, mixed(to, 'to'));

    const inherit = objects.every((object) => object.dateInherit !== false);
    new Setting(contentEl)
      .setName('Use dates of the linked note')
      .setDesc('Empty ends take `from`/`to` (people: `born`/`died`) from the note the object links to.')
      .addToggle((toggle) => toggle.setValue(inherit).onChange((value) => { this.changes.inherit = value; }));

    if (single) this.describeInherited(contentEl, single);

    new Setting(contentEl)
      .addButton((button) => button.setButtonText('Save').setCta().onClick(() => this.save()))
      .addButton((button) => button.setButtonText('Clear dates').onClick(() => {
        this.changes.from = null;
        this.changes.to = null;
        this.save();
      }))
      .addButton((button) => button.setButtonText('Cancel').onClick(() => this.close()));
  }

  /** Shows what the linked note supplies, so the GM sees where an inherited date comes from. */
  private describeInherited(container: HTMLElement, ref: DatedRef): void {
    const object = this.objectOf(ref);
    if (!object) return;
    const { objects } = this.store.getState();
    const record = ref.kind === 'pin' ? objects.pins[ref.id] : ref.kind === 'token' ? objects.tokens[ref.id] : undefined;
    const notePath = record ? linkedNotePath(ref.kind, record) : undefined;
    if (!notePath) return;
    const noteDates = WorldNoteIndex.forApp(this.app).noteDates(notePath.split('#')[0] ?? notePath);
    const dates = effectiveDates({ ...object, dateInherit: true }, noteDates);
    const parts = [
      dates.fromSource === 'note' ? `from ${dates.from}` : null,
      dates.toSource === 'note' ? `to ${dates.to}` : null,
    ].filter((part): part is string => part !== null);
    container.createEl('p', {
      cls: 'setting-item-description',
      text: parts.length > 0 ? `Linked note (${notePath}): ${parts.join(', ')}` : `The linked note (${notePath}) has no dates.`,
    });
  }

  private save(): void {
    this.store.getState().setObjectDates(this.refs, this.changes);
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
