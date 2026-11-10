// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SVGProps } from 'react';

vi.mock('@radix-ui/react-tooltip', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Arrow: () => null,
  Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { Toggle } from '../../src/app/packages/components/primitives/Toggle';

function OnIcon(props: SVGProps<SVGSVGElement>) {
  return <svg data-testid="icon-on" {...props} />;
}

function OffIcon(props: SVGProps<SVGSVGElement>) {
  return <svg data-testid="icon-off" {...props} />;
}

describe('Toggle primitive', () => {
  it('maps true value to on visuals and on icon', () => {
    const { container } = render(
      <Toggle
        value={true}
        onChange={() => {}}
        iconOn={OnIcon}
        iconOff={OffIcon}
        tooltipOn="On"
        tooltipOff="Off"
      />
    );

    expect(container.querySelector('.atlas-toggle')).not.toBeNull();
    expect(container.querySelector('.atlas-toggle__switch--on')).not.toBeNull();
    expect(container.querySelector('.atlas-toggle__thumb--on')).not.toBeNull();
    expect(screen.getByTestId('icon-on')).not.toBeNull();
    expect(screen.queryByTestId('icon-off')).toBeNull();
    expect(screen.getByText('On')).not.toBeNull();
  });

  it('maps false value to off visuals and off icon', () => {
    const { container } = render(
      <Toggle
        value={false}
        onChange={() => {}}
        iconOn={OnIcon}
        iconOff={OffIcon}
        tooltipOn="On"
        tooltipOff="Off"
      />
    );

    expect(container.querySelector('.atlas-toggle')).not.toBeNull();
    expect(container.querySelector('.atlas-toggle__switch--off')).not.toBeNull();
    expect(container.querySelector('.atlas-toggle__thumb--off')).not.toBeNull();
    expect(screen.getByTestId('icon-off')).not.toBeNull();
    expect(screen.queryByTestId('icon-on')).toBeNull();
    expect(screen.getByText('Off')).not.toBeNull();
  });
});
