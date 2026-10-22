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
