import type { Message } from '../../types';

export const mapFeature = {
  'mapFeature.unnamed': 'Map feature',
  'mapFeature.difficult': 'Difficult terrain',
  'mapFeature.cover': 'Cover',
  'mapFeature.cover.none': 'None',
  'mapFeature.cover.half': 'Half cover',
  'mapFeature.cover.three-quarters': 'Three-quarters cover',
  'mapFeature.cover.total': 'Total cover',
  'mapFeature.door': 'Door',
  'mapFeature.lockedDoor': 'Locked door',
  'mapFeature.secretDoor': 'Secret door',
  'mapFeature.renameTitle': 'Rename map feature',
  'mapFeature.remove': 'Remove',
} as const satisfies Record<string, Message>;
