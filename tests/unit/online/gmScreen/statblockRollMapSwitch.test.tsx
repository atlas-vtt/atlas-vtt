// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatblockDrawing } from '../../../../src/app/online/gmScreen/statblocks/StatblockDrawing.ts';
import type { GmScreenMessage } from '../../../../src/app/online/protocol/index.ts';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import type { DiceRollResult } from '../../../../src/app/types/diceTypes';
import { auto, native, rollOf } from './statblockRollsRig.ts';
import { statblocksRig, TestScene, tokensOf, type StatblocksRig } from './statblocksRig.ts';

let rig: StatblocksRig | null = null;

afterEach(() => {
  rig?.screen.dispose();
  if (rig) TemplateLibrary.release(rig.harness.app);
  rig?.harness.dispose();
  rig = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

type Answer = Extract<GmScreenMessage, { t: 'statblock-roll-answer' }>;

/** Two open map views, each with its own dice tool, which announces its rolls on its own scene. */
function twoMaps(started: StatblocksRig, first: TestScene, second: TestScene): Record<string, ReturnType<typeof vi.fn>> {
  const tools = Object.fromEntries([first, second].map((scene) => [scene.viewId, vi.fn((formula: string): DiceRollResult => {
    const result = rollOf(formula);
    scene.rolled(result);
    return result;
  })]));
  Object.assign(started.harness.app.workspace, {
    getLeavesOfType: () => [first, second].map((scene) => ({ view: { viewId: scene.viewId, serviceManager: { getToolController: () => ({ getDiceTool: () => ({ rollDice: tools[scene.viewId] }) }) } } })),
  });
  return tools;
}

describe('a press in the moment after the GM brought another map to the front', { timeout: 20_000 }, () => {
  it('is refused as changed and rolls nothing until the statblock is drawn for that map, then rolls on it', async () => {
    const tokens = { ...tokensOf(native), ...tokensOf(auto) };
    const marsh = new TestScene('view-1', tokens);
    const camp = new TestScene('view-2', tokens, 'atlas-vtt/maps/Camp.atlasmap');
    rig = statblocksRig([native, auto], marsh);
    const started = rig;
    const tools = twoMaps(started, marsh, camp);
    started.open('p');
    const hag = await vi.waitFor(() => {
      const entry = started.heard('p', 'statblocks').at(-1)?.entries.find((each) => each.name === 'Marsh Hag');
      expect(entry).toBeDefined();
      return entry!.id;
    }, { timeout: 5000 });
    started.screen.message('p', { t: 'statblock-view', id: hag });
    const drawing = await vi.waitFor(() => {
      const drawn = started.heard('p', 'statblock').at(-1);
      expect(drawn?.drawing).toBeDefined();
      return drawn!.drawing!;
    }, { timeout: 5000 });

    // The press arrives just as the statblock is drawn again for the map now in front, before React has put that drawing in place.
    const draw = StatblockDrawing.prototype.draw;
    let pressedBetween = false;
    vi.spyOn(StatblockDrawing.prototype, 'draw').mockImplementation(function (this: StatblockDrawing, props) {
      draw.call(this, props);
      if (props.viewId !== 'view-2' || pressedBetween) return;
      pressedBetween = true;
      started.screen.message('p', { t: 'statblock-roll', id: 1, statblock: hag, drawing, roll: 0 });
    });
    started.front(camp);
    const answer = (id: number): Answer | undefined => started.heard('p', 'statblock-roll-answer').find((each) => each.id === id);
    await vi.waitFor(() => expect(answer(1)).toBeDefined(), { timeout: 5000 });
    expect(answer(1)?.refused).toBe('changed');
    expect(tools['view-1']).not.toHaveBeenCalled();
    expect(tools['view-2']).not.toHaveBeenCalled();

    // Until React put the drawing in place for the map in front, a press is refused as changed and rolls nothing. Each try is a
    // new press, made once the one before was answered: a press sent again is answered as it was first.
    let id = 1;
    await vi.waitFor(() => {
      if (answer(id)?.refused) {
        id += 1;
        started.screen.message('p', { t: 'statblock-roll', id, statblock: hag, drawing: started.heard('p', 'statblock').at(-1)!.drawing!, roll: 0 });
      }
      expect(answer(id)?.refused).toBeNull();
    }, { timeout: 5000, interval: 100 });
    expect(tools['view-1']).not.toHaveBeenCalled();
    expect(tools['view-2']).toHaveBeenCalledTimes(1);
  });
});
