/**
 * Statblock templates for tests: the plan's examples (§5.4 Marsh creature,
 * §5.8 5E 2024 with its lookup tables abridged) and a template holding every
 * block type, a block of a newer Atlas and unknown keys. Each comes as the
 * typed object Atlas holds and as the text of its file.
 */

import {
  TEMPLATE_FORMAT,
  type StatblockTemplate,
  type TemplateBlock,
  type TemplateField,
} from '../../src/app/statblocks/model/templateTypes';

/** §5.4 exactly as the plan writes the file. */
export const MARSH_CREATURE_JSON = `{
  "format": "atlas-statblock-template",
  "version": 1,
  "id": "marsh-creature-k7m2qa",
  "description": "Creatures of the marsh campaign",
  "suits": ["monster", "npc"],
  "derivedFrom": { "templateId": "builtin:d20-creature", "revision": 3 },
  "fields": [
    { "key": "name", "label": "Name", "type": "text" },
    { "key": "image", "label": "Portrait", "type": "image" },
    { "key": "size", "label": "Size", "type": "choice", "options": ["Tiny", "Small", "Medium", "Large", "Huge"], "open": true, "meaning": "size" },
    { "key": "type", "label": "Type", "type": "text", "meaning": "creature-type" },
    { "key": "alignment", "label": "Alignment", "type": "text" },
    { "key": "ac", "label": "Armor Class", "type": "number", "meaning": "armor" },
    { "key": "hp", "label": "Hit Points", "type": "number", "meaning": "hit-points" },
    { "key": "hit_dice", "label": "Hit Dice", "type": "dice" },
    { "key": "speed", "label": "Speed", "type": "text", "prompt": "Add speed" },
    { "key": "stats", "label": "Abilities", "type": "scores", "slots": ["STR", "DEX", "CON", "INT", "WIS", "CHA"] },
    { "key": "senses", "label": "Senses", "type": "text", "meaning": "senses" },
    { "key": "languages", "label": "Languages", "type": "list" },
    { "key": "cr", "label": "Challenge", "type": "rating", "meaning": "rating" },
    { "key": "traits", "label": "Traits", "type": "entries" },
    { "key": "actions", "label": "Actions", "type": "entries", "prompt": "Add an action" }
  ],
  "layout": {
    "maxColumns": 2,
    "columnWidth": 22,
    "blocks": [
      { "id": "h0k2m9qa", "type": "row", "blocks": [
        { "id": "h1x7c2pd", "type": "section", "size": "fill", "blocks": [
          { "id": "t3n8w1ze", "type": "title", "field": "name", "level": 1 },
          { "id": "l4q2v8ka", "type": "line", "fields": ["size", "type", "alignment"], "pattern": "{size} {type}[, {alignment}]" }
        ] },
        { "id": "i5r1b7mx", "type": "image", "field": "image", "shape": "token" }
      ] },
      { "id": "r6a9d3sl", "type": "divider" },
      { "id": "p7c4f8ne", "type": "stat", "field": "ac", "look": "run-in" },
      { "id": "p8e1g6hu", "type": "stat", "field": "hp", "look": "run-in", "pattern": "{hp}[ ({hit_dice})]", "rollFrom": "hit_dice" },
      { "id": "p9g7k2jw", "type": "stat", "field": "speed", "look": "run-in" },
      { "id": "s0j3m5oq", "type": "scores", "field": "stats", "orientation": "row", "columns": [{ "label": "Mod", "formula": "floor((value - 10) / 2)", "display": "signed" }] },
      { "id": "r1l8p4tv", "type": "divider" },
      { "id": "p2n5r9xy", "type": "stat", "field": "senses", "look": "run-in" },
      { "id": "p3p1t6za", "type": "tags", "field": "languages", "label": "Languages", "look": "comma", "whenEmpty": "fallback", "fallback": "—" },
      { "id": "p4s7v2cb", "type": "stat", "field": "cr", "look": "run-in", "pattern": "{cr}[ ({cr|lookup:xp} XP)]" },
      { "id": "e5u4x8dc", "type": "entries", "field": "traits" },
      { "id": "e7y2b6gh", "type": "entries", "field": "actions", "heading": "Actions", "addLabel": "Add action" }
    ]
  },
  "lookups": { "xp": { "1/4": "50", "1/2": "100", "1": "200", "2": "450", "3": "700" } },
  "sample": { "name": "Creature name", "hp": 10, "stats": [10, 10, 10, 10, 10, 10] }
}
`;

