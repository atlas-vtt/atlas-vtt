/** Fields that identify, place or render a statblock rather than describe the creature. */
export const IGNORED_FIELDS: ReadonlySet<string> = new Set([
  'name', 'image', 'token-image', 'token', 'statblock', 'statblock-link', 'layout', 'path', 'extends', 'bestiary',
  'note', 'columns', 'mtime', 'monster', 'creature', 'aliases', 'cssclasses', 'cssclass', 'player', 'position',
  // Marks a note as a statblock (`atlas-type: statblock`); says nothing about the creature.
  'atlas-type',
  // Names the Atlas template a native statblock is drawn with.
  'atlas-template',
]);
