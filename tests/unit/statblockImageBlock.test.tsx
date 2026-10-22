// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatblockRenderer } from '../../src/app/react/components/statblock/StatblockRenderer';
import type {
  StatblockItem,
  StatblockLayout,
} from '../../src/app/react/components/statblock/statblockTypes';

function layoutOf(...blocks: StatblockItem[]): StatblockLayout {
  return { name: 'Test', id: 'test', blocks };
}

const imageBlock: StatblockItem = { type: 'image', id: 'img', properties: ['image'] };

/** App stub that resolves vault paths to a predictable resource URL. */
const app = {
  metadataCache: { getFirstLinkpathDest: (path: string) => ({ path }) },
  vault: { getResourcePath: (file: { path: string }) => `app://local/${file.path}` },
} as never;

describe('statblock image block', () => {
  it('renders the creature image from the FS `image` field', () => {
    const { container } = render(
      <StatblockRenderer
        layout={layoutOf(imageBlock)}
        monster={{ image: 'art/toad.png' }}
        app={app}
      />,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toBe('app://local/art/toad.png');
  });

  it('strips wikilink syntax around the image path', () => {
    const { container } = render(
      <StatblockRenderer
        layout={layoutOf(imageBlock)}
        monster={{ image: '[[art/toad.png|Toad]]' }}
        app={app}
      />,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toBe('app://local/art/toad.png');
  });

  it('is not clickable when no assign handler is supplied', () => {
    const { container } = render(
      <StatblockRenderer
        layout={layoutOf(imageBlock)}
        monster={{ image: 'art/toad.png' }}
        app={app}
      />,
    );

    expect(container.querySelector('button')).toBeNull();
  });

  it('assigns a token when the image is clicked', () => {
    const onAssignToken = vi.fn();
    const { container } = render(
      <StatblockRenderer
        layout={layoutOf(imageBlock)}
        monster={{ image: 'art/toad.png' }}
        app={app}
        onAssignToken={onAssignToken}
      />,
    );

    fireEvent.click(container.querySelector('.atlas-sb-image-button')!);

    expect(onAssignToken).toHaveBeenCalledOnce();
  });

  it('offers a placeholder target when the statblock has no image yet', () => {
    const onAssignToken = vi.fn();
    const { container } = render(
      <StatblockRenderer
        layout={layoutOf(imageBlock)}
        monster={{}}
        app={app}
        onAssignToken={onAssignToken}
      />,
    );

    expect(container.querySelector('.atlas-sb-image-placeholder')).not.toBeNull();

    fireEvent.click(container.querySelector('.atlas-sb-image-button')!);
    expect(onAssignToken).toHaveBeenCalledOnce();
  });

  it('renders nothing when there is no image and no way to add one', () => {
    const { container } = render(
      <StatblockRenderer layout={layoutOf(imageBlock)} monster={{}} app={app} />,
    );

    expect(container.querySelector('.atlas-sb-image')).toBeNull();
  });
});
