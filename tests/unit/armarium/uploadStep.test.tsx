// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { UploadStep } from '../../../src/app/armarium/share/steps/UploadStep';
import type { UploadProgress } from '../../../src/app/armarium/upload/BundleUpload';
import type { ShareSnapshot } from '../../../src/app/armarium/upload/shareState';

afterEach(cleanup);

const MB = 1024 * 1024;
/** The parts of a snapshot the upload step reads; the rest of a share does not matter here. */
const during = (upload: UploadProgress): ShareSnapshot => ({ packing: null, upload, refusal: null, subject: 'collection' }) as unknown as ShareSnapshot;

describe('the upload step', () => {
  it('says what is on its way and moves an indeterminate bar until a part is in, never a false zero', () => {
    const { rerender } = render(<UploadStep snapshot={during({ parts: ['sending'], sentBytes: 0, totalBytes: 15.61 * MB, failure: null })} />);
    expect(screen.getByText('Sending 15.61 MB…')).toBeTruthy();
    expect(screen.queryByText(/0 Bytes/)).toBeNull();
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('data-indeterminate')).toBe('true');
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);

    rerender(<UploadStep snapshot={during({ parts: ['sent', 'sending'], sentBytes: 16 * MB, totalBytes: 20 * MB, failure: null })} />);
    expect(screen.getByText('16 MB of 20 MB sent')).toBeTruthy();
    expect(screen.getByRole('progressbar').hasAttribute('data-indeterminate')).toBe(false);
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(String(16 * MB));
  });

  it('counts what was sent once an upload stopped, with nothing in yet', () => {
    render(<UploadStep snapshot={during({ parts: ['failed'], sentBytes: 0, totalBytes: 2 * MB, failure: { code: 'network', until: null } })} />);
    expect(screen.getByText('0 Bytes of 2 MB sent')).toBeTruthy();
    expect(screen.getByRole('progressbar').hasAttribute('data-indeterminate')).toBe(false);
  });
});
