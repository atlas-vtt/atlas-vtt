// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DropdownMenu } from '../../src/app/packages/components/primitives/DropdownMenu';

function Harness(): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div>
      <button data-testid="toggle" onClick={() => setIsOpen(prev => !prev)}>
        Toggle
      </button>
      <button data-testid="outside">Outside</button>
      <DropdownMenu
        isOpen={isOpen}
        onToggle={() => setIsOpen(prev => !prev)}
        label="Test menu"
        showTrigger={false}
      >
        <button type="button">Option A</button>
      </DropdownMenu>
    </div>
  );
}

describe('DropdownMenu outside click behavior', () => {
  it('closes when clicking outside', () => {
    render(<Harness />);

    fireEvent.click(screen.getByTestId('toggle'));
    expect(screen.getByText('Option A')).not.toBeNull();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Option A')).toBeNull();
  });

  it('stays open when clicking inside dropdown content', () => {
    render(<Harness />);

    fireEvent.click(screen.getByTestId('toggle'));
    const option = screen.getByText('Option A');
    expect(option).not.toBeNull();

    fireEvent.mouseDown(option);
    expect(screen.queryByText('Option A')).not.toBeNull();
  });
});

describe('DropdownMenu in a map of its own window', () => {
  /** A map in a popout renders its menus into the popout's document; the main document hears none of its presses. */
  function openInPopout(): { popout: Document; unmount: () => void } {
    // jsdom gives an iframe a window and document of its own, as a popout has.
    const popout = document.body.appendChild(document.createElement('iframe')).contentDocument as Document;
    const container = popout.body.appendChild(popout.createElement('div'));
    const { unmount } = render(<Harness />, { container, baseElement: popout.body });
    fireEvent.click(popout.querySelector('[data-testid="toggle"]') as HTMLElement);
    expect(popout.body.textContent).toContain('Option A');
    return { popout, unmount };
  }

  it('closes on a press outside it in its own window', () => {
    const { popout, unmount } = openInPopout();
    fireEvent.mouseDown(popout.querySelector('[data-testid="outside"]') as HTMLElement);
    expect(popout.body.textContent).not.toContain('Option A');
    unmount();
  });

  it('closes on Escape in its own window', () => {
    const { popout, unmount } = openInPopout();
    fireEvent.keyDown(popout.body, { key: 'Escape' });
    expect(popout.body.textContent).not.toContain('Option A');
    unmount();
  });

  it('stays open for a press in another window', () => {
    const { popout, unmount } = openInPopout();
    fireEvent.mouseDown(document.body);
    expect(popout.body.textContent).toContain('Option A');
    unmount();
  });
});
