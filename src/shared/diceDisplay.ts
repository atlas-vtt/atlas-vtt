/**
 * `@atlas-vtt/shared/diceDisplay`: how Atlas presents a roll (display settings, the scene of dice a
 * roll throws) and the six tray icons, without three.js. `dice3d` re-exports all of it.
 */
import d4 from '../app/assets/dice-icons/d4.webp';
import d6 from '../app/assets/dice-icons/d6.webp';
import d8 from '../app/assets/dice-icons/d8.webp';
import d10 from '../app/assets/dice-icons/d10.webp';
import d12 from '../app/assets/dice-icons/d12.webp';
import d20 from '../app/assets/dice-icons/d20.webp';

export * from '../app/dice3d/diceDisplay';
export * from '../app/dice3d/diceScene';
export * from '../app/dice3d/rollPresentation';

/** The six dice icons the tray shows, as URLs (inlined as data URLs by the package build). */
export const DIE_ICONS = { d4, d6, d8, d10, d12, d20 } as const;
