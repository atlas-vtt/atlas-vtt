import { describe, expect, it } from 'vitest';
import type { Workspace } from 'obsidian';
import { remoteMapView } from '@/app/soundRemote/remoteMapView';

const mapView = (name: string) => ({ name, atlasStore: {}, getViewType: () => 'atlas-vtt' });
const otherView = (type: string) => ({ getViewType: () => type });

function workspace(active: object | null, atlasLeaves: object[]): Pick<Workspace, 'getActiveViewOfType' | 'getLeavesOfType'> {
  return {
    getActiveViewOfType: () => active,
    getLeavesOfType: (type: string) => (type === 'atlas-vtt' ? atlasLeaves.map((view) => ({ view })) : []),
  } as never;
}

describe('the map a remote acts on', () => {
  it('is the Atlas view in front, else the open one, else none', () => {
    const front = mapView('front');
    const open = mapView('open');
    expect(remoteMapView(workspace(front, [open, front]))).toBe(front);
    expect(remoteMapView(workspace(otherView('markdown'), [open]))).toBe(open);
    expect(remoteMapView(workspace(null, []))).toBeNull();
  });

  it('never takes the player window or a deferred map leaf', () => {
    expect(remoteMapView(workspace(otherView('atlas-vtt-local-player'), [otherView('atlas-vtt')]))).toBeNull();
  });
});
