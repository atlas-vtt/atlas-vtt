// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TemplateRests, withRecovery } from '../../../../src/app/statblocks/editor/rests/TemplateRests';
import { ADVENTURER, BUTTONS } from '../../../fixtures/recoveryFixtures';
import { FakeSession } from '../template-editor/editorKit';

afterEach(cleanup);

function mount(session: FakeSession, onDone = vi.fn()): void {
  render(<TemplateRests app={undefined} session={session} snapshot={session.getSnapshot()} collectionId={null} onDone={onDone} />);
}

describe('the recovery buttons in the template editor', () => {
  it('show the template\'s buttons over its card, and Done goes back', () => {
    const onDone = vi.fn();
    mount(new FakeSession({ ...ADVENTURER, recovery: BUTTONS }), onDone);
    expect(screen.getByText('Short rest')).toBeTruthy();
    expect(screen.getByText('Long rest')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('add a button to the template as one step of its history', () => {
    const session = new FakeSession(ADVENTURER);
    mount(session);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Add a recovery action' })); });
    const name = screen.getByRole('textbox');
    fireEvent.change(name, { target: { value: 'Long rest' } });
    act(() => { fireEvent.keyDown(name, { key: 'Enter' }); });
    expect(session.steps).toBe(1);
    expect(session.getSnapshot().template.recovery?.map((button) => button.name)).toEqual(['Long rest']);
  });

  it('leave no key behind once the last button goes', () => {
    expect(withRecovery({ ...ADVENTURER, recovery: BUTTONS }, [])).not.toHaveProperty('recovery');
    expect(withRecovery(ADVENTURER, BUTTONS).recovery).toEqual(BUTTONS);
  });
});
