import { describe, expect, it } from 'vitest';
import { DecodeBudget } from '../../../src/app/pixi/mapImage/decodeBudget';

const background = (bytes: number): { bytes: number; urgent: () => boolean } => ({ bytes, urgent: () => false });
const opening = (bytes: number): { bytes: number; urgent: () => boolean } => ({ bytes, urgent: () => true });

/** Whether `promise` has settled once the microtasks queued now have run. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false;
  void promise.then(() => (done = true));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return done;
}

describe('DecodeBudget', () => {
  it('grants an open before background work that waited longer', async () => {
    const budget = new DecodeBudget(100, { yielding: () => true });
    const release = await budget.acquire(background(80));
    const order: string[] = [];
    const prebuild = budget.acquire(background(80)).then((give) => { order.push('prebuild'); return give; });
    const open = budget.acquire(opening(80)).then((give) => { order.push('open'); return give; });

    release();
    (await open)();
    (await prebuild)();
    expect(order).toEqual(['open', 'prebuild']);
  });

  it('lets an open in over the budget when no holder will give way, and waits while one will', async () => {
    let yielding = true;
    const budget = new DecodeBudget(100, { yielding: () => yielding });
    await budget.acquire(opening(80));
    const waiting = budget.acquire(opening(80));
    expect(await settled(waiting)).toBe(false);
    expect(budget.pressured).toBe(true);

    yielding = false;
    budget.reconsider();
    expect(await settled(waiting)).toBe(true);
    // Over its limit: background work keeps giving way.
    expect(budget.pressured).toBe(true);
  });

  it('asks the owner to give way when a request has to wait', async () => {
    let asked = 0;
    const budget = new DecodeBudget(100, { onPressure: () => (asked += 1), yielding: () => true });
    await budget.acquire(background(80));
    void budget.acquire(background(80));
    expect(asked).toBe(1);
  });

  it('charges a source larger than the budget in full, so it runs alone and others wait for all of it', async () => {
    const budget = new DecodeBudget(100, { yielding: () => true });
    const large = await budget.acquire(background(250));
    expect(budget.pressured).toBe(true);
    const small = budget.acquire(background(10));
    expect(await settled(small)).toBe(false);
    large();
    expect(await settled(small)).toBe(true);
    expect(budget.pressured).toBe(false);
  });
});
