import { afterEach, describe, expect, it, vi } from 'vitest';
import { DM_CAMERA, MIRRORED, SETTINGS, mirroring, setupMirror } from '../mocks/mirrorHarness';

afterEach(() => { vi.restoreAllMocks(); });

describe('PlayerFrameMirror on a canvas that renders on change', () => {
  it('shows the first frame at once by asking the DM canvas for a render', () => {
    const { events, frame, dm } = setupMirror();

    frame(0);
    expect(events).toEqual([]);
    dm.tick(1);

    expect(events).toEqual(MIRRORED);
  });

  it('spends one player render and one DM render on a mirrored frame and ends on the DM frame', () => {
    const { events, dm } = mirroring();

    dm.change();
    dm.tick(100);

    expect(events).toEqual(MIRRORED);
  });

  it('does not render while nothing changes', () => {
    const { events, frame, dm } = mirroring();

    for (let time = 20; time < 2000; time += 8) {
      frame(time);
      dm.tick(time + 1);
    }

    expect(events).toEqual([]);
  });

  it('mirrors again when told the frame is stale, though the DM canvas did not change', () => {
    const { mirror, events, frame, dm } = mirroring();

    mirror.markStale();
    frame(50);
    dm.tick(51);

    expect(events).toEqual(MIRRORED);
  });

  it('keeps the last frame while the presented scene is not loaded, and mirrors again once it is', () => {
    const { events, frame, dm } = mirroring();
    const scene = { mapLoaded: false };
    dm.source.store = { getState: () => scene } as unknown as NonNullable<typeof dm.source.store>;

    dm.change();
    dm.tick(100);
    frame(120);
    dm.tick(121);
    expect(events).toEqual(['render:dm']);

    events.length = 0;
    scene.mapLoaded = true;
    frame(200);
    dm.tick(201);
    expect(events).toEqual(MIRRORED);
  });

  it('keeps the DM render going when a capture fails, and reports the failure once', () => {
    const { events, frame, dm, captureFails } = mirroring();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    captureFails.value = true;

    dm.change();
    dm.tick(100);
    dm.change();
    dm.tick(200);
    expect(events).toEqual(['render:player', 'render:dm', 'render:player', 'render:dm']);
    expect(error).toHaveBeenCalledTimes(1);

    captureFails.value = false;
    events.length = 0;
    frame(201);
    dm.change();
    dm.tick(300);
    expect(events).toEqual(MIRRORED);
  });

  it('renders through the frozen camera and reports the camera players saw', () => {
    const { frame, dm, state, onFrame, mirror } = mirroring();
    const capture = vi.spyOn(dm.source.beforeRender!, 'withPlayerSafeFrame');

    dm.change();
    dm.tick(100);
    expect(capture).toHaveBeenLastCalledWith(expect.any(Function), SETTINGS, expect.objectContaining({ centerX: 1, centerY: 2, scale: 2 }));
    expect(onFrame).toHaveBeenLastCalledWith(DM_CAMERA);

    state.frozen = { centerX: 10, centerY: 20, scale: 2, width: 400, height: 300 };
    mirror.markStale();
    frame(200);
    dm.tick(201);
    expect(capture).toHaveBeenLastCalledWith(expect.any(Function), SETTINGS, expect.objectContaining({ centerX: 10, centerY: 20, scale: 4 }));
    expect(onFrame).toHaveBeenLastCalledWith(state.frozen);
  });

  it('draws a held frame once and mirrors nothing until it is released', () => {
    const { events, frame, dm, state } = mirroring();
    state.held = document.createElement('canvas');

    frame(100);
    frame(108);
    dm.change();
    dm.tick(110);
    expect(events).toEqual(['draw:held', 'render:dm']);

    events.length = 0;
    state.held = null;
    frame(200);
    dm.tick(201);
    expect(events).toEqual(MIRRORED);
  });

  it('follows the presented canvas and lets go of the previous one', () => {
    const { events, frame, dm, createDm, state } = mirroring();
    const next = createDm();
    next.tick(1);
    events.length = 0;

    state.source = next.source;
    // The previous canvas renders before the player window's next frame: not what players are shown
    dm.change();
    dm.tick(100);
    expect(events).toEqual(['render:dm']);

    frame(101);
    next.tick(102);
    expect(events).toEqual(['render:dm', ...MIRRORED]);

    events.length = 0;
    dm.change();
    dm.tick(200);
    expect(events).toEqual(['render:dm']);
  });

  it('captures the frame itself when the requested render does not come', () => {
    const { mirror, events, frame } = mirroring();
    mirror.markStale();

    frame(100);
    frame(200);
    expect(events).toEqual([]);

    // The DM window is hidden and its ticker asleep
    frame(400);
    expect(events).toEqual(MIRRORED);

    frame(408);
    frame(1000);
    expect(events).toEqual(MIRRORED);
  });

  it('mirrors nothing into a hidden player window, and catches up when it shows again', () => {
    const { events, frame, dm } = mirroring();

    dm.change();
    dm.tick(1000);
    dm.change();
    dm.tick(2000);
    expect(events).toEqual(['render:dm', 'render:dm']);

    events.length = 0;
    frame(2010);
    dm.tick(2011);
    expect(events).toEqual(MIRRORED);
  });

  it('stops listening when stopped', () => {
    const { mirror, events, dm } = mirroring();

    mirror.stop();
    dm.change();
    dm.tick(100);

    expect(events).toEqual(['render:dm']);
  });
});

describe('PlayerFrameMirror on a canvas without a render schedule', () => {
  it('captures every display frame and restores the DM frame itself', () => {
    const { events, frame, dm, state, onFrame } = setupMirror();
    const { getCamera, getScreen, withPlayerSafeFrame } = dm.source;
    state.source = { getCamera, getScreen, withPlayerSafeFrame };

    frame(0);
    frame(8);

    expect(events).toEqual([...MIRRORED, ...MIRRORED]);
    expect(onFrame).toHaveBeenCalledTimes(2);
  });
});
