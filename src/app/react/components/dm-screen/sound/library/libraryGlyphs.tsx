import React from 'react';

/** A tag of the rail, drawn in the line of its neighbours. */
export function TagGlyph(): React.JSX.Element {
  return <svg className="atlas-sound-lib__glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.6 3H5a2 2 0 0 0-2 2v7.6a2 2 0 0 0 .6 1.4l6.4 6.4a2 2 0 0 0 2.8 0l7.6-7.6a2 2 0 0 0 0-2.8L14 3.6a2 2 0 0 0-1.4-.6z" /><circle cx="8" cy="8" r="1" /></svg>;
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
