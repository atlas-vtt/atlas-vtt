// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoverPicker } from '../../src/app/packages/components/asset-manager/collection-transfer/CoverPicker';

// What packing does with a picture needs an image worker; here a picture is what says it is one.
vi.mock('../../src/app/services/collectionBundle/collectionCover', () => ({
  makesCover: (image: Blob) => Promise.resolve(image.type.startsWith('image/')),
}));

afterEach(cleanup);

function choose(file: File): void {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  fireEvent.change(input);
}

describe('the cover picker', () => {
  it('refuses a file no cover can be made from where it is chosen, and says so', async () => {
    const onUpload = vi.fn();
    render(<CoverPicker value={{ kind: 'none' }} candidates={[]} onUpload={onUpload} onChange={vi.fn()} layout="row" />);
    choose(new File(['just words'], 'notes.txt', { type: 'text/plain' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'notes.txt is not an image Atlas can read. Choose another file.');
    expect(onUpload).not.toHaveBeenCalled();

    const art = new File(['png'], 'cover.png', { type: 'image/png' });
    choose(art);
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith(art));
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
