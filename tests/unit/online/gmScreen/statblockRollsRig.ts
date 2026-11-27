import { readFileSync } from 'node:fs';
import path from 'node:path';
import { vi } from 'vitest';
import type { DrawnElement, DrawnNode, GmScreenMessage } from '../../../../src/app/online/protocol/index.ts';
import type { DiceRollResult } from '../../../../src/app/types/diceTypes';
import { STATBLOCK_SCENARIOS } from '../../../fixtures/gmScreenStatblockNotes';
import { deviceId, type Device } from './sessionRig.ts';
import { allowed, heardBy, statblocksSession, type StatblocksSession } from './statblocksSession.ts';
import type { TestScene } from './statblocksRig.ts';

export const PHONE = deviceId('p');
export const native = STATBLOCK_SCENARIOS.find((scenario) => scenario.id === 'native')!;
export const auto = STATBLOCK_SCENARIOS.find((scenario) => scenario.id === 'auto')!;
const ART = readFileSync(path.resolve(__dirname, '../../../fixtures/images/rgb8.png'));

export type RollAnswer = Extract<GmScreenMessage, { t: 'statblock-roll-answer' }>;

/** A roll as the dice tool makes one: 9, a critical success. */
export const rollOf = (formula: string): DiceRollResult => ({ id: `r-${formula}`, timestamp: 1, formula, rolls: [], modifiers: 0, total: 9, crit: 'high' });

/** The map view's dice tool, where every roll of a statblock ends, announcing each roll on the scene's map as `dice-rolled` does: what it was asked to roll. */
export function diceTool(started: StatblocksSession, scene: TestScene): ReturnType<typeof vi.fn> {
  const rollDice = vi.fn((formula: string): DiceRollResult => {
    const result = rollOf(formula);
    scene.rolled(result);
    return result;
  });
  Object.assign(started.harness.app.workspace, {
    getLeavesOfType: () => [{ view: { viewId: 'view-1', serviceManager: { getToolController: () => ({ getDiceTool: () => ({ rollDice }) }) } } }],
  });
  return rollDice;
}

/** The rolls of a drawn statblock, in the order Atlas numbered them. */
export function rollsIn(nodes: readonly DrawnNode[]): DrawnElement[] {
  return nodes.flatMap((node) => (typeof node === 'string' ? [] : [...(node.roll === undefined ? [] : [node]), ...rollsIn(node.k ?? [])]));
}

export const answers = (device: Device): RollAnswer[] => device.heard.filter((message): message is RollAnswer => message.t === 'statblock-roll-answer');

export async function answerTo(started: StatblocksSession, device: Device, id: number): Promise<string | null> {
  return (await heardBy(started.rig, device, 'statblock-roll-answer', (answer) => answer.id === id)).refused;
}

/** A phone showing the hag's statblock as drawn. */
export async function showingHag(scene: TestScene): Promise<{ started: StatblocksSession; phone: Device; id: string; drawn: Extract<GmScreenMessage, { t: 'statblock' }> }> {
  const started = await statblocksSession([native, auto], scene, ART.buffer.slice(ART.byteOffset, ART.byteOffset + ART.byteLength));
  const phone = await allowed(started.rig, PHONE);
  const list = await heardBy(started.rig, phone, 'statblocks', (each) => each.entries.length === 2);
  const id = list.entries.find((each) => each.name === 'Marsh Hag')!.id;
  await phone.say({ t: 'statblock-view', id });
  const drawn = await heardBy(started.rig, phone, 'statblock', (each) => each.id === id);
  return { started, phone, id, drawn };
}
