import type { MessageKey } from '../../i18n/types';
import welcomePicture from '../../assets/welcome/welcome.webp';
import mapsPicture from '../../assets/welcome/maps.webp';
import generatorPicture from '../../assets/welcome/generator.webp';
import tokensPicture from '../../assets/welcome/tokens.webp';
import dicePicture from '../../assets/welcome/dice.webp';
import soundPicture from '../../assets/welcome/sound.webp';
import playersPicture from '../../assets/welcome/players.webp';
import yoursPicture from '../../assets/welcome/yours.webp';

export type WelcomeSlideId = 'welcome' | 'maps' | 'generator' | 'tokens' | 'dice' | 'sound' | 'players' | 'yours';

/** One slide of the welcome carousel: its picture and its words, the words as `t()` keys resolved at render. */
export interface WelcomeSlide {
  id: WelcomeSlideId;
  picture: string;
  /** The slide's name on its chip at the foot. */
  chip: MessageKey;
  kicker: MessageKey;
  title: MessageKey;
  body: MessageKey;
  /** A second line under the body with a status of its own, such as a part still in beta. */
  aside?: { line: MessageKey; tag: MessageKey };
}

/** How long a slide shows before the next one, and how long two slides take to cross. */
export const SLIDE_MS = 7000;
export const CROSSFADE_MS = 900;

function slide(id: WelcomeSlideId, picture: string, aside?: WelcomeSlide['aside']): WelcomeSlide {
  const key = `tour.welcome.slides.${id}` as const;
  return { id, picture, chip: `${key}.chip`, kicker: `${key}.kicker`, title: `${key}.title`, body: `${key}.body`, ...(aside && { aside }) };
}

/** What Atlas does, in the order the carousel shows it. The pictures are Atlas itself, on maps Atlas made. */
export const WELCOME_SLIDES: readonly WelcomeSlide[] = [
  slide('welcome', welcomePicture),
  slide('maps', mapsPicture),
  slide('generator', generatorPicture),
  slide('tokens', tokensPicture),
  slide('dice', dicePicture),
  slide('sound', soundPicture),
  slide('players', playersPicture, { line: 'tour.welcome.slides.players.online', tag: 'tour.welcome.slides.players.tag' }),
  slide('yours', yoursPicture),
];
