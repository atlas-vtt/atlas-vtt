// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Where the licensed built-in templates come from and the credit each licence
 * asks for. Attribution texts are verbatim: README.md and
 * THIRD_PARTY_NOTICES.md quote them, and a unit test keeps all three in sync.
 */

import type { BuiltInTemplateId, TemplateSource } from '../model/templateTypes';

/** Built-ins that need a licence route; exactly these carry a `source`. */
export const LICENSED_BUILT_INS: readonly BuiltInTemplateId[] = [
  'builtin:5e-2014-monster',
  'builtin:5e-2024-monster',
  'builtin:cairn-creature',
  'builtin:draw-steel-monster',
  'builtin:fate-npc',
];

const MODIFICATION = 'Atlas VTT arranged the stat block structure as an editable template.';
const CC_BY_4_0_LEGAL_CODE = 'https://creativecommons.org/licenses/by/4.0/legalcode';

export const SRD_5_1_SOURCE: TemplateSource = {
  system: '5E (2014 rules)',
  label: 'SRD 5.1 · CC BY 4.0',
  licences: ['CC-BY-4.0'],
  attribution: 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  licenceUrl: CC_BY_4_0_LEGAL_CODE,
  sourceUrl: 'https://dnd.wizards.com/resources/systems-reference-document',
  modification: MODIFICATION,
};

export const SRD_5_2_1_SOURCE: TemplateSource = {
  system: '5E (2024 rules)',
  label: 'SRD 5.2.1 · CC BY 4.0',
  licences: ['CC-BY-4.0'],
  attribution: 'This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  licenceUrl: CC_BY_4_0_LEGAL_CODE,
  sourceUrl: 'https://www.dndbeyond.com/srd',
  modification: MODIFICATION,
};

/** The template's own module is `CC-BY-SA-4.0 OR GPL-3.0-only`, which its attribution says. */
export const CAIRN_SOURCE: TemplateSource = {
  system: 'Cairn',
  label: 'Cairn · CC BY-SA 4.0',
  licences: ['CC-BY-SA-4.0'],
  attribution: 'The Cairn template is based on Cairn by Yochai Gal (https://cairnrpg.com), licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Atlas VTT adapted the creature format into an editable template; this template is available under CC BY-SA 4.0 or GPL-3.0.',
  licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  sourceUrl: 'https://cairnrpg.com',
  modification: MODIFICATION,
};

/**
 * The notice the DRAW STEEL Creator License requires, naming only the Draw
 * Steel parts of Atlas as the product. It must stand whole wherever it is
 * shown (the app, README.md, atlas-vtt.dev), so it is all `attribution`: its
 * non-affiliation line is part of it, and no `trademarkNotice` repeats it.
 */
export const DRAW_STEEL_NOTICE = 'The Draw Steel statblock template and system preset in Atlas VTT are an independent product published under the DRAW STEEL Creator License and are not affiliated with MCDM Productions, LLC. DRAW STEEL © 2026 MCDM Productions, LLC.';

export const DRAW_STEEL_SOURCE: TemplateSource = {
  system: 'Draw Steel',
  label: 'Draw Steel Creator License',
  licences: ['DS-Creator'],
  attribution: DRAW_STEEL_NOTICE,
  licenceUrl: 'https://www.mcdmproductions.com/draw-steel-creator-license',
  sourceUrl: 'https://www.mcdmproductions.com',
  modification: MODIFICATION,
};

/** Evil Hat asks for this text at the size of other copyright text. */
export const FATE_SOURCE: TemplateSource = {
  system: 'Fate',
  label: 'Fate Core · CC BY 3.0',
  licences: ['CC-BY-3.0'],
  attribution: 'This work is based on Fate Core System and Fate Accelerated Edition (found at https://www.faterpg.com/), products of Evil Hat Productions, LLC, developed, authored, and edited by Leonard Balsera, Brian Engard, Jeremy Keller, Ryan Macklin, Mike Olson, Clark Valentine, Amanda Valentine, Fred Hicks, and Rob Donoghue, and licensed for our use under the Creative Commons Attribution 3.0 Unported license (https://creativecommons.org/licenses/by/3.0/).',
  licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
  sourceUrl: 'https://www.faterpg.com/',
  modification: MODIFICATION,
};
