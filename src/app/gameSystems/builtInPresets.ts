/**
 * Game systems that ship with Atlas, one file per system in `presets/`. Their
 * ids and condition ids never change, so collections and tokens keep pointing
 * at them across releases.
 */

import type { SystemPreset } from '../types/systemPresetTypes';
import { CAIRN } from './presets/cairn';
import { CALL_OF_CTHULHU } from './presets/callOfCthulhu';
import { COSMERE_RPG } from './presets/cosmereRpg';
import { CYBERPUNK_RED } from './presets/cyberpunkRed';
import { DAGGERHEART } from './presets/daggerheart';
import { DND_5E } from './presets/dnd5e';
import { DRAW_STEEL } from './presets/drawSteel';
import { OLD_SCHOOL_ESSENTIALS } from './presets/oldSchoolEssentials';
import { PATHFINDER_2E } from './presets/pathfinder2e';
import { SHADOWDARK } from './presets/shadowdark';

export const BUILT_IN_SYSTEM_PRESETS: readonly SystemPreset[] = [
  DAGGERHEART,
  DND_5E,
  CAIRN,
  CALL_OF_CTHULHU,
  COSMERE_RPG,
  CYBERPUNK_RED,
  DRAW_STEEL,
  OLD_SCHOOL_ESSENTIALS,
  PATHFINDER_2E,
  SHADOWDARK,
];
