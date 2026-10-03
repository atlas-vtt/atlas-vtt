import { render, screen } from '@testing-library/react';
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
});
