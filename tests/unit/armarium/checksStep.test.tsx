// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChecksStep } from '../../../src/app/armarium/share/steps/ChecksStep';
import type { ShareSnapshot } from '../../../src/app/armarium/upload/shareState';
import type { SubmissionView } from '../../../src/app/armarium/upload/uploadContract';

afterEach(cleanup);

const checking = (subject: ShareSnapshot['subject'], progress: SubmissionView['progress']): ShareSnapshot => ({
  subject, refusal: null,
  submission: { id: 's', state: 'checking', bytes: 1, parts: [], progress, findings: [], manifest: null, listing: null },
}) as unknown as ShareSnapshot;

const stages = (): string[] => screen.getAllByRole('listitem').map((item) => item.querySelector('.atlas-share-stage__name')?.textContent ?? '');
const status = (name: string): string | null => screen.getAllByRole('listitem').find((item) => item.textContent?.startsWith(name))?.getAttribute('data-status') ?? null;

describe('the checks of a share', () => {
  it('lists for music only the stages that apply to it, ticking those a hidden stage follows', () => {
    render(<ChecksStep snapshot={checking('music', { stage: 'bases', done: 0, total: 0 })} />);
    expect(stages()).toEqual(['Zip file', 'List of contents', 'Tracks and cover', 'Rebuild', 'Previews']);
    expect(status('List of contents')).toBe('done');
    expect(status('Tracks and cover')).toBe('waiting');
  });

  it('lists every stage for a collection', () => {
    render(<ChecksStep snapshot={checking('collection', { stage: 'images', done: 1, total: 4 })} />);
    expect(stages()).toHaveLength(9);
    expect(status('Pictures')).toBe('running');
  });
});
