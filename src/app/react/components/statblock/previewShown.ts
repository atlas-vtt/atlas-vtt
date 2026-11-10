/**
 * Class on a document's body while an Atlas statblock preview is shown in it (the hover
 * preview, a preview window): Obsidian's note hover popover, opened from a link in the
 * statblock, then stands above the preview (`statblock-hover-preview.scss`). A class and
 * not `body:has()`, which would make Chromium restyle the whole document on every change.
 */
export const PREVIEW_SHOWN_CLASS = 'atlas-statblock-preview-shown';

const shown = new WeakMap<Document, number>();

/** Marks `doc` as showing one more preview, until the returned release (which acts once). */
export function holdPreviewShown(doc: Document): () => void {
  shown.set(doc, (shown.get(doc) ?? 0) + 1);
  doc.body.classList.add(PREVIEW_SHOWN_CLASS);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    const left = (shown.get(doc) ?? 1) - 1;
    shown.set(doc, left);
    if (left === 0) doc.body.classList.remove(PREVIEW_SHOWN_CLASS);
  };
}
