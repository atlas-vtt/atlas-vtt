import type { TemplateId } from './templateTypes';

/** A kind of statblock a collection makes ("Monster", "NPC", "Adversary") and the template it starts from. */
export interface StatblockRole {
  /** Derived from the first name, then fixed. */
  id: string;
  /** In the system's words: "Monster", "NPC", "Adversary". */
  name: string;
  templateId: TemplateId;
}

/** Folder for new statblocks per role id. The collection's own, never a preset's. */
export type StatblockRoleFolders = Readonly<Record<string, string>>;
