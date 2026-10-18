import type { App } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/app/atlas-view', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));
vi.mock('../../src/app/atlasViewType', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));

import { attachDiceRolling, linkDiceIn } from '../../src/app/services/statblockDiceLinks';
import { splitDiceSegments, toRollFormula } from '../../src/app/services/statblockDiceText';
import { rollStatblockDice } from '../../src/app/services/statblockRolls';

interface Roll {
  formula: string;
  source: unknown;
}

/** Minimal Obsidian app exposing an Atlas view whose dice tool records rolls. */
function fakeApp(rolls: Roll[]) {
  const diceTool = {
    rollDice: (formula: string, source: unknown) => {
      rolls.push({ formula, source });
      return { formula } as never;
    },
  };
  return {
    workspace: {
      getLeavesOfType: () => [
        { view: { serviceManager: { getToolController: () => ({ getDiceTool: () => diceTool }) } } },
      ],
    },
  } as never;
}

function host(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

describe('toRollFormula', () => {
  it('keeps dice expressions as-is, stripping whitespace', () => {
    expect(toRollFormula('2d8 + 3')).toBe('2d8+3');
  });

  it('leaves bare modifiers for the dice tool to add to the default roll', () => {
    expect(toRollFormula('+4')).toBe('+4');
  });

  it('writes a minus sign, an en dash and "+ -" as the minus the dice tool reads', () => {
    expect(toRollFormula('1d4 \u2212 1')).toBe('1d4-1');
    expect(toRollFormula('2d6 \u2013 1d4')).toBe('2d6-1d4');
    expect(toRollFormula('3d6 + -1')).toBe('3d6-1');
    expect(toRollFormula('\u22121')).toBe('-1');
  });

  it('strips an ATK label before rolling the bonus', () => {
    expect(toRollFormula('ATK: +4')).toBe('+4');
  });
});

describe('linkDiceIn + attachDiceRolling', () => {
  it('wraps dice notation and rolls it through the Atlas dice tool on click', () => {
    const rolls: Roll[] = [];
    const el = host('<div class="statblock-item-container">HP 2d8+2</div>');

    linkDiceIn(el);
    const dispose = attachDiceRolling(el, fakeApp(rolls), () => ({}));

    const link = el.querySelector<HTMLElement>('.atlas-dice-link');
    expect(link?.textContent).toBe('2d8+2');

    link!.click();
    expect(rolls).toHaveLength(1);
    expect(rolls[0]!.formula).toBe('2d8+2');

    dispose();
  });

  it('tags the roll with the token and the nearby ability name', () => {
    const rolls: Roll[] = [];
    const el = host(
      '<div class="atlas-sb-trait"><span class="atlas-sb-trait-name">Bite</span> 1d4+1</div>',
    );

    linkDiceIn(el);
    const dispose = attachDiceRolling(el, fakeApp(rolls), () => ({
      tokenName: 'Giant Toad',
      tokenImagePath: 'tokens/toad.png',
    }));

    el.querySelector<HTMLElement>('.atlas-dice-link')!.click();

    expect(rolls[0]!.source).toEqual({
      type: 'statblock',
      tokenName: 'Giant Toad',
      tokenImagePath: 'tokens/toad.png',
      abilityName: 'Bite',
    });

    dispose();
  });

  it('names a roll in an ability table after its column', () => {
    const rolls: Roll[] = [];
    const el = host(
      '<table><tbody><tr><td data-roll-name="STR">16 (<span class="atlas-dice-link" data-formula="+3">+3</span>)</td></tr></tbody></table>',
    );
    const dispose = attachDiceRolling(el, fakeApp(rolls), () => ({}));

    el.querySelector<HTMLElement>('.atlas-dice-link')!.click();

    expect(rolls[0]).toEqual({ formula: '+3', source: { type: 'statblock', abilityName: 'STR' } });

    dispose();
  });

  it('leaves surrounding text intact', () => {
    const el = host('<div>Zunge (+1, Reichweite 15\')</div>');
    linkDiceIn(el);
    const dispose = attachDiceRolling(el, fakeApp([]), () => ({}));

    expect(el.textContent).toBe("Zunge (+1, Reichweite 15')");
    expect(el.querySelectorAll('.atlas-dice-link')).toHaveLength(1);

    dispose();
  });

  it('does not re-wrap already linked dice when run again', () => {
    const el = host('<div>1d6</div>');
    linkDiceIn(el);
    linkDiceIn(el);

    expect(el.querySelectorAll('.atlas-dice-link')).toHaveLength(1);
    expect(el.querySelector('.atlas-dice-link')!.querySelector('.atlas-dice-link')).toBeNull();
  });

  it('stops rolling once disposed', () => {
    const rolls: Roll[] = [];
    const el = host('<div>1d20</div>');

    linkDiceIn(el);
    const dispose = attachDiceRolling(el, fakeApp(rolls), () => ({}));
    dispose();
    el.querySelector<HTMLElement>('.atlas-dice-link')!.click();

    expect(rolls).toHaveLength(0);
  });

  it('treats a spaced dash before a dice term as punctuation, not a modifier', () => {
    expect(splitDiceSegments('Claws - Very Close - 1d12+2 phy')).toEqual([
      { text: 'Claws - Very Close - ', dice: false },
      { text: '1d12+2', dice: true },
      { text: ' phy', dice: false },
    ]);
  });

  it('takes the exploding notation into the roll, but not an exclamation mark that ends a sentence', () => {
    expect(splitDiceSegments('Shiv 1d6!i+2 damage')).toEqual([
      { text: 'Shiv ', dice: false },
      { text: '1d6!i+2', dice: true },
      { text: ' damage', dice: false },
    ]);
    expect(splitDiceSegments('d8!3 and 2d6!!')[0]).toEqual({ text: 'd8!3', dice: true });
    expect(splitDiceSegments('d8!3 and 2d6!!')[2]).toEqual({ text: '2d6!!', dice: true });
    expect(splitDiceSegments('Take 2d6!')).toEqual([
      { text: 'Take ', dice: false },
      { text: '2d6', dice: true },
      { text: '!', dice: false },
    ]);
  });

  it('links dice and bonuses in brackets without the brackets', () => {
    const linked = (text: string): string[] => splitDiceSegments(text).filter((segment) => segment.dice).map((segment) => segment.text);
    expect(linked('Hit: 19 (2d10 + 8) slashing')).toEqual(['2d10 + 8']);
    expect(linked('(2d6+3) piercing, bite (d8), claws (+5)')).toEqual(['2d6+3', 'd8', '+5']);
    expect(linked('(3d6 + -1)')).toEqual(['3d6 + -1']);
    expect(linked('(1d4 \u2212 1) or (\u22121)')).toEqual(['1d4 \u2212 1', '\u22121']);
    expect(linked('Biss (+0, 1d2)')).toEqual(['+0', '1d2']);
  });

  it('takes every term of an expression, dice after dice too', () => {
    expect(splitDiceSegments('2d6 - 1d4 fire')[0]).toEqual({ text: '2d6 - 1d4', dice: true });
    expect(splitDiceSegments('4d6kh3 + 2')[0]).toEqual({ text: '4d6kh3 + 2', dice: true });
  });

  it('starts no die inside a word or a number', () => {
    expect(splitDiceSegments('x2d6 and 5d')).toEqual([{ text: 'x2d6 and 5d', dice: false }]);
    expect(splitDiceSegments('Recharge 5-6, levels 1\u20133')).toEqual([{ text: 'Recharge 5-6, levels 1\u20133', dice: false }]);
  });

  it('reads a capital D with a number as a die, as it always did (Dolmenwood saves link their D)', () => {
    expect(splitDiceSegments('D12 R13 H14 B15 S16').filter((segment) => segment.dice)).toEqual([{ text: 'D12', dice: true }]);
  });

  it('splits text into plain and dice segments for the React renderer', () => {
    expect(splitDiceSegments('Bite 1d4+1 slashing')).toEqual([
      { text: 'Bite ', dice: false },
      { text: '1d4+1', dice: true },
      { text: ' slashing', dice: false },
    ]);
  });
});

describe('hit dice', () => {
  const statblock = (): HTMLElement => host(
    '<div class="atlas-sb-property" data-hit-points><span class="atlas-sb-property-name">Hit Points</span> 7 (2d6)</div>'
    + '<div class="atlas-sb-trait"><span class="atlas-sb-trait-name">Bite</span> 1d4+1</div>',
  );

  it('hands dice on the hit points line to the hit points handler instead of rolling', () => {
    const rolls: Roll[] = [];
    const hitPoints: Array<[string, string | undefined]> = [];
    const el = statblock();
    linkDiceIn(el);
    const dispose = attachDiceRolling(el, fakeApp(rolls), () => ({}), (formula, ability) => hitPoints.push([formula, ability]));

    const [hitDice, bite] = el.querySelectorAll<HTMLElement>('.atlas-dice-link');
    hitDice!.click();
    bite!.click();

    expect(hitPoints).toEqual([['2d6', 'Hit Points']]);
    expect(rolls.map((roll) => roll.formula)).toEqual(['1d4+1']);
    dispose();
  });

  it('rolls hit dice normally when no handler is attached', () => {
    const rolls: Roll[] = [];
    const el = statblock();
    linkDiceIn(el);
    const dispose = attachDiceRolling(el, fakeApp(rolls), () => ({}));

    el.querySelector<HTMLElement>('.atlas-dice-link')!.click();

    expect(rolls.map((roll) => roll.formula)).toEqual(['2d6']);
    dispose();
  });
});


describe('statblock roll owner', () => {
  it('uses the named view and never falls back after that view closes', () => {
    const first = { rollDice: vi.fn() };
    const second = { rollDice: vi.fn() };
    const leaves = [first, second].map((tool, index) => ({
      view: { viewId: `view-${index}`, serviceManager: { getToolController: () => ({ getDiceTool: () => tool }) } },
    }));
    const app = { workspace: { getLeavesOfType: () => leaves } } as unknown as App;
    rollStatblockDice(app, 'd20', { viewId: 'view-1', tokenName: 'Wolf' });
    expect(first.rollDice).not.toHaveBeenCalled();
    expect(second.rollDice).toHaveBeenCalledWith('d20', { type: 'statblock', tokenName: 'Wolf' });
    leaves.pop();
    expect(rollStatblockDice(app, 'd20', { viewId: 'view-1' })).toBeNull();
    expect(first.rollDice).not.toHaveBeenCalled();
  });
});

describe('statblock roll origin', () => {
  const context = { viewId: 'view-1', mapPath: 'maps/a.atlasmap', tokenIds: ['wolf'] };

  function openViews(): { app: App; first: { rollDice: ReturnType<typeof vi.fn> }; second: { rollDice: ReturnType<typeof vi.fn> }; leaves: unknown[] } {
    const first = { rollDice: vi.fn() };
    const second = { rollDice: vi.fn() };
    const leaves = [first, second].map((tool, index) => ({
      view: { viewId: `view-${index}`, serviceManager: { getToolController: () => ({ getDiceTool: () => tool }) } },
    }));
    return { app: { workspace: { getLeavesOfType: () => leaves } } as unknown as App, first, second, leaves };
  }

  it('passes the origin of a token the statblock was opened for, in the view it was opened in', () => {
    const { app, first, second } = openViews();
    rollStatblockDice(app, 'd20', { tokenId: 'wolf', tokenName: 'Wolf', originContext: context });
    expect(first.rollDice).not.toHaveBeenCalled();
    expect(second.rollDice).toHaveBeenCalledWith(
      'd20', { type: 'statblock', tokenId: 'wolf', tokenName: 'Wolf' }, { viewId: 'view-1', mapPath: 'maps/a.atlasmap', tokenId: 'wolf' },
    );
  });

  it.each([
    ['another token', { tokenId: 'bear', originContext: context }],
    ['a context of another view than the roll', { viewId: 'view-0', tokenId: 'wolf', originContext: { ...context, viewId: 'view-1' } }],
    ['no context', { viewId: 'view-1', tokenId: 'wolf' }],
  ])('passes none for %s', (_, source) => {
    const { app, first, second } = openViews();
    rollStatblockDice(app, 'd20', source);
    const [call] = [...first.rollDice.mock.calls, ...second.rollDice.mock.calls];
    expect(call).toHaveLength(2);
  });

  it('rolls nothing once the view the statblock was opened in is closed', () => {
    const { app, first, leaves } = openViews();
    leaves.pop();
    expect(rollStatblockDice(app, 'd20', { tokenId: 'wolf', originContext: context })).toBeNull();
    expect(first.rollDice).not.toHaveBeenCalled();
  });

  it('takes the context with the source a click reads', () => {
    const { app, second } = openViews();
    const el = host('<div class="atlas-sb-trait"><span class="atlas-sb-trait-name">Bite</span> 1d4+1</div>');
    linkDiceIn(el);
    const dispose = attachDiceRolling(el, app, () => ({ tokenId: 'wolf', originContext: context }));
    el.querySelector<HTMLElement>('.atlas-dice-link')!.click();
    expect(second.rollDice).toHaveBeenCalledWith('1d4+1', { type: 'statblock', tokenId: 'wolf', abilityName: 'Bite' }, expect.objectContaining({ tokenId: 'wolf' }));
    dispose();
  });
});
