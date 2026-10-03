import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DiceTray } from '../../src/app/react/components/dice/DiceTray';

function renderTray(props: Partial<React.ComponentProps<typeof DiceTray>> = {}): void {
  render(
    <DiceTray
      onRoll={vi.fn()}
      secretRoll={false}
      onSecretRollChange={vi.fn()}
      secretRollAvailable
      {...props}
    />
  );
}

describe('the dice tray secret roll switch', () => {
  it('shows a Secret roll switch that is off by default', () => {
    renderTray();
    expect(screen.getByRole('switch', { name: 'Secret roll' }).getAttribute('aria-checked')).toBe('false');
  });

  it('asks to switch the secret roll on when the switch is clicked', () => {
    const onSecretRollChange = vi.fn();
    renderTray({ onSecretRollChange });
    fireEvent.click(screen.getByRole('switch', { name: 'Secret roll' }));
    expect(onSecretRollChange).toHaveBeenCalledWith(true);
  });

  it('asks to switch the secret roll on when Space is pressed on the switch', () => {
    const onSecretRollChange = vi.fn();
    renderTray({ onSecretRollChange });
    fireEvent.keyDown(screen.getByRole('switch', { name: 'Secret roll' }), { key: ' ' });
    expect(onSecretRollChange).toHaveBeenCalledWith(true);
  });

  it('asks to switch the secret roll on when Enter is pressed on the switch', () => {
    const onSecretRollChange = vi.fn();
    renderTray({ onSecretRollChange });
    fireEvent.keyDown(screen.getByRole('switch', { name: 'Secret roll' }), { key: 'Enter' });
    expect(onSecretRollChange).toHaveBeenCalledWith(true);
  });

  it('asks to switch the secret roll off when the switch is on and clicked', () => {
    const onSecretRollChange = vi.fn();
    renderTray({ secretRoll: true, onSecretRollChange });
    fireEvent.click(screen.getByRole('switch', { name: 'Secret roll' }));
    expect(onSecretRollChange).toHaveBeenCalledWith(false);
  });

  it('keeps the switch in the tray but disabled while Show dice rolls is off', () => {
    renderTray({ secretRollAvailable: false });
    expect(screen.getByRole('switch', { name: 'Secret roll' }).getAttribute('aria-disabled')).toBe('true');
  });
});
