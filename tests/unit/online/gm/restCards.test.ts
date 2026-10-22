// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { ARM_MS, ArmedCards } from '../../../../src/app/online/gm/armedCards.ts';
import { restKey, RestRequests, type AskedRest, type RestRequestPorts } from '../../../../src/app/online/gm/book/restRequests.ts';
import { knockCards, renderCards, restCards, stackCards } from '../../../../src/app/online/gm/dock/knockStack.ts';
import type { Timers } from '../../../../src/app/online/gm/companionTimers.ts';
import { knockKey, WaitingKnocks } from '../../../../src/app/online/gm/waitingKnocks.ts';

/** A clock and timers the test moves. */
function clock(): Timers & { advance(ms: number): void; count(): number } {
  let now = 1_000_000;
  let next = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => now,
    setTimer: (run, ms) => {
      timers.set(next, { at: now + ms, run });
      return next++;
    },
    clearTimer: (timer) => void timers.delete(timer),
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers].filter(([, timer]) => timer.at <= until).sort(([, a], [, b]) => a.at - b.at)[0];
        if (due === undefined) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].run();
      }
      now = until;
    },
    count: () => timers.size,
  };
}

const MIRA = { id: 'm'.repeat(20), name: 'Mira' };
const CHARACTER = 'c'.repeat(24);
const ASKED: AskedRest = { player: 'a'.repeat(20), request: 'r'.repeat(24), character: 'pc-brannoch', characterId: CHARACTER, name: 'Brannoch', path: 'Brannoch.md', ask: { button: 'long', spends: [] } };

function requests(timers: Timers, cards: ArmedCards, overrides: Partial<RestRequestPorts> = {}): { rests: RestRequests; answers: string[]; changes: { count: number } } {
  const answers: string[] = [];
  const changes = { count: 0 };
  const ports: RestRequestPorts = {
    check: () => ({ button: 'Long rest', picks: [], rules: ['Hit Points to full', 'Exhaustion −1'] }),
    take: () => Promise.resolve('done'),
    plays: () => true,
    answer: (_player, answer) => void answers.push(answer.outcome),
    rested: () => undefined,
    changed: () => void (changes.count += 1),
    ...overrides,
  };
  return { rests: new RestRequests(ports, cards), answers, changes };
}

/** The checks of a test: a request for a button named `nap` fits nothing, any other its button's name. */
const byButton = (_path: string, _character: string, request: { button: string }): { button: string; picks: string[]; rules: string[] } | null =>
  (request.button === 'nap' ? null : { button: request.button === 'short' ? 'Short rest' : 'Long rest', picks: [], rules: ['Hit Points to full'] });