/** What reading `MARSH_CREATURE_JSON` gives. */
export const MARSH_CREATURE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'marsh-creature-k7m2qa',
  description: 'Creatures of the marsh campaign',
  suits: ['monster', 'npc'],
  derivedFrom: { templateId: 'builtin:d20-creature', revision: 3 },
  fields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'image', label: 'Portrait', type: 'image' },
    { key: 'size', label: 'Size', type: 'choice', options: ['Tiny', 'Small', 'Medium', 'Large', 'Huge'], open: true, meaning: 'size' },
    { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
    { key: 'alignment', label: 'Alignment', type: 'text' },
    { key: 'ac', label: 'Armor Class', type: 'number', meaning: 'armor' },
    { key: 'hp', label: 'Hit Points', type: 'number', meaning: 'hit-points' },
    { key: 'hit_dice', label: 'Hit Dice', type: 'dice' },
    { key: 'speed', label: 'Speed', type: 'text', prompt: 'Add speed' },
    { key: 'stats', label: 'Abilities', type: 'scores', slots: ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] },
    { key: 'senses', label: 'Senses', type: 'text', meaning: 'senses' },
    { key: 'languages', label: 'Languages', type: 'list' },
    { key: 'cr', label: 'Challenge', type: 'rating', meaning: 'rating' },
    { key: 'traits', label: 'Traits', type: 'entries' },
    { key: 'actions', label: 'Actions', type: 'entries', prompt: 'Add an action' },
  ],
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      { id: 'h0k2m9qa', type: 'row', blocks: [
        { id: 'h1x7c2pd', type: 'section', size: 'fill', blocks: [
          { id: 't3n8w1ze', type: 'title', field: 'name', level: 1 },
          { id: 'l4q2v8ka', type: 'line', fields: ['size', 'type', 'alignment'], pattern: '{size} {type}[, {alignment}]' },
        ] },
        { id: 'i5r1b7mx', type: 'image', field: 'image', shape: 'token' },
      ] },
      { id: 'r6a9d3sl', type: 'divider' },
      { id: 'p7c4f8ne', type: 'stat', field: 'ac', look: 'run-in' },
      { id: 'p8e1g6hu', type: 'stat', field: 'hp', look: 'run-in', pattern: '{hp}[ ({hit_dice})]', rollFrom: 'hit_dice' },
      { id: 'p9g7k2jw', type: 'stat', field: 'speed', look: 'run-in' },
      { id: 's0j3m5oq', type: 'scores', field: 'stats', orientation: 'row', columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)', display: 'signed' }] },
      { id: 'r1l8p4tv', type: 'divider' },
      { id: 'p2n5r9xy', type: 'stat', field: 'senses', look: 'run-in' },
      { id: 'p3p1t6za', type: 'tags', field: 'languages', label: 'Languages', look: 'comma', whenEmpty: 'fallback', fallback: '—' },
      { id: 'p4s7v2cb', type: 'stat', field: 'cr', look: 'run-in', pattern: '{cr}[ ({cr|lookup:xp} XP)]' },
      { id: 'e5u4x8dc', type: 'entries', field: 'traits' },
      { id: 'e7y2b6gh', type: 'entries', field: 'actions', heading: 'Actions', addLabel: 'Add action' },
    ],
  },
  lookups: { xp: { '1/4': '50', '1/2': '100', '1': '200', '2': '450', '3': '700' } },
  sample: { name: 'Creature name', hp: 10, stats: [10, 10, 10, 10, 10, 10] },
};

