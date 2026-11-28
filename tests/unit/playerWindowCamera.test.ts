// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { showNotice } from '../../src/app/ui/notice';
import { PlayerWindowService } from '../../src/app/services/PlayerWindowService';
import { isTablePaused, toggleTablePause } from '../../src/app/services/tableControls';
import { SCENE_DIP_MS } from '../../src/app/services/playerSceneFade';
import { openPlayerWindowRig, type PlayerWindowRig } from '../helpers/playerWindowRig';

vi.mock('../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));
afterEach(() => { PlayerWindowService.getInstance()?.destroy(); vi.restoreAllMocks(); vi.mocked(showNotice).mockClear(); });

const FRAME_B = { centerX: 300, centerY: 400, scale: 1, width: 1280, height: 720 };
const FRAME_C = { centerX: -300, centerY: -400, scale: 1, width: 1280, height: 720 };
/** The camera players see of scene-a when the window opens: the view's, with the 800 × 600 pane's rectangle. */
const OPENED = { centerX: 10, centerY: 20, scale: 1, width: 800, height: 600 };

/** A window open on scene-a whose players were shown `OPENED`, then sent gliding to `FRAME_B` and halfway there. */
function halfwayToB(): PlayerWindowRig {
  const rig = openPlayerWindowRig();
  rig.view.look({ centerX: 10, centerY: 20, scale: 1 });
  rig.frame(0);
  rig.service.playersToCamera('scene-a', FRAME_B);
  rig.frame(400);
  const glass = rig.service.glassOf('scene-a')!;
  expect(glass.centerX).toBeGreaterThan(10);
  expect(glass.centerX).toBeLessThan(300);
  return rig;
}

function lastRendered(rig: PlayerWindowRig): { centerX: number; centerY: number } {
  return rig.view.rendered.at(-1)!;
}

function notices(): unknown[] {
  return vi.mocked(showNotice).mock.calls.map(([text]) => text);
}

describe('a glide meeting another move', () => {
  it('a freeze pins players on the last frame they were shown, and the glide goes no further', () => {
    const rig = halfwayToB();
    rig.service.freezeCamera();
    rig.frame(800);
    rig.frame(1200);
    expect(rig.session).toMatchObject({ frozen: true, camera: OPENED });
    expect(rig.service.glassOf('scene-a')).toMatchObject({ centerX: 10, centerY: 20 });
    expect(lastRendered(rig)).toMatchObject({ centerX: 10, centerY: 20 });
  });

  it('a drag takes players there at once, ends the glide, and writes no freeze to the session', () => {
    const rig = halfwayToB();
    expect(rig.service.dragPlayersTo('scene-a', 600, 700)).toBe(true);
    rig.frame(800);
    rig.frame(1200);
    expect(rig.service.isFrozen()).toBe(true);
    expect(rig.session.frozen).toBe(false);
    expect(lastRendered(rig)).toMatchObject({ centerX: 600, centerY: 700 });
    expect(rig.session.camera).toMatchObject({ centerX: 600, centerY: 700 });
  });

  it('presenting another scene ends it and pins players on that scene\'s framing at once', () => {
    const rig = halfwayToB();
    const other = rig.createView({ centerX: 500, centerY: 600, scale: 2 });
    rig.service.presentCanvas(other, 'scene-b', 'scene-b.atlasmap');
    const framing = { centerX: 500, centerY: 600, scale: 2, width: 400, height: 300 };
    expect(rig.session).toMatchObject({ tabId: 'scene-b', frozen: true, camera: framing });
    expect(rig.sheetDown()).toBe(true);
    rig.frame(400 + SCENE_DIP_MS);
    rig.frame(1200);
    expect(rig.session.camera).toEqual(framing);
    expect(other.rendered.at(-1)).toMatchObject({ centerX: 500, centerY: 600 });
  });

  it('presenting the scene players see with a camera glides on from where they are', () => {
    const rig = halfwayToB();
    const halfway = rig.service.glassOf('scene-a')!.centerX;
    rig.service.presentCanvas(rig.view, 'scene-a', 'scene-a.atlasmap', FRAME_C);
    expect(rig.session.frames?.['scene-a.atlasmap']).toEqual(FRAME_C);
    rig.frame(800);
    const between = rig.service.glassOf('scene-a')!.centerX;
    expect(between).toBeLessThan(halfway);
    expect(between).toBeGreaterThan(-300);
    rig.frame(1200);
    expect(rig.session).toMatchObject({ frozen: true, camera: FRAME_C });
  });

  it('a frame held meanwhile lets it land, and players come back to where it landed', () => {
    const rig = halfwayToB();
    rig.service.holdCurrentFrame();
    rig.frame(800);
    expect(rig.session).toMatchObject({ frozen: true, camera: FRAME_B });
    expect(rig.pausedLabel()).toBe(true);
    rig.view.look({ centerX: 9000, centerY: 9000, scale: 1 });
    rig.service.releaseHeldFrame(rig.view);
    rig.frame(1200);
    expect(lastRendered(rig)).toMatchObject({ centerX: 300, centerY: 400 });
  });

  it('the curtain lowered meanwhile lets it land unseen', () => {
    const rig = halfwayToB();
    rig.service.setCurtain(true);
    const shown = rig.view.rendered.length;
    rig.frame(800);
    expect(rig.session).toMatchObject({ frozen: true, camera: FRAME_B });
    expect(rig.view.rendered).toHaveLength(shown);
  });

  it('the window closing ends it with the window', () => {
    const rig = halfwayToB();
    rig.closeWindow();
    rig.frame(800);
    expect(PlayerWindowService.getInstance()).toBeNull();
    expect(rig.service.isFrozen()).toBe(false);
    expect(rig.session.camera).not.toEqual(FRAME_B);
  });
});

describe('a freeze when the presented scene changes', () => {
  it('another level of the scene players see is another picture: the freeze carries over at once, on the GM\'s framing', () => {
    const rig = openPlayerWindowRig();
    rig.frame(0);
    rig.service.freezeCamera();
    rig.presentLevel('scene-a', 'level-2');
    rig.view.look({ centerX: 50, centerY: 60, scale: 2 });
    rig.service.presentCanvas(rig.view, 'scene-a', 'scene-a.atlasmap');
    expect(rig.session).toMatchObject({ levelId: 'level-2', frozen: true, camera: { centerX: 50, centerY: 60, scale: 2, width: 400, height: 300 } });
    expect(rig.sheetDown()).toBe(true);
  });

  it('a frame remembered for a map wins over the freeze carried over when that map comes back', () => {
    const rig = openPlayerWindowRig();
    rig.settings.setTableTvSettings({ viewGlideMs: 0 });
    rig.frame(0);
    rig.service.framePlayersOn('scene-a', 300, 400);
    const other = rig.createView({ centerX: 500, centerY: 600, scale: 2 });
    rig.service.presentCanvas(other, 'scene-b', 'scene-b.atlasmap');
    expect(rig.session.camera).toMatchObject({ centerX: 500, centerY: 600 });
    rig.service.presentCanvas(rig.view, 'scene-a', 'scene-a.atlasmap');
    expect(rig.session).toMatchObject({ frozen: true, camera: { centerX: 300, centerY: 400, scale: 1, width: 800, height: 600 } });
  });

  it('presenting another scene on a camera pins players there at once and remembers the camera for that map', () => {
    const rig = openPlayerWindowRig();
    rig.frame(0);
    const other = rig.createView({ centerX: 0, centerY: 0, scale: 1 });
    rig.service.presentCanvas(other, 'scene-b', 'scene-b.atlasmap', { centerX: 10, centerY: 20, scale: 2 });
    expect(rig.session.frames?.['scene-b.atlasmap']).toEqual({ centerX: 10, centerY: 20, scale: 2 });
    expect(rig.session).toMatchObject({ frozen: true, camera: { centerX: 10, centerY: 20, scale: 2, width: 400, height: 300 } });
  });
});

describe('a held frame', () => {
  it('lets frozen players go without a dip', () => {
    const rig = openPlayerWindowRig();
    rig.frame(0);
    rig.service.freezeCamera({ centerX: 500, centerY: 300, scale: 2 });
    rig.service.holdCurrentFrame();
    rig.service.unfreezeCamera();
    expect(rig.service.isFrozen()).toBe(false);
    expect(rig.sheetDown()).toBe(false);
    expect(rig.pausedLabel()).toBe(true);
  });

  it('sends players to no frame, by a drop, a drag or a saved frame, and shows no glass', () => {
    const rig = openPlayerWindowRig();
    rig.frame(0);
    rig.service.holdCurrentFrame();
    expect(rig.service.framePlayersOn('scene-a', 1, 2)).toBe(false);
    expect(rig.service.dragPlayersTo('scene-a', 1, 2)).toBe(false);
    expect(rig.service.playersToCamera('scene-a', FRAME_B)).toBe(false);
    expect(rig.service.glassOf('scene-a')).toBeNull();
    expect(rig.service.isFrozen()).toBe(false);
  });

  it('released, gives players who followed the GM the GM\'s camera of now', () => {
    const rig = openPlayerWindowRig();
    rig.frame(0);
    rig.service.holdCurrentFrame();
    rig.view.look({ centerX: 900, centerY: 900, scale: 1 });
    rig.service.releaseHeldFrame(rig.view);
    rig.frame(16);
    expect(rig.service.isFrozen()).toBe(false);
    expect(lastRendered(rig)).toMatchObject({ centerX: 900, centerY: 900 });
  });
});

describe('the camera to present another scene through', () => {
  it('is the one players are on, moved to the point: frozen or following, and none once the window is closed', () => {
    const rig = openPlayerWindowRig();
    rig.view.look({ centerX: 10, centerY: 20, scale: 1.5 });
    rig.frame(0);
    expect(rig.service.playerCameraAt(1, 2)).toEqual({ centerX: 1, centerY: 2, scale: 1.5, width: 800 / 1.5, height: 600 / 1.5 });
    rig.service.freezeCamera({ centerX: 100, centerY: 100, scale: 4 });
    expect(rig.service.playerCameraAt(5, 6)).toEqual({ centerX: 5, centerY: 6, scale: 4, width: 200, height: 150 });
    rig.service.destroy();
    expect(rig.service.playerCameraAt(5, 6)).toBeNull();
  });
});

describe('true scale', () => {
  function atTrueScale(): PlayerWindowRig {
    const rig = openPlayerWindowRig();
    const key = rig.service.setupScreenKey()!;
    rig.settings.setTvScreenSetup(key, { pxPerMm: 7 });
    rig.settings.setTableTvDevice({ trueScale: true, cellMm: 30 });
    expect(rig.service.isTrueScale()).toBe(true);
    return rig;
  }

  it('keeps the frozen camera\'s centre, and the TV\'s fit decides the zoom', () => {
    const rig = atTrueScale();
    rig.frame(0);
    rig.service.freezeCamera({ centerX: 100, centerY: 200, scale: 2 });
    rig.view.look({ centerX: 900, centerY: 900, scale: 0.5 });
    rig.frame(16);
    const frame = rig.view.rendered.at(-1)!;
    expect(frame).toMatchObject({ centerX: 100, centerY: 200 });
    // 30 mm of 7 device pixels each over a cell of 70 world pixels
    expect(frame.scale).toBeCloseTo(3);
  });

  it('leaves players framed as they are when the GM pauses, and a pin on its frame is no pause', () => {
    const rig = atTrueScale();
    rig.frame(0);
    toggleTablePause();
    expect(rig.service.isFrozen()).toBe(false);
    expect(isTablePaused()).toBe(true);
    toggleTablePause();
    expect(isTablePaused()).toBe(false);
    expect(notices()).toEqual(['Player view paused', 'Player view playing again']);

    rig.service.framePlayersOn('scene-a', 300, 400);
    expect(rig.service.isFrozen()).toBe(true);
    expect(isTablePaused()).toBe(false);
  });
});

describe('the GM\'s pause without true scale', () => {
  it('freezes the window on what players see and lets it go, and tells the GM so', () => {
    const rig = openPlayerWindowRig();
    rig.view.look({ centerX: 10, centerY: 20, scale: 1 });
    rig.frame(0);
    toggleTablePause();
    expect(rig.session).toMatchObject({ frozen: true, camera: OPENED });
    expect(isTablePaused()).toBe(true);
    toggleTablePause();
    expect(rig.service.isFrozen()).toBe(false);
    expect(notices()).toEqual(['Player view paused', 'Player view playing again']);
  });

  it('refuses where players were shown nothing of the presented scene yet', () => {
    const rig = openPlayerWindowRig();
    rig.frame(0);
    const other = rig.createView({ centerX: 300, centerY: 200, scale: 2 });
    other.setLoading(true);
    rig.service.presentCanvas(other, 'scene-b', 'scene-b.atlasmap');
    toggleTablePause();
    expect(rig.service.isFrozen()).toBe(false);
    expect(isTablePaused()).toBe(false);
    expect(notices()).toEqual(['Players are not shown this scene yet, so there is nothing to pause']);
  });
});
