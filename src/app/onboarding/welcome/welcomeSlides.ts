import type { MessageKey } from '../../i18n/types';
import { ATLAS_GITHUB_URL, ATLAS_ONLINE_URL, ATLAS_STREAM_DECK_URL, atlasGuideUrl } from '../../support/communityLinks';
import welcomePicture from '../../assets/welcome/welcome.webp';
import mapsPicture from '../../assets/welcome/maps.webp';
import generatorPicture from '../../assets/welcome/generator.webp';
import tokensPicture from '../../assets/welcome/tokens.webp';
import dicePicture from '../../assets/welcome/dice.webp';
import soundPicture from '../../assets/welcome/sound.webp';
import playersPicture from '../../assets/welcome/players.webp';
import yoursPicture from '../../assets/welcome/yours.webp';

export type WelcomeSlideId = 'welcome' | 'maps' | 'generator' | 'tokens' | 'dice' | 'sound' | 'players' | 'yours';

/** A page on the web that tells more about what a slide shows. */
export interface WelcomeLink {
  label: MessageKey;
  url: string;
}

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
  links?: readonly WelcomeLink[];
}

/** How long a slide shows before the next one, and how long two slides take to cross. */
export const SLIDE_MS = 7000;
export const CROSSFADE_MS = 900;

function slide(id: WelcomeSlideId, picture: string, extra: Pick<WelcomeSlide, 'aside' | 'links'> = {}): WelcomeSlide {
  const key = `tour.welcome.slides.${id}` as const;
  return { id, picture, chip: `${key}.chip`, kicker: `${key}.kicker`, title: `${key}.title`, body: `${key}.body`, ...extra };
}

function guide(path: string): WelcomeLink {
  return { label: 'tour.welcome.readGuide', url: atlasGuideUrl(path) };
}

/** What Atlas does, in the order the carousel shows it. The pictures are Atlas itself, on maps Atlas made. */
export const WELCOME_SLIDES: readonly WelcomeSlide[] = [
  slide('welcome', welcomePicture),
  slide('maps', mapsPicture, { links: [guide('start/scene-from-map')] }),
  slide('generator', generatorPicture),
  slide('tokens', tokensPicture, { links: [guide('start/tokens')] }),
  slide('dice', dicePicture, { links: [guide('guides/dice')] }),
  slide('sound', soundPicture, {
    links: [guide('guides/sound'), { label: 'tour.welcome.slides.sound.streamDeck', url: ATLAS_STREAM_DECK_URL }],
  }),
  slide('players', playersPicture, {
    aside: { line: 'tour.welcome.slides.players.online', tag: 'tour.welcome.slides.players.tag' },
    links: [guide('start/player-view'), { label: 'tour.welcome.slides.players.onlineLink', url: ATLAS_ONLINE_URL }],
  }),
  slide('yours', yoursPicture, { links: [{ label: 'tour.welcome.slides.yours.source', url: ATLAS_GITHUB_URL }] }),
];
