import { describe, expect, it } from 'vitest';
import { fsLayoutToTemplate } from '../../../../src/app/statblocks/fs/fsLayoutToTemplate';
import { replacedIntegration } from '../../../../src/app/statblocks/fs/fsIntegrations';
import type { FsLayout } from '../../../../src/app/statblocks/fs/fsLayoutTypes';
import { expectParses, lostCode } from './fsCodeKit';
import { fieldOutline, outline } from './fsOutline';

const LEFT_OUT = "Fantasy Statblocks' Initiative Tracker buttons were left out: Atlas has its own initiative tracker.";

/** The two buttons Basic 5e draws beside the name, as Fantasy Statblocks writes them. */
const NEW_ENCOUNTER: Record<string, unknown> = {
  type: 'action', id: 'fa99eb194998', icon: 'sword', callback: 'try { InitiativeTracker.newEncounter({roll: true, creatures: [monster]}); } catch(e) {}',
};
const ADD_TO_ENCOUNTER: Record<string, unknown> = {
  type: 'action', id: 'c9c81a4be889', icon: 'plus-with-circle', callback: 'try { InitiativeTracker.addCreatures([monster]); } catch(e) {}',
};

/** Basic 5e's name block: the name heading with the buttons in an inline row, the size, type and alignment under them. */
function headerLayout(buttons: readonly Record<string, unknown>[]): FsLayout {
  return {
    id: 'header-with-buttons', name: 'Header with buttons',
    blocks: [{
      type: 'group', id: 'g1', properties: ['name', 'size', 'type', 'alignment'], conditioned: true,
      nested: [
        { type: 'inline', id: 'i1', properties: [], nested: [
          { type: 'heading', id: 'h1', properties: ['name'], conditioned: true, size: 1 },
          { type: 'inline', id: 'i2', properties: [], nested: buttons },
        ] },
        { type: 'subheading', id: 's1', properties: ['size', 'type', 'alignment'], conditioned: true, separator: ', ' },
      ],
    }, { type: 'property', id: 'p1', properties: ['speed'], display: 'Speed', conditioned: true }],
  } as unknown as FsLayout;
}

describe('buttons for a plugin Atlas stands in for', () => {
  it('are recognised by what they call: the Initiative Tracker global, the plugin by its id, or one of its commands', () => {
    expect(replacedIntegration(NEW_ENCOUNTER)).toBe(LEFT_OUT);
    expect(replacedIntegration(ADD_TO_ENCOUNTER)).toBe(LEFT_OUT);
    expect(replacedIntegration({ type: 'action', callback: 'window.InitiativeTracker?.addCreatures([monster])' })).toBe(LEFT_OUT);
    expect(replacedIntegration({ type: 'action', callback: 'app.plugins.getPlugin("initiative-tracker").api.addCreatures([monster])' })).toBe(LEFT_OUT);
    expect(replacedIntegration({ type: 'action', callback: "app.plugins.plugins['initiative-tracker'].api.addCreatures([monster])" })).toBe(LEFT_OUT);
    expect(replacedIntegration({ type: 'action', action: 'initiative-tracker:open-tracker' })).toBe(LEFT_OUT);
  });

  it('never take another button, a script that is no button, or a name that only looks alike', () => {
    expect(replacedIntegration({ type: 'action', callback: 'app.commands.executeCommandById("dice-roller:open")' })).toBeNull();
    expect(replacedIntegration({ type: 'action', action: 'dice-roller:open' })).toBeNull();
    expect(replacedIntegration({ type: 'action', callback: 'MyInitiativeTracker.add(monster)' })).toBeNull();
    expect(replacedIntegration({ type: 'action', callback: 'tracker.InitiativeTracker.add(monster)' })).toBeNull();
    expect(replacedIntegration({ type: 'action' })).toBeNull();
    expect(replacedIntegration({ type: 'javascript', code: 'InitiativeTracker.addCreatures([monster]);' })).toBeNull();
  });

  it('are left out of the template with one sentence in the report, and leave no empty row behind', () => {
    const { template, report } = fsLayoutToTemplate(headerLayout([NEW_ENCOUNTER, ADD_TO_ENCOUNTER]), { id: 'buttons-abc123' });
    expect(outline(template.layout.blocks)).toEqual([
      'section whenEmpty="fold"',
      '  line size,type,alignment separator=", " whenEmpty="fold"',
      'stat speed whenEmpty="fold"',
    ]);
    expect(report.scripts).toEqual([]);
    expect(report.dropped).toEqual([LEFT_OUT]);
    expect(fieldOutline(template.fields)).toContain('speed: text "Speed"');
    expectParses(template);
    expect(lostCode(headerLayout([NEW_ENCOUNTER, ADD_TO_ENCOUNTER]), template)).toEqual([]);
  });

  it('keep any other button beside them as a script block, and report it', () => {
    const other = { type: 'action', id: 'b3', icon: 'dice', callback: 'app.commands.executeCommandById("dice-roller:open")' };
    const { template, report } = fsLayoutToTemplate(headerLayout([NEW_ENCOUNTER, other]), { id: 'buttons-abc123' });
    expect(outline(template.layout.blocks).map((line) => line.trim())).toContain('script summary="A button that runs JavaScript"');
    expect(report.scripts.map((script) => script.summary)).toEqual(['A button that runs JavaScript']);
    expect(report.dropped).toEqual([LEFT_OUT]);
  });
});
