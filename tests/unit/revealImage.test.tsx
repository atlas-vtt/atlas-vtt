// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RevealImage } from '../../src/app/packages/components/primitives/RevealImage';

afterEach(cleanup);

const placeholder = (container: HTMLElement): HTMLElement | null => container.querySelector('.atlas-image-placeholder');

describe('RevealImage', () => {
  it('holds the place of an image until it has loaded, then shows it', () => {
    const { container, getByRole } = render(<RevealImage src="app://goblin.webp" alt="Goblin" />);
    const image = getByRole('img', { name: 'Goblin' });
    expect(image.hasAttribute('data-shown')).toBe(false);
    expect(placeholder(container)?.hasAttribute('data-settled')).toBe(false);

    fireEvent.load(image);

    expect(image.hasAttribute('data-shown')).toBe(true);
    expect(placeholder(container)?.hasAttribute('data-settled')).toBe(true);
  });

  it('shows an image it has shown before at once, without a placeholder', () => {
    const first = render(<RevealImage src="app://wolf.webp" alt="Wolf" />);
    fireEvent.load(first.getByRole('img'));
    first.unmount();

    const { container, getByRole } = render(<RevealImage src="app://wolf.webp" alt="Wolf" />);

    expect(getByRole('img').hasAttribute('data-shown')).toBe(true);
    expect(placeholder(container)).toBeNull();
  });

  it('waits again when its source changes', () => {
    const { container, getByRole, rerender } = render(<RevealImage src="app://bat.webp" alt="Bat" />);
    fireEvent.load(getByRole('img'));

    rerender(<RevealImage src="app://bat-2.webp" alt="Bat" />);

    expect(getByRole('img').hasAttribute('data-shown')).toBe(false);
    expect(placeholder(container)?.hasAttribute('data-settled')).toBe(false);
  });

  it('gives way to the fallback when the image cannot be loaded', () => {
    const { container, getByRole, getByText } = render(<RevealImage src="app://gone.webp" alt="Gone" fallback={<span>G</span>} />);
    fireEvent.error(getByRole('img'));

    expect(getByText('G')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(placeholder(container)).toBeNull();
  });
});
