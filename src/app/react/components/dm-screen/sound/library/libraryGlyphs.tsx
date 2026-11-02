import React from 'react';

/** The folder of the rail and the rows, drawn as the mock has it: lucide's lies lower and looks heavier at this size. */
export function FolderGlyph(): React.JSX.Element {
  return <svg className="atlas-sound-lib__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
}

export function PlayGlyph(): React.JSX.Element {
  return <svg className="atlas-sound-lib__triangle" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>;
}

export function MusicGlyph(): React.JSX.Element {
  return <svg className="atlas-sound-lib__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></svg>;
}

export function AmbienceGlyph(): React.JSX.Element {
  return <svg className="atlas-sound-lib__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h11a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6" /></svg>;
}

export function SearchGlyph(): React.JSX.Element {
  return <svg className="atlas-sound-lib__glyph" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>;
}
