import { parseGmMessage, type GmMessage, type SharedWidgetBar } from '../../../../src/app/online/protocol/index.ts';
import type { AnyWidget } from '../../../../src/app/types/widgetTypes';
import { pausedTimers } from '../../../../src/app/utils/timerWidget';
import { describe, expect, it, vi } from 'vitest';
import { WIDGET_INTERVAL_MS } from '../../../../src/app/online/gm/WidgetShare.ts';
import { seeded } from './seeded.ts';
import { shareHarness, type ShareHarness, type Sent } from './shareHarness.ts';
import { clock, counter, timer, widgetScene, type WidgetSceneState } from './widgetFixtures.ts';

type WidgetsMessage = Extract<GmMessage, { t: 'widgets' }>;

const widgetMessages = (sent: readonly Sent[]): WidgetsMessage[] => sent.flatMap(({ body }) => {
  if (body.t !== 'widgets') return [];
  // What a browser reads: the message as text, through the protocol's parser.
  const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
  if (read?.t !== 'widgets') throw new Error('a widgets message the browser refuses');
  return [read];
});
const lastBar = (sent: readonly Sent[]): SharedWidgetBar | null | undefined => widgetMessages(sent).at(-1)?.bar;

async function table(state: WidgetSceneState): Promise<ShareHarness & { state: WidgetSceneState; show(next: WidgetSceneState): Promise<void> }> {
  const harness = shareHarness(state, new Map([['maps/cave.webp', new Uint8Array([1, 2, 3])]]));
  harness.share.start();
  await harness.advance(WIDGET_INTERVAL_MS);
  const shared = Object.assign(harness, {
    state,
    show: async (next: WidgetSceneState): Promise<void> => {
      shared.state = next;
      await harness.set(next);
    },
  });
  return shared;
}

