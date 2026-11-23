import type { MessageKey } from '../../i18n/types';
import welcomePicture from '../../assets/welcome/welcome.webp';
import mapsPicture from '../../assets/welcome/maps.webp';
import dicePicture from '../../assets/welcome/dice.webp';
import statblocksPicture from '../../assets/welcome/statblocks.webp';
import playersPicture from '../../assets/welcome/players.webp';
import onlinePicture from '../../assets/welcome/online.webp';

export type WelcomeSlideId = 'welcome' | 'maps' | 'dice' | 'statblocks' | 'players' | 'online';

/** One slide of the welcome carousel: its picture and its words, the words as `t()` keys resolved at render. */
export interface WelcomeSlide {
  id: WelcomeSlideId;
  picture: string;
  /** The slide's name on its chip at the foot. */
  chip: MessageKey;
  kicker: MessageKey;
  title: MessageKey;
  body: MessageKey;
}

/** How long a slide shows before the next one, and how long two slides take to cross. */
export const SLIDE_MS = 7000;
export const CROSSFADE_MS = 900;

/** What Atlas does, in the order the carousel shows it. The pictures are Atlas itself, on a map Atlas made. */
export const WELCOME_SLIDES: readonly WelcomeSlide[] = [
  {
    id: 'welcome',
    picture: welcomePicture,
    chip: 'tour.welcome.slides.welcome.chip',
    kicker: 'tour.welcome.slides.welcome.kicker',
    title: 'tour.welcome.slides.welcome.title',
    body: 'tour.welcome.slides.welcome.body',
  },
  {
    id: 'maps',
    picture: mapsPicture,
    chip: 'tour.welcome.slides.maps.chip',
    kicker: 'tour.welcome.slides.maps.kicker',
    title: 'tour.welcome.slides.maps.title',
    body: 'tour.welcome.slides.maps.body',
  },
  {
    id: 'dice',
    picture: dicePicture,
    chip: 'tour.welcome.slides.dice.chip',
    kicker: 'tour.welcome.slides.dice.kicker',
    title: 'tour.welcome.slides.dice.title',
    body: 'tour.welcome.slides.dice.body',
  },
  {
    id: 'statblocks',
    picture: statblocksPicture,
    chip: 'tour.welcome.slides.statblocks.chip',
    kicker: 'tour.welcome.slides.statblocks.kicker',
    title: 'tour.welcome.slides.statblocks.title',
    body: 'tour.welcome.slides.statblocks.body',
  },
  {
    id: 'players',
    picture: playersPicture,
    chip: 'tour.welcome.slides.players.chip',
    kicker: 'tour.welcome.slides.players.kicker',
    title: 'tour.welcome.slides.players.title',
    body: 'tour.welcome.slides.players.body',
  },
  {
    id: 'online',
    picture: onlinePicture,
    chip: 'tour.welcome.slides.online.chip',
    kicker: 'tour.welcome.slides.online.kicker',
    title: 'tour.welcome.slides.online.title',
    body: 'tour.welcome.slides.online.body',
  },
];
