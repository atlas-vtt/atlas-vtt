import React, { useId, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, Ellipsis } from 'lucide-react';
import { LIGHT_GLYPH_PATHS, LIGHT_GLYPH_VIEW_BOX } from '../../lighting/lightGlyphs';
import { asCustomLight, emissionOf, lightPresetChips, lightPresetOf } from '../../lighting/lightPresetChoice';
import { LabelTooltip } from '../../packages/components/primitives/tooltip';
import { useExclusiveDropdown } from '../../packages/components/primitives/useExclusiveDropdown';
import { renderEntries, type ContextMenuEntry } from '../../react/components/context-menu/AtlasContextMenu';
import type { LightPresetDefinition } from '../../types/lightPresetTypes';
import type { LightEmission, LightKind } from '../../types/lightingTypes';
import { lightMarkerLook, lightMarkerTheme } from './lightMarker';

const CUSTOM_LIGHT = 'Custom light';
const AT_REST = { hovered: false, selected: false, dragging: false };

const cssColor = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** The glyph of a kind of light, as on its map marker; it takes the text colour. */
function LightGlyph({ kind }: { kind: LightKind }): React.ReactElement {
  return (
    <svg className="atlas-light-glyph" viewBox={LIGHT_GLYPH_VIEW_BOX} aria-hidden="true">
      <path d={LIGHT_GLYPH_PATHS[kind]} fill="currentColor" />
    </svg>
  );
}

interface LightPresetChipsProps {
  emission: LightEmission;
  /** The lights of the map's collection. */
  presets: readonly LightPresetDefinition[];
  onChange: (next: LightEmission) => void;
}

/**
 * The collection's lights as one row of chips with their marker glyphs. A preset brings its
 * light; "Custom" keeps the light as it is and gives it the plain marker. A collection with
 * more lights than fit shows its common ones as chips and the others, with Custom, in a menu
 * behind the last chip.
 */
export function LightPresetChips({ emission, presets, onChange }: LightPresetChipsProps): React.ReactElement {
  const labelId = useId();
  const current = lightPresetOf(emission, presets);
  const { chips, more } = lightPresetChips(presets);
  const makeCustom = (): void => onChange(asCustomLight(emission));
  // The chosen chip is the light's marker in small: the theme's badge, with the glyph in the light's colour.
  const theme = lightMarkerTheme();
  const look = lightMarkerLook({ id: '', kind: 'light', x: 0, y: 0, emission }, AT_REST, theme);
  const style = { '--atlas-light-badge': cssColor(theme.background), '--atlas-light-tint': cssColor(look.glyphTint) } as React.CSSProperties;
  return (
    <div className="atlas-light-popover__kinds" role="group" aria-labelledby={labelId} style={style}>
      <span id={labelId} hidden>Kind of light</span>
      {chips.map((preset) => (
        <LabelTooltip key={preset.id} label={preset.name}>
          <button type="button" className="atlas-light-kind" aria-pressed={preset === current} onClick={() => onChange(emissionOf(preset))}>
            <LightGlyph kind={preset.kind} />
          </button>
        </LabelTooltip>
      ))}
      {more.length > 0 ? (
        <MoreLights more={more} current={current} onPick={(preset) => onChange(emissionOf(preset))} onCustom={makeCustom} />
      ) : (
        <LabelTooltip label={CUSTOM_LIGHT}>
          <button type="button" className="atlas-light-kind" aria-pressed={current === null} onClick={makeCustom}>
            <LightGlyph kind="custom" />
          </button>
        </LabelTooltip>
      )}
    </div>
  );
}

interface MoreLightsProps {
  more: readonly LightPresetDefinition[];
  /** The light's preset, which may be one of the chips; null for a custom light. */
  current: LightPresetDefinition | null;
  onPick: (preset: LightPresetDefinition) => void;
  onCustom: () => void;
}

/**
 * The last chip of a row that cannot show every light: a menu of the others and Custom. While
 * the light is one of them, the chip is the chosen one and wears that light's glyph.
 */
function MoreLights({ more, current, onPick, onCustom }: MoreLightsProps): React.ReactElement {
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const { isOpen, setIsOpen, onCloseAutoFocus } = useExclusiveDropdown();
  const chosen = current === null ? { name: CUSTOM_LIGHT, kind: 'custom' as const } : more.find((preset) => preset === current);
  const entries: ContextMenuEntry[] = [
    ...more.map((preset): ContextMenuEntry => ({
      type: 'item', label: preset.name, leading: <LightGlyph kind={preset.kind} />, checked: preset === current, onClick: () => onPick(preset),
    })),
    { type: 'item', label: CUSTOM_LIGHT, leading: <LightGlyph kind="custom" />, checked: current === null, onClick: onCustom },
  ];
  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <LabelTooltip label={chosen ? `${chosen.name}, more lights` : 'More lights'}>
        <DropdownMenu.Trigger asChild>
          <button ref={setTrigger} type="button" className="atlas-light-kind atlas-light-kind--more" aria-pressed={chosen !== undefined}>
            {chosen ? <LightGlyph kind={chosen.kind} /> : <Ellipsis className="atlas-light-kind__dots" aria-hidden="true" />}
            <ChevronDown className="atlas-light-kind__chevron" aria-hidden="true" />
          </button>
        </DropdownMenu.Trigger>
      </LabelTooltip>
      {/* Inside the panel that holds the chips: the menu stacks above it, and a press in the menu is a press in that panel. */}
      <DropdownMenu.Portal container={trigger?.closest<HTMLElement>('.atlas-light-popover, .atlas-modal') ?? trigger?.ownerDocument.body}>
        <DropdownMenu.Content
          className="atlas-ctx-menu atlas-ctx-menu--dropdown atlas-light-more"
          side="bottom"
          align="end"
          sideOffset={4}
          collisionPadding={8}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          {renderEntries(entries, () => setIsOpen(false))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
