/** Set on the player window's body while the curtain is down (`player-window.scss`). */
export const PLAYER_CURTAIN_CLASS = 'atlas-player-window--curtain';
/** The black sheet over everything in the player window, the image and loot handouts included. */
const CURTAIN_CLASS = 'atlas-player-curtain';

/**
 * Lowers the curtain over the player window's document `doc`, or lifts it. The sheet is added on
 * first use and stays, so lowering and lifting it fade. The mirror blacks the canvas as well
 * (`PlayerFrameMirror`), so a stylesheet that failed to load cannot show the map.
 */
export function showPlayerCurtain(doc: Document, down: boolean): void {
  const { body } = doc;
  if (!body.querySelector(`:scope > .${CURTAIN_CLASS}`)) body.createDiv({ cls: CURTAIN_CLASS });
  body.toggleClass(PLAYER_CURTAIN_CLASS, down);
}

/** Takes the curtain out of `doc`, when the player window lets go of it. */
export function removePlayerCurtain(doc: Document): void {
  doc.body.removeClass(PLAYER_CURTAIN_CLASS);
  doc.body.querySelector(`:scope > .${CURTAIN_CLASS}`)?.remove();
}
