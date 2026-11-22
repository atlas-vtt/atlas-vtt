// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/app/packages/components/primitives/tooltip';
import { MoodCard } from '@/app/react/components/dm-screen/sound/MoodCard';
import type { Mood } from '@/app/sound/soundTypes';

const mood: Mood = { id: 'mood-1', name: 'Tavern', order: 1, fadeSeconds: 2, music: 'none', layers: [] };

function card(sceneImage: string): ReturnType<typeof render> {
  return render(
    <TooltipProvider>
      <MoodCard mood={mood} number={1} playing={false} stateWord="" still={false} next={false} dragging={false} musicName={null} problems={[]} linked={false} linkedInFight={false} sceneImage={sceneImage} players={null} onPress={() => undefined} onMenu={() => undefined} onDragStart={() => undefined} />
    </TooltipProvider>,
  );
}

describe('a scene\'s thumbnail behind its mood', () => {
  it('has its place held by a breathing placeholder until it is painted, which then lets it go', () => {
    const { container, unmount } = card('scene-a.thumb.jpg');
    const placeholder = container.querySelector('.atlas-sound-mood__scene-wait');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.hasAttribute('data-settled')).toBe(false);
    act(() => { fireEvent.load(container.querySelector('img.atlas-sound-mood__scene')!); });
    expect(container.querySelector('.atlas-sound-mood__scene-wait')?.hasAttribute('data-settled')).toBe(true);
    expect(container.querySelector('img.atlas-sound-mood__scene')?.hasAttribute('data-shown')).toBe(true);
    unmount();

    // Painted once in this window: the next tile showing it holds no place for it.
    expect(card('scene-a.thumb.jpg').container.querySelector('.atlas-sound-mood__scene-wait')).toBeNull();
  });

  it('holds no place for a thumbnail that could not be read', () => {
    const { container } = card('scene-b.thumb.jpg');
    act(() => { fireEvent.error(container.querySelector('img.atlas-sound-mood__scene')!); });
    expect(container.querySelector('.atlas-sound-mood__scene-wait')).toBeNull();
  });
});
