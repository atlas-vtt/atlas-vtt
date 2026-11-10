// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatblockTokenResources } from '../../src/app/react/components/statblock/StatblockTokenResources';
import type { StatblockLayout } from '../../src/app/react/components/statblock/statblockTypes';
import { AMMO, HP, STR, STRESS } from '../mocks/resourceFixtures';

const definitions = [HP, STRESS];
const layout: StatblockLayout = { id: 'daggerheart-adversary', name: 'Daggerheart Adversary', blocks: [] };
const basic: StatblockLayout = { id: 'basic', name: 'Basic', blocks: [] };
const monster = { name: 'Acid Burrower', hp: 8, stress: 3 };
const tokens = [1, 2, 3, 4].map((n) => ({ id: `token-${n}`, name: monster.name, instanceNumber: n,
  resources: { hp: { current: n === 1 ? 5 : 8, max: 8 }, stress: { current: 0, max: 3 } } }));
const actions = () => ({ onLocateToken: vi.fn(), onHoverToken: vi.fn(), onUpdateToken: vi.fn(), definitions, layout });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('per-token statblock controls', () => {
  it('identifies and locates individual tokens without conflating identical names', () => {
    const handlers = actions();
    render(<StatblockTokenResources {...handlers} monster={monster} tokens={tokens} />);
    const name = screen.getByRole('button', { name: 'Locate Acid Burrower #2 on map' });
    fireEvent.mouseEnter(name);
    expect(handlers.onHoverToken).toHaveBeenCalledWith('token-2');
    fireEvent.click(name);
    expect(handlers.onLocateToken).toHaveBeenCalledWith('token-2');
    expect(handlers.onUpdateToken).not.toHaveBeenCalled();
  });

  it('updates damage and stress pips on only the chosen token', () => {
    const handlers = actions();
    const { rerender } = render(<StatblockTokenResources {...handlers} monster={monster} tokens={tokens} />);
    const first = screen.getByRole('group', { name: 'Acid Burrower #1' });
    fireEvent.click(within(first).getByRole('checkbox', { name: 'HP damage 4 of 8' }));
    expect(handlers.onUpdateToken).toHaveBeenLastCalledWith('token-1', { resources: { hp: { current: 4, max: 8 }, stress: { current: 0, max: 3 } } });
    rerender(<StatblockTokenResources {...handlers} monster={monster}
      tokens={[{ ...tokens[0]!, resources: { ...tokens[0]!.resources, hp: { current: 4, max: 8 } } }, ...tokens.slice(1)]} />);
    fireEvent.click(within(first).getByRole('checkbox', { name: 'HP damage 4 of 8' }));
    expect(handlers.onUpdateToken).toHaveBeenLastCalledWith('token-1', { resources: { hp: { current: 5, max: 8 }, stress: { current: 0, max: 3 } } });
    const second = screen.getByRole('group', { name: 'Acid Burrower #2' });
    fireEvent.click(within(second).getByRole('checkbox', { name: 'Stress 2 of 3' }));
    expect(handlers.onUpdateToken).toHaveBeenLastCalledWith('token-2', { resources: { hp: { current: 8, max: 8 }, stress: { current: 2, max: 3 } } });
    expect(handlers.onLocateToken).not.toHaveBeenCalled();
  });

  it('gives every other statblock gauges with bounded plus/minus controls', () => {
    const handlers = { ...actions(), definitions: [HP, AMMO], layout: basic };
    render(<StatblockTokenResources {...handlers} monster={{ name: 'Mage' }}
      tokens={[{ id: 'mage', resources: { hp: { current: 0, max: 27 }, ammo: { current: 12, max: 12 } } }]} />);
    expect((screen.getByRole('button', { name: 'Decrease HP' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('meter', { name: 'HP' }).getAttribute('aria-valuenow')).toBe('0');
    fireEvent.click(screen.getByRole('button', { name: 'Increase HP' }));
    expect(handlers.onUpdateToken).toHaveBeenLastCalledWith('mage', { resources: { hp: { current: 1, max: 27 }, ammo: { current: 12, max: 12 } } });
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Ammo' }));
    expect(handlers.onUpdateToken).toHaveBeenLastCalledWith('mage', { resources: { hp: { current: 0, max: 27 }, ammo: { current: 11, max: 12 } } });
  });

  it('lists the collection resources of each token and edits the one clicked', () => {
    const handlers = { ...actions(), definitions: [HP, STR] };
    render(<StatblockTokenResources {...handlers} monster={{}}
      tokens={[{ id: 't1', name: 'Troll', resources: { hp: { current: 14, max: 14 }, str: { current: 14, max: 14 } } }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease STR' }));
    expect(handlers.onUpdateToken).toHaveBeenCalledWith('t1', { resources: { hp: { current: 14, max: 14 }, str: { current: 13, max: 14 } } });
  });

  it('shows small resources as gauges too where the statblock draws no tracks', () => {
    render(<StatblockTokenResources {...actions()} layout={basic} monster={{ hp: 4 }}
      tokens={[{ id: 't1', name: 'Rat', resources: { hp: { current: 4, max: 4 } } }]} />);
    expect(screen.getByRole('meter', { name: 'HP' })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('lists the further quantities of the statblock and keeps their numbers on the token', () => {
    const handlers = { ...actions(), definitions: [HP], layout: basic };
    render(<StatblockTokenResources {...handlers} monster={{ hp: 5, mana: 10 }}
      tokens={[{ id: 't1', name: 'Mage', resources: { hp: { current: 5, max: 5 }, mana: { current: 3, max: 10 } } }]} />);
    expect(screen.getByRole('meter', { name: 'Mana' }).getAttribute('aria-valuenow')).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: 'Increase Mana' }));
    expect(handlers.onUpdateToken).toHaveBeenCalledWith('t1', { resources: { hp: { current: 5, max: 5 }, mana: { current: 4, max: 10 } } });
  });

  it('keeps map instance numbers after another token is removed', () => {
    render(<StatblockTokenResources {...actions()} monster={monster} tokens={tokens.slice(1, 3)} />);
    expect(screen.getByRole('button', { name: 'Locate Acid Burrower #2 on map' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Locate Acid Burrower #3 on map' })).toBeTruthy();
  });

  it('avoids duplicate labels for tokens whose artwork-based instance numbers collide', () => {
    render(<StatblockTokenResources {...actions()} monster={monster}
      tokens={tokens.slice(0, 2).map((token) => ({ ...token, instanceNumber: 1 }))} />);
    expect(screen.getAllByRole('button', { name: 'Locate Acid Burrower #1 on map' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Locate Acid Burrower #2 on map' })).toBeTruthy();
  });

  it('limits the list to three entries and enables scrolling only when more exist', () => {
    const { container, rerender } = render(<StatblockTokenResources {...actions()} monster={monster} tokens={tokens} />);
    expect(container.querySelector('.atlas-sb-token-list')?.getAttribute('data-scrollable')).toBe('true');
    expect(screen.getAllByRole('group')).toHaveLength(4);
    rerender(<StatblockTokenResources {...actions()} monster={monster} tokens={tokens.slice(0, 3)} />);
    expect(container.querySelector('.atlas-sb-token-list')?.getAttribute('data-scrollable')).toBe('false');
  });
});


it('measures three full entries independently of the DM screen entrance transform', () => {
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('atlas-sb-token-entry') ? Array.from(this.parentElement!.children).indexOf(this) * 105 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(105);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const top = this.offsetTop * 0.97;
    return { top, bottom: top + 105 * 0.97 } as DOMRect;
  });
  const { container } = render(<StatblockTokenResources {...actions()} monster={monster} tokens={tokens} />);
  expect((container.querySelector('.atlas-sb-token-list') as HTMLElement).style.maxHeight).toBe('315px');
});