describe('the cards over the online control', () => {
  it('share one arming clock: a rest request that goes starts a newcomer\'s card again, and the other way round', () => {
    const timers = clock();
    const cards = new ArmedCards(timers);
    const knocks = new WaitingKnocks(timers, () => undefined, cards);
    const { rests, answers } = requests(timers, cards);
    knocks.knocked(MIRA);
    expect(rests.ask(ASKED)).toBe(true);
    expect(cards.keys()).toEqual([knockKey(MIRA.id), restKey(CHARACTER)]);
    timers.advance(ARM_MS);
    expect(knocks.players[0]?.armed).toBe(true);
    expect(rests.view()[0]?.armed).toBe(true);

    rests.decline(restKey(CHARACTER));
    expect(answers).toEqual(['declined']);
    // The knock's card may now lie under the press that answered the rest.
    expect(knocks.players[0]?.armed).toBe(false);
    expect(knocks.answer(MIRA.id)).toBe(false);
    timers.advance(ARM_MS);
    expect(knocks.answer(MIRA.id)).toBe(true);

    expect(rests.ask({ ...ASKED, request: 's'.repeat(24) })).toBe(true);
    timers.advance(ARM_MS);
    knocks.gone(MIRA.id, false);
    expect(rests.view()[0]?.armed).toBe(false);
    timers.advance(ARM_MS);
    expect(rests.view()[0]?.armed).toBe(true);
    // The control moving under the cards disarms every one of them.
    cards.moved();
    expect(rests.view()[0]?.armed).toBe(false);
    rests.dispose();
    knocks.dispose();
    expect(cards.keys()).toEqual([]);
    expect(timers.count()).toBe(0);
  });

  it('stack in the order they came, each kind drawn as one line with its answers', () => {
    const knock = { ...MIRA, answered: false, full: false, armed: true };
    const rest = { key: restKey(CHARACTER), character: 'Brannoch', button: 'Long rest', picks: [], rules: ['Hit Points to full', '2 Hit Dice'], armed: true, answered: false };
    const gate = { admit: vi.fn(), decline: vi.fn() };
    const answers = { approve: vi.fn(), decline: vi.fn() };
    const cards = stackCards([...knockCards([knock], gate), ...restCards([rest], answers)], [restKey(CHARACTER), knockKey(MIRA.id)]);
    expect(cards.map((card) => card.key)).toEqual([restKey(CHARACTER), knockKey(MIRA.id)]);

    const parent = document.body.createDiv();
    const tooltips = renderCards(parent, cards);
    const [restRow, knockRow] = [...parent.querySelectorAll<HTMLElement>('.atlas-online-knock')];
    expect(restRow?.getAttribute('aria-label')).toBe('Brannoch asks for a Long rest');
    expect([...restRow!.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Decline', 'Approve']);
    expect([...knockRow!.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Decline', 'Admit']);
    // What the rest will do stands behind its line: a tooltip that describes it, the card one line.
    const line = restRow!.querySelector<HTMLElement>('.atlas-online-knock__text');
    const described = parent.querySelector(`#${line?.getAttribute('aria-describedby') ?? 'none'}`);
    expect(described?.textContent).toBe('Hit Points to full · 2 Hit Dice');
    expect(knockRow!.querySelector('.atlas-online-knock__text')?.hasAttribute('aria-describedby')).toBe(false);

    restRow!.querySelectorAll('button')[1]?.click();
    expect(answers.approve).toHaveBeenCalledWith(restKey(CHARACTER));
    for (const tooltip of tooltips) tooltip.dispose();
  });

  it('take no answer before they are armed, nor twice', () => {
    const timers = clock();
    const { rests } = requests(timers, new ArmedCards(timers));
    expect(rests.ask(ASKED)).toBe(true);
    // Another player's request for the character is refused while one waits.
    expect(rests.ask({ ...ASKED, player: 'b'.repeat(20), request: 's'.repeat(24) })).toBe(false);
    rests.approve(restKey(CHARACTER));
    expect(rests.view()[0]?.answered).toBe(false);
    timers.advance(ARM_MS);
    rests.approve(restKey(CHARACTER));
    expect(rests.view()[0]?.answered).toBe(true);
    rests.decline(restKey(CHARACTER));
    expect(rests.view()).toHaveLength(1);
  });
});

describe('a request that comes while one of its player waits for the character', () => {
  const NEWER = { ...ASKED, request: 's'.repeat(24) };

  it("takes the waiting one's place on its card, armed still where the card reads the same", () => {
    const timers = clock();
    const cards = new ArmedCards(timers);
    const { rests, answers } = requests(timers, cards, { check: byButton });
    expect(rests.ask(ASKED)).toBe(true);
    timers.advance(ARM_MS);
    expect(rests.ask(NEWER)).toBe(true);
    expect(rests.view()).toMatchObject([{ key: restKey(CHARACTER), button: 'Long rest', armed: true }]);
    expect(cards.keys()).toEqual([restKey(CHARACTER)]);
    rests.decline(restKey(CHARACTER));
    // The page let the first go: only the newer is answered.
    expect(answers).toEqual(['declined']);
    rests.dispose();
  });

  it("arms its card anew where it asks for something else, in the card's place", () => {
    const timers = clock();
    const cards = new ArmedCards(timers);
    const knocks = new WaitingKnocks(timers, () => undefined, cards);
    const { rests, answers } = requests(timers, cards, { check: byButton });
    expect(rests.ask(ASKED)).toBe(true);
    knocks.knocked(MIRA);
    timers.advance(ARM_MS);
    expect(rests.ask({ ...NEWER, ask: { button: 'short', spends: [1] } })).toBe(true);
    expect(rests.view()).toMatchObject([{ button: 'Short rest', armed: false }]);
    expect(cards.keys()).toEqual([restKey(CHARACTER), knockKey(MIRA.id)]);
    // The newcomer's card did not move: it keeps its time.
    expect(knocks.players[0]?.armed).toBe(true);
    rests.approve(restKey(CHARACTER));
    expect(rests.view()[0]?.answered).toBe(false);
    timers.advance(ARM_MS);
    expect(rests.view()[0]?.armed).toBe(true);
    expect(answers).toEqual([]);
    rests.dispose();
    knocks.dispose();
  });

  it('goes with the waiting one where it no longer fits, and is refused while the waiting one is being taken', () => {
    const timers = clock();
    const { rests, answers } = requests(timers, new ArmedCards(timers), { check: byButton, take: () => new Promise(() => undefined) });
    expect(rests.ask(ASKED)).toBe(true);
    expect(rests.ask({ ...NEWER, ask: { button: 'nap', spends: [] } })).toBe(false);
    expect(rests.view()).toEqual([]);

    expect(rests.ask(ASKED)).toBe(true);
    timers.advance(ARM_MS);
    rests.approve(restKey(CHARACTER));
    expect(rests.ask(NEWER)).toBe(false);
    expect(rests.view()).toMatchObject([{ answered: true }]);
    expect(answers).toEqual([]);
    rests.dispose();
  });
});

describe('a slow approval', () => {
  it('answers and removes its own request alone, never one that came for the character since', async () => {
    const timers = clock();
    let finish: (outcome: 'done') => void = () => undefined;
    const order: string[] = [];
    const { rests, answers } = requests(timers, new ArmedCards(timers), {
      take: () => new Promise((resolve) => { finish = resolve; }),
      rested: () => void order.push('statblock'),
      answer: (_player, answer) => void order.push(`${answer.request}: ${answer.outcome}`),
    });
    expect(rests.ask(ASKED)).toBe(true);
    timers.advance(ARM_MS);
    rests.approve(restKey(CHARACTER));
    // The player leaves and comes back, and asks again while the first rest is still being taken.
    rests.playerLeft(ASKED.player);
    expect(rests.ask({ ...ASKED, request: 's'.repeat(24) })).toBe(true);
    finish('done');
    await Promise.resolve();
    await Promise.resolve();
    expect(rests.view()).toMatchObject([{ key: restKey(CHARACTER), answered: false }]);
    // What the rest changed still goes out; the request the page let go gets no answer.
    expect(order).toEqual(['statblock']);
    expect(answers).toEqual([]);
    rests.dispose();
  });

  it('sends the statblock before the answer that ends the wait', async () => {
    const timers = clock();
    const order: string[] = [];
    const { rests } = requests(timers, new ArmedCards(timers), {
      rested: () => void order.push('statblock'),
      answer: (_player, answer) => void order.push(answer.outcome),
    });
    expect(rests.ask(ASKED)).toBe(true);
    timers.advance(ARM_MS);
    rests.approve(restKey(CHARACTER));
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['statblock', 'done']);
    expect(rests.view()).toEqual([]);
    rests.dispose();
  });
});
