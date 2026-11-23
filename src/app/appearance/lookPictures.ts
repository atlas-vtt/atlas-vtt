import type { LookChoice } from './lookService';
import mediaeval from '../assets/looks/mediaeval.webp';
import own from '../assets/looks/own.webp';
import scifi from '../assets/looks/scifi.webp';

/**
 * One scene in each look, as its card shows it: a lit map with tokens, the scene tabs, a statblock preview and the
 * toolbar. 480 × 300 px WebP, at most 30 KB each (`tests/unit/lookPictures.test.ts`), since the build inlines them.
 */
export const LOOK_PICTURES: Record<LookChoice, string> = { own, mediaeval, scifi };
