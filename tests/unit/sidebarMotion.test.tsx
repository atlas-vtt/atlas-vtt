// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { motion, type Variants } from 'framer-motion';
import {
  sidebarContentVariants, sidebarMotionState, sidebarVariants, stillSidebarContentVariants, stillSidebarVariants, type SidebarMotionState,
} from '../../src/app/packages/components/asset-manager/components/sidebarMotion';

afterEach(cleanup);

const wait = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

function Card({ state, variants }: { state: SidebarMotionState; variants: Variants }): React.JSX.Element {
  return <motion.aside data-testid="sidebar" variants={variants} initial={false} animate={state} />;
}

describe('the sidebar card', () => {
  it.each([
    ['sidebarVariants', sidebarVariants],
    ['sidebarContentVariants', sidebarContentVariants],
    ['stillSidebarVariants', stillSidebarVariants],
    ['stillSidebarContentVariants', stillSidebarContentVariants],
  ])('%s sets nothing at a motion\'s end, which a motion cut short would still apply', (_name, variants) => {
    for (const variant of Object.values(variants)) expect(variant).not.toHaveProperty('transitionEnd');
  });

  it.each([
    ['hidden and shown again', sidebarMotionState(true, false), sidebarMotionState(false, false)],
    ['hidden while floating and docked by a wider window', sidebarMotionState(true, false), sidebarMotionState(false, false)],
    ['hidden and peeked again', sidebarMotionState(true, false), sidebarMotionState(true, true)],
  ])('%s within 120 ms ends where its state says, and visible', async (_label, middle, end) => {
    for (const variants of [sidebarVariants, stillSidebarVariants]) {
      const { rerender, getByTestId, unmount } = render(<Card state="docked" variants={variants} />);
      rerender(<Card state={middle} variants={variants} />);
      await wait(120);
      rerender(<Card state={end} variants={variants} />);
      await wait(700);
      const card = getByTestId('sidebar');
      expect(card.style.visibility).not.toBe('hidden');
      expect(card.style.transform).toMatch(/translateX\(0%\)|none|^$/);
      if (variants === stillSidebarVariants) expect(card.style.opacity).toBe('1');
      unmount();
    }
  });
});
