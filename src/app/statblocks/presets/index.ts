// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Every template built into Atlas, in the order pickers list them: Atlas' own
 * generic ones, then the systems'. Ids never change and a template is never
 * removed, since notes and roles name them. Each sits in its own file with
 * an SPDX header naming its licences.
 */

import type { BuiltInTemplate } from '../model/templateTypes';
import { BX_CREATURE } from './bxCreature';
import { CAIRN_CREATURE } from './cairn';
import { D20_CREATURE } from './d20Creature';
import { DRAW_STEEL_MONSTER } from './drawSteel';
import { FATE_NPC } from './fate';
import { FIVE_E_2014_MONSTER } from './fiveE2014';
import { FIVE_E_2024_MONSTER } from './fiveE2024';
import { GENERIC_CREATURE, GENERIC_HAZARD, GENERIC_NPC } from './generic';
import { NARRATIVE_NPC } from './narrativeNpc';
import { PERCENTILE_CREATURE } from './percentileCreature';
import { frozen } from './presetParts';

export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = frozen([
  GENERIC_CREATURE,
  GENERIC_NPC,
  GENERIC_HAZARD,
  D20_CREATURE,
  BX_CREATURE,
  PERCENTILE_CREATURE,
  NARRATIVE_NPC,
  FIVE_E_2024_MONSTER,
  FIVE_E_2014_MONSTER,
  CAIRN_CREATURE,
  DRAW_STEEL_MONSTER,
  FATE_NPC,
]);
