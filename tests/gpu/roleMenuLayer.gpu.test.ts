import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import mainCss from '../../styles/main.scss?inline';
import menuCss from '../../src/app/react/components/context-menu/atlas-context-menu.scss?inline';
import roleCss from '../../src/app/statblocks/editor/create/create-statblock.scss?inline';
import { portalHost, releasePortalHosts } from '../../src/app/host/portalHost';
import { NewStatblockButton } from '../../src/app/statblocks/editor/create/RoleMenu';
import type { RoleChoice } from '../../src/app/statblocks/editor/create/roleChoices';

const h = React.createElement;

const CHOICES: RoleChoice[] = [
  { roleId: 'creature', name: 'Creature', templateName: 'Creature' },
  { roleId: 'npc', name: 'NPC', templateName: 'Creature' },
];

/**
 * The Link statblock dialog's chrome with "New statblock…" in its footer, mounted where each entry point puts it:
 * from a token on the map `StatblockDialogService` renders it into its own root in the portal host; the asset
 * manager renders it inside its own container there.
 */
function mountDialog(wrapperClass: string): HTMLElement {
  const wrapper = portalHost().createDiv({ cls: wrapperClass });
  render(
    h('div', { className: 'atlas-modal-overlay' },
      h('div', { className: 'atlas-statblock-link', role: 'dialog', 'aria-modal': true },
        h('div', { className: 'atlas-statblock-link__footer' },
          h(NewStatblockButton, { choices: CHOICES, onChoose: () => undefined })))),
    { container: wrapper },
  );
  return wrapper;
}

describe('the role menu of "New statblock…" in the Link statblock dialog', () => {
  const style = document.createElement('style');
  style.textContent = `${mainCss}\n${menuCss}\n${roleCss}`;

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    releasePortalHosts();
    style.remove();
  });

  it.each([
    ['a token on the map', 'atlas-vtt-plugin atlas-vtt-root'],
    ['the asset manager', 'atlas-vtt-plugin atlas-global-asset-manager-container'],
  ])('opens in front of the dialog opened from %s', async (_from, wrapperClass) => {
    const wrapper = mountDialog(wrapperClass);
    const trigger = wrapper.querySelector<HTMLButtonElement>('.atlas-sb-new-statblock');
    expect(trigger).not.toBeNull();

    await act(async () => { await userEvent.click(trigger!); });
    await expect.poll(() => document.querySelector('.atlas-ctx-menu')).not.toBeNull();
    const menu = document.querySelector<HTMLElement>('.atlas-ctx-menu')!;
    await expect.poll(() => menu.getBoundingClientRect().height).toBeGreaterThan(0);

    for (const item of menu.querySelectorAll<HTMLElement>('.atlas-ctx-item')) {
      const box = item.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      expect(hit?.closest('.atlas-ctx-menu')).toBe(menu);
    }
  });
});
