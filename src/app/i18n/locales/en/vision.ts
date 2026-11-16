import type { Message } from '../../types';

export const vision = {
  'vision.range': 'Sight range',
  'vision.angle': 'Vision angle (°)',
  'vision.unlimited': 'Unlimited',
  'vision.unlimitedSight': 'Unlimited sight',
  'vision.allAround': 'See all around',
  'vision.angleHint': 'Faces the token\'s rotation',
  'vision.withUnit': '{label} ({unit})',
  'vision.toggle': 'Vision',
  'vision.carriedLight': 'Carried light',
  'vision.carryLight': 'Carry light',
  'vision.defaultsIntro': 'New tokens start with these values; vision itself stays off until you switch it on for a token.',
  'vision.partyMember': 'Vision (party member)',
  'vision.partyMemberHint': 'The players see the map through this token. The token itself is always visible to them.',
  'vision.carriesLight': 'Carries a light',
  'vision.carriesLightHint': 'A torch or a lantern: its light moves with the token.',
  'vision.noneFromStatblock': 'None, from statblock',
  'vision.rangeFromStatblock': '{range}, from statblock',
} as const satisfies Record<string, Message>;
