// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { TabSwitcher } from '../../src/app/packages/components/asset-manager/components/TabSwitcher';

function counts(failed: boolean): HTMLElement[] {
  render(
    <TooltipProvider>
      <TabSwitcher activeTab="tokens" onTabChange={vi.fn()} assetCounts={null} countsFailed={failed} />
    </TooltipProvider>,
  );
  return [...document.querySelectorAll<HTMLElement>('.atlas-asset-manager-tabs .atlas-tab-count')];
}

describe('the tab counts of a collection', () => {
  it('wait with a placeholder while it is counted', () => {
    expect(counts(false).every((count) => count.querySelector('.atlas-skeleton'))).toBe(true);
  });

  it('stay empty and still when it could not be loaded, as no count is coming', () => {
    const shown = counts(true);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((count) => count.childElementCount === 0 && count.textContent === '')).toBe(true);
  });
});
