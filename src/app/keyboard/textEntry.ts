/** Elements whose keys belong to the text in them: Mod+A selects that text, letters type. */
const TEXT_ENTRY = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), .cm-editor, [role="textbox"]';

/**
 * Whether a key event's target is a text field or lies inside one, in any window: a popout's
 * elements are not `instanceof` this window's classes, so Obsidian's `instanceOf` asks.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const node = target as Node | null;
  if (!node || typeof node.instanceOf !== 'function' || !node.instanceOf(Element)) return false;
  return node.closest(TEXT_ENTRY) !== null;
}