/**
 * §5.8 exactly as the plan writes it: the blocks carry no ids (reading derives
 * them) and the lookup tables are abridged. Its id is a built-in's, so it
 * reads only with `allowBuiltIn`.
 */
export const FIVE_E_2024_JSON = `{
  "format": "atlas-statblock-template", "version": 1, "id": "builtin:5e-2024-monster",
  "fields": [
    { "key": "name", "label": "Name", "type": "text" },
    { "key": "image", "label": "Portrait", "type": "image" },
    { "key": "size", "label": "Size", "type": "choice", "options": ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"], "open": true, "meaning": "size" },
    { "key": "type", "label": "Type", "type": "text", "meaning": "creature-type" },
    { "key": "subtype", "label": "Subtype", "type": "text" },
    { "key": "alignment", "label": "Alignment", "type": "text" },
    { "key": "ac", "label": "AC", "type": "number", "meaning": "armor" },
    { "key": "initiative", "label": "Initiative", "type": "number", "meaning": "initiative" },
    { "key": "hp", "label": "HP", "type": "number", "meaning": "hit-points" },
    { "key": "hit_dice", "label": "Hit Dice", "type": "dice" },
    { "key": "speed", "label": "Speed", "type": "text" },
    { "key": "stats", "label": "Abilities", "type": "scores", "addRows": false, "addColumns": false, "slots": ["Str", "Dex", "Con", "Int", "Wis", "Cha"],
      "slotKeys": ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] },
    { "key": "saves", "label": "Saving Throws", "type": "pairs" },
    { "key": "skillsaves", "label": "Skills", "type": "pairs" },
    { "key": "damage_vulnerabilities", "label": "Vulnerabilities", "type": "text" },
    { "key": "damage_resistances", "label": "Resistances", "type": "text" },
    { "key": "damage_immunities", "label": "Damage Immunities", "type": "text" },
    { "key": "condition_immunities", "label": "Condition Immunities", "type": "text" },
    { "key": "gear", "label": "Gear", "type": "text" },
    { "key": "senses", "label": "Senses", "type": "text", "meaning": "senses" },
    { "key": "languages", "label": "Languages", "type": "text" },
    { "key": "cr", "label": "CR", "type": "rating", "meaning": "rating" },
    { "key": "traits", "label": "Traits", "type": "entries" },
    { "key": "actions", "label": "Actions", "type": "entries" },
    { "key": "bonus_actions", "label": "Bonus Actions", "type": "entries" },
    { "key": "reactions", "label": "Reactions", "type": "entries" },
    { "key": "legendary_description", "label": "Legendary Actions intro", "type": "markdown" },
    { "key": "legendary_actions", "label": "Legendary Actions", "type": "entries" }
  ],
  "layout": { "maxColumns": 2, "columnWidth": 22, "blocks": [
    { "type": "row", "blocks": [
      { "type": "section", "size": "fill", "blocks": [
        { "type": "title", "field": "name", "level": 1 },
        { "type": "line", "fields": ["size", "type", "subtype", "alignment"], "pattern": "{size} {type}[ ({subtype})][, {alignment}]" } ] },
      { "type": "image", "field": "image", "shape": "token" } ] },
    { "type": "divider" },
    { "type": "row", "align": "start", "blocks": [
      { "type": "stat", "field": "ac", "look": "run-in" },
      { "type": "stat", "field": "initiative", "look": "run-in", "pattern": "{initiative|signed} ({=initiative + 10})",
        "whenEmpty": "fallback", "fallback": "{=floor((stats.1 - 10) / 2)|signed} ({=floor((stats.1 - 10) / 2) + 10})" } ] },
    { "type": "stat", "field": "hp", "look": "run-in", "pattern": "{hp}[ ({hit_dice})]", "rollFrom": "hit_dice" },
    { "type": "stat", "field": "speed", "look": "run-in" },
    { "type": "scores", "field": "stats", "orientation": "table", "perLine": 3, "columns": [
      { "label": "Mod", "formula": "floor((value - 10) / 2)", "display": "signed" },
      { "label": "Save", "field": "saves", "formula": "floor((value - 10) / 2)", "display": "signed" } ] },
    { "type": "pairs", "field": "skillsaves", "label": "Skills", "display": "signed" },
    { "type": "stat", "field": "damage_vulnerabilities", "label": "Vulnerabilities", "look": "run-in" },
    { "type": "stat", "field": "damage_resistances", "label": "Resistances", "look": "run-in" },
    { "type": "stat", "field": "damage_immunities", "label": "Immunities", "look": "run-in",
      "pattern": "{damage_immunities, condition_immunities|join:; }" },
    { "type": "stat", "field": "gear", "look": "run-in" },
    { "type": "stat", "field": "senses", "look": "run-in" },
    { "type": "stat", "field": "languages", "look": "run-in", "whenEmpty": "fallback", "fallback": "None" },
    { "type": "stat", "field": "cr", "look": "run-in", "pattern": "{cr}[ (XP {cr|lookup:xp}; PB {cr|lookup:pb})]" },
    { "type": "entries", "field": "traits", "heading": "Traits" },
    { "type": "entries", "field": "actions", "heading": "Actions", "addLabel": "Add action" },
    { "type": "entries", "field": "bonus_actions", "heading": "Bonus Actions" },
    { "type": "entries", "field": "reactions", "heading": "Reactions" },
    { "type": "entries", "field": "legendary_actions", "heading": "Legendary Actions", "introField": "legendary_description" }
  ] },
  "lookups": { "xp": { "0": "10", "1/8": "25", "…": "…" }, "pb": { "0": "+2", "…": "…" } },
  "sample": { "name": "Creature name", "ac": 13, "hp": 22, "stats": [10, 10, 10, 10, 10, 10] }
}
`;

