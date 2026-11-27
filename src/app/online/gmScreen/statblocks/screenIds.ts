/**
 * Ids of Atlas's own making for what the Statblocks screen names to devices (a statblock by its note, a combatant by its
 * entry), never a vault path. They differ from one load of Atlas to the next, so a device that names one of an earlier
 * load is told it is gone rather than shown another.
 */
export class ScreenIds {
  private readonly ids = new Map<string, string>();

  constructor(private readonly prefix: string) {}

  of(key: string): string {
    let id = this.ids.get(key);
    if (id === undefined) {
      id = `${this.prefix}${this.ids.size + 1}`;
      this.ids.set(key, id);
    }
    return id;
  }
}
