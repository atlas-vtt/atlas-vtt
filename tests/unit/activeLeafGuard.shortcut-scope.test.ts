// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isShortcutScopeActive } from '../../src/app/utils/activeLeafGuard';

describe('isShortcutScopeActive', () => {
  it('returns true when the scope is inside the active workspace leaf', () => {
    document.body.innerHTML = `
      <div class="workspace-leaf mod-active">
        <div id="scope"></div>
      </div>
      <div class="workspace-leaf">
        <div id="other"></div>
      </div>
    `;

    const scope = document.getElementById('scope');
    expect(isShortcutScopeActive(scope)).toBe(true);
  });

  it('returns false when the scope is inside an inactive workspace leaf', () => {
    document.body.innerHTML = `
      <div class="workspace-leaf mod-active">
        <div id="active"></div>
      </div>
      <div class="workspace-leaf">
        <div id="scope"></div>
      </div>
    `;

    const scope = document.getElementById('scope');
    expect(isShortcutScopeActive(scope)).toBe(false);
  });

  it('returns true for a focused portal scope outside workspace leaves', () => {
    document.body.innerHTML = `
      <div class="workspace-leaf mod-active">
        <div id="active"></div>
      </div>
      <div id="portal">
        <input id="portal-input" />
      </div>
    `;

    const portal = document.getElementById('portal') as HTMLDivElement | null;
    const input = document.getElementById('portal-input') as HTMLInputElement | null;
    input?.focus();

    expect(isShortcutScopeActive(portal)).toBe(true);
  });

  it('returns false for an unfocused portal scope outside workspace leaves', () => {
    document.body.innerHTML = `
      <div class="workspace-leaf mod-active">
        <button id="active-button">Active</button>
      </div>
      <div id="portal">
        <input id="portal-input" />
      </div>
    `;

    const portal = document.getElementById('portal') as HTMLDivElement | null;
    const button = document.getElementById('active-button') as HTMLButtonElement | null;
    button?.focus();

    expect(isShortcutScopeActive(portal)).toBe(false);
  });
});
