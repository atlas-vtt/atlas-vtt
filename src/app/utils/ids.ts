const suffix = (): string => Math.random().toString(36).slice(2, 11);

/** A new id for an object of a scene or a roll: `<prefix>_<time in ms>_<up to nine random characters>`. */
export function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${suffix()}`;
}

/** `count` new ids made together, which share their time. */
export function newIds(prefix: string, count: number): string[] {
  const stamp = Date.now();
  return Array.from({ length: count }, () => `${prefix}_${stamp}_${suffix()}`);
}
