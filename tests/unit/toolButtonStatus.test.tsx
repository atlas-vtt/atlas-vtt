import { render, screen } from '@testing-library/react';
import { Dices } from 'lucide-react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import ToolButton from '../../src/app/packages/components/primitives/ToolButton';

function renderButton(status?: string): HTMLElement {
  return render(
    <TooltipProvider>
      <ToolButton icon={Dices} label="Roll Dice" isActive={false} onClick={() => undefined} {...(status ? { status } : {})} />
    </TooltipProvider>
  ).container;
}

describe('a toolbar button with a status', () => {
  it('says the status to screen readers', () => {
    renderButton('Secret roll on');
    expect(screen.getByRole('button', { name: /Secret roll on/ })).not.toBeNull();
  });

  it('draws a dot on the button', () => {
    const container = renderButton('Secret roll on');
    expect(container.querySelector('.atlas-tool-button__badge')).not.toBeNull();
  });

  it('draws no dot without a status', () => {
    const container = renderButton();
    expect(container.querySelector('.atlas-tool-button__badge')).toBeNull();
  });

  it('names the button by its label alone without a status', () => {
    renderButton();
    expect(screen.getByRole('button').textContent).toBe('Roll Dice');
  });
});