const initiativeFallback = '{=floor((stats.1 - 10) / 2)|signed} ({=floor((stats.1 - 10) / 2) + 10})';

/** `FIVE_E_2024_JSON` with block ids, as the built-in holds it. */
export const FIVE_E_2024: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'builtin:5e-2024-monster',
  fields: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'image', label: 'Portrait', type: 'image' },
    { key: 'size', label: 'Size', type: 'choice', options: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'], open: true, meaning: 'size' },
    { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' },
    { key: 'subtype', label: 'Subtype', type: 'text' },
    { key: 'alignment', label: 'Alignment', type: 'text' },
    { key: 'ac', label: 'AC', type: 'number', meaning: 'armor' },
    { key: 'initiative', label: 'Initiative', type: 'number', meaning: 'initiative' },
    { key: 'hp', label: 'HP', type: 'number', meaning: 'hit-points' },
    { key: 'hit_dice', label: 'Hit Dice', type: 'dice' },
    { key: 'speed', label: 'Speed', type: 'text' },
    {
      key: 'stats', label: 'Abilities', type: 'scores', addRows: false, addColumns: false, slots: ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'],
      slotKeys: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
    },
    { key: 'saves', label: 'Saving Throws', type: 'pairs' },
    { key: 'skillsaves', label: 'Skills', type: 'pairs' },
    { key: 'damage_vulnerabilities', label: 'Vulnerabilities', type: 'text' },
    { key: 'damage_resistances', label: 'Resistances', type: 'text' },
    { key: 'damage_immunities', label: 'Damage Immunities', type: 'text' },
    { key: 'condition_immunities', label: 'Condition Immunities', type: 'text' },
    { key: 'gear', label: 'Gear', type: 'text' },
    { key: 'senses', label: 'Senses', type: 'text', meaning: 'senses' },
    { key: 'languages', label: 'Languages', type: 'text' },
    { key: 'cr', label: 'CR', type: 'rating', meaning: 'rating' },
    { key: 'traits', label: 'Traits', type: 'entries' },
    { key: 'actions', label: 'Actions', type: 'entries' },
    { key: 'bonus_actions', label: 'Bonus Actions', type: 'entries' },
    { key: 'reactions', label: 'Reactions', type: 'entries' },
    { key: 'legendary_description', label: 'Legendary Actions intro', type: 'markdown' },
    { key: 'legendary_actions', label: 'Legendary Actions', type: 'entries' },
  ],
  layout: {
    maxColumns: 2,
    columnWidth: 22,
    blocks: [
      { id: 'b5row000', type: 'row', blocks: [
        { id: 'b5sec000', type: 'section', size: 'fill', blocks: [
          { id: 'b5title0', type: 'title', field: 'name', level: 1 },
          { id: 'b5line00', type: 'line', fields: ['size', 'type', 'subtype', 'alignment'], pattern: '{size} {type}[ ({subtype})][, {alignment}]' },
        ] },
        { id: 'b5image0', type: 'image', field: 'image', shape: 'token' },
      ] },
      { id: 'b5divid0', type: 'divider' },
      { id: 'b5row001', type: 'row', align: 'start', blocks: [
        { id: 'b5ac0000', type: 'stat', field: 'ac', look: 'run-in' },
        {
          id: 'b5init00', type: 'stat', field: 'initiative', look: 'run-in', pattern: '{initiative|signed} ({=initiative + 10})',
          whenEmpty: 'fallback', fallback: initiativeFallback,
        },
      ] },
      { id: 'b5hp0000', type: 'stat', field: 'hp', look: 'run-in', pattern: '{hp}[ ({hit_dice})]', rollFrom: 'hit_dice' },
      { id: 'b5speed0', type: 'stat', field: 'speed', look: 'run-in' },
      { id: 'b5stats0', type: 'scores', field: 'stats', orientation: 'table', perLine: 3, columns: [
        { label: 'Mod', formula: 'floor((value - 10) / 2)', display: 'signed' },
        { label: 'Save', field: 'saves', formula: 'floor((value - 10) / 2)', display: 'signed' },
      ] },
      { id: 'b5skill0', type: 'pairs', field: 'skillsaves', label: 'Skills', display: 'signed' },
      { id: 'b5vuln00', type: 'stat', field: 'damage_vulnerabilities', label: 'Vulnerabilities', look: 'run-in' },
      { id: 'b5resi00', type: 'stat', field: 'damage_resistances', label: 'Resistances', look: 'run-in' },
      {
        id: 'b5immu00', type: 'stat', field: 'damage_immunities', label: 'Immunities', look: 'run-in',
        pattern: '{damage_immunities, condition_immunities|join:; }',
      },
      { id: 'b5gear00', type: 'stat', field: 'gear', look: 'run-in' },
      { id: 'b5sense0', type: 'stat', field: 'senses', look: 'run-in' },
      { id: 'b5lang00', type: 'stat', field: 'languages', look: 'run-in', whenEmpty: 'fallback', fallback: 'None' },
      { id: 'b5cr0000', type: 'stat', field: 'cr', look: 'run-in', pattern: '{cr}[ (XP {cr|lookup:xp}; PB {cr|lookup:pb})]' },
      { id: 'b5trait0', type: 'entries', field: 'traits', heading: 'Traits' },
      { id: 'b5actio0', type: 'entries', field: 'actions', heading: 'Actions', addLabel: 'Add action' },
      { id: 'b5bonus0', type: 'entries', field: 'bonus_actions', heading: 'Bonus Actions' },
      { id: 'b5react0', type: 'entries', field: 'reactions', heading: 'Reactions' },
      { id: 'b5legen0', type: 'entries', field: 'legendary_actions', heading: 'Legendary Actions', introField: 'legendary_description' },
    ],
  },
  lookups: { xp: { '0': '10', '1/8': '25', '…': '…' }, pb: { '0': '+2', '…': '…' } },
  sample: { name: 'Creature name', ac: 13, hp: 22, stats: [10, 10, 10, 10, 10, 10] },
};

export { EVERY_BLOCK, EVERY_BLOCK_JSON, NEWER_BLOCK } from './statblockEveryBlockFixture';