describe('the widgets players are sent', () => {
  it("are those Atlas's player window shows, in order, with only what its bar draws", async () => {
    const shared = await table(widgetScene([
      timer('t', { order: 2 }),
      counter('c', { order: 0, label: 'Torches' }),
      clock('k', { order: 1 }),
      counter('gm', { label: 'Secret Doom', visibleToPlayers: false }),
      counter('off', { label: 'Switched Off' }),
      counter('old', { label: 'Old Hidden', visible: false }),
    ], { offWidgets: ['off'] }, { c: 7, k: 4 }));
    expect(lastBar(shared.sent)).toEqual({
      scale: 1,
      widgets: [
        { kind: 'counter', label: 'Torches', icon: 'heart', colour: null, value: 7 },
        { kind: 'clock', label: 'Clock k', icon: 'hourglass', colour: '#e5484d', value: 4, segments: 6, showCount: true },
        { kind: 'timer', label: 'Timer t', icon: 'flame', colour: null, value: 60 },
      ],
    });
    const traffic = JSON.stringify(shared.sent);
    for (const leak of ['Secret Doom', 'Switched Off', 'Old Hidden', '"gm"', 'duration', '"min"', '"max"', 'scope', 'collection']) expect(traffic, leak).not.toContain(leak);
  });

  it("follow the GM's changes: a step, a new widget, one switched off, the bar hidden, the player view's switch", async () => {
    const shared = await table(widgetScene([counter('c')], {}, { c: 1 }));
    await shared.show({ ...shared.state, widgetValues: { c: 2 } });
    await shared.advance(WIDGET_INTERVAL_MS);
    expect(lastBar(shared.sent)?.widgets.map(({ value }) => value)).toEqual([2]);

    await shared.show(widgetScene([counter('c'), clock('k', { label: 'Doom' })], {}, { c: 2 }));
    await shared.advance(WIDGET_INTERVAL_MS);
    expect(lastBar(shared.sent)?.widgets.map(({ label }) => label)).toEqual(['Counter c', 'Doom']);

    await shared.show(widgetScene([counter('c'), clock('k', { label: 'Doom' })], { offWidgets: ['c'] }, { c: 2 }));
    await shared.advance(WIDGET_INTERVAL_MS);
    expect(lastBar(shared.sent)?.widgets.map(({ label }) => label)).toEqual(['Doom']);

    await shared.show(widgetScene([clock('k')], { globalVisible: false }));
    await shared.advance(WIDGET_INTERVAL_MS);
    expect(lastBar(shared.sent)).toBeNull();

    await shared.show(widgetScene([clock('k')]));
    shared.settings = { ...shared.settings, showWidgets: false };
    await shared.advance(2000);
    expect(lastBar(shared.sent)).toBeNull();
    const count = widgetMessages(shared.sent).length;
    shared.share.resend('ana');
    expect(widgetMessages(shared.sent)).toHaveLength(count);
  });

  it('never carry a widget players may not see, whatever the GM switches (seeded)', async () => {
    for (let trial = 0; trial < 12; trial += 1) {
      const random = seeded(trial);
      const ids = ['a', 'b', 'c', 'd', 'e'];
      let widgets: AnyWidget[] = ids.map((id, order) => (order % 3 === 0 ? counter(id, { order }) : order % 3 === 1 ? clock(id, { order }) : timer(id, { order })));
      let off: string[] = [];
      let barShown = true;
      const shared = await table(widgetScene(widgets));
      for (let step = 0; step < 30; step += 1) {
        const id = ids[Math.floor(random() * ids.length)] ?? 'a';
        const roll = random();
        if (roll < 0.3) widgets = widgets.map((widget) => (widget.id === id ? { ...widget, visibleToPlayers: !widget.visibleToPlayers } : widget));
        else if (roll < 0.5) off = off.includes(id) ? off.filter((other) => other !== id) : [...off, id];
        else if (roll < 0.6) barShown = !barShown;
        else if (roll < 0.7) shared.settings = { ...shared.settings, showWidgets: !shared.settings.showWidgets };
        else widgets = widgets.map((widget) => (widget.id === id ? { ...widget, value: Math.floor(random() * 10) } : widget));
        // Each widget's label names it and its state now, so a message that carries an old one is caught.
        widgets = widgets.map((widget) => ({ ...widget, label: `${widget.id}-${step}-${widget.visibleToPlayers ? 'shown' : 'hidden'}` }));
        const before = shared.sent.length;
        await shared.show(widgetScene(widgets, { offWidgets: off, globalVisible: barShown }));
        await shared.advance(1100);
        const visible = barShown && shared.settings.showWidgets ? widgets.filter((widget) => widget.visibleToPlayers && !off.includes(widget.id)).map((widget) => widget.label) : [];
        for (const message of widgetMessages(shared.sent.slice(before))) {
          for (const sent of message.bar?.widgets ?? []) expect(visible, `trial ${trial} step ${step}`).toContain(sent.label);
        }
        expect(lastBar(shared.sent)?.widgets.map(({ label }) => label) ?? [], `trial ${trial} step ${step}`).toEqual(visible);
      }
    }
  });

  it('send a running timer once with its run, not every second, and again when it stops', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
    try {
      const shared = await table(widgetScene([timer('t', { value: 60 })]));
      const sentBefore = widgetMessages(shared.sent).length;
      const run = { since: Date.now(), remaining: 60 };
      await shared.show(widgetScene([timer('t', { value: 60, running: run })]));
      await shared.advance(WIDGET_INTERVAL_MS);
      expect(lastBar(shared.sent)?.widgets[0]).toEqual({ kind: 'timer', label: 'Timer t', icon: 'flame', colour: null, value: 60, since: 0 });

      // Atlas writes the run anew once a minute; its end stays, so players hear nothing.
      vi.setSystemTime(Date.now() + 9000);
      await shared.show(widgetScene([timer('t', { value: 51, running: { since: Date.now(), remaining: 51 } })]));
      await shared.advance(WIDGET_INTERVAL_MS);
      expect(widgetMessages(shared.sent).slice(sentBefore)).toHaveLength(1);

      // A player who joins now gets the run, its age as it is now.
      shared.share.resend('ana');
      expect(widgetMessages(shared.sent).at(-1)?.bar?.widgets[0]).toMatchObject({ value: 51, since: 0 });

      // The GM pauses at 50.4 seconds left: players hear it stands at 51, as Atlas shows it.
      vi.setSystemTime(Date.now() + 600);
      await shared.show(widgetScene([timer('t', { value: 50.4 })]));
      await shared.advance(WIDGET_INTERVAL_MS);
      expect(lastBar(shared.sent)?.widgets[0]).toEqual({ kind: 'timer', label: 'Timer t', icon: 'flame', colour: null, value: 51 });
      expect(widgetMessages(shared.sent).slice(sentBefore)).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('send a run an older Atlas left behind as a timer that stands', async () => {
    const shared = await table(widgetScene([timer('t', { value: 42, running: { since: 5, remaining: 60 } })]));
    expect(lastBar(shared.sent)?.widgets[0]).toEqual({ kind: 'timer', label: 'Timer t', icon: 'flame', colour: null, value: 42 });
  });

  it('keep the bar while the presented scene loads, its running timers counting on', async () => {
    const run = { since: Date.now(), remaining: 30 };
    const shared = await table(widgetScene([timer('t', { value: 30, running: run })]));
    await shared.show({ ...widgetScene([]), isMapLoading: true });
    await shared.advance(WIDGET_INTERVAL_MS);
    expect(lastBar(shared.sent)?.widgets[0]).toMatchObject({ value: 30 });
    expect(lastBar(shared.sent)?.widgets[0]?.since).toBeGreaterThanOrEqual(0);
  });

  it('send a timer a scene loads with as standing where it last wrote: Atlas never resumes a run read from a file', async () => {
    const run = { since: Date.now(), remaining: 30 };
    const shared = await table(widgetScene([timer('t', { value: 30, running: run })]));
    await shared.show({ ...widgetScene([]), isMapLoading: true });
    await shared.advance(WIDGET_INTERVAL_MS);
    const read = pausedTimers({ t: timer('t', { value: 30, running: { since: run.since - 3_600_000, remaining: 30 } }) });
    await shared.show(widgetScene(Object.values(read)));
    await shared.advance(WIDGET_INTERVAL_MS);
    expect(lastBar(shared.sent)?.widgets[0]).toEqual({ kind: 'timer', label: 'Timer t', icon: 'flame', colour: null, value: 30 });
  });
});
