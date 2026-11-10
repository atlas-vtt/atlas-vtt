import { ROLL_MODES, type RollMode } from '../protocol/index.ts';
import { Check } from 'lucide-react';
import type { ReactElement } from 'react';
import { Button } from '../../packages/components/primitives/button';
import { DropdownMenuItem } from '../../packages/components/primitives/DropdownMenuItem';
import { AuthorDisc } from './AuthorDisc.tsx';
import { ComposerMenu } from './ComposerMenu.tsx';
import type { SpeakerOption } from './panelTypes.ts';
import { ROLL_MODE_INFO } from './rollModes.ts';
import { SpeakerFace } from './SpeakerFace.tsx';

/** A speaker as the composer draws it: the viewer's own disc, or the token's portrait or letter. */
function SpeakerIcon({ option, self }: { readonly option: SpeakerOption; readonly self: string | null }): ReactElement {
  const who = self ?? '';
  return option.kind === 'self' ? <AuthorDisc who={who} name={option.name} size="chip" /> : <SpeakerFace name={option.name} portrait={option.portrait} who={who} size="chip" />;
}

export interface SpeakerMenuProps {
  readonly speakers: readonly SpeakerOption[];
  readonly chosen: SpeakerOption;
  readonly self: string | null;
  readonly open: boolean;
  readonly disabled: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChoose: (key: string) => void;
}

/** Who the viewer speaks and rolls as: a chip with the speaker's face, and a menu of the viewer and their tokens. */
export function SpeakerMenu({ speakers, chosen, self, open, disabled, onOpenChange, onChoose }: SpeakerMenuProps): ReactElement {
  return (
    <ComposerMenu
      label={`Speaking as ${chosen.kind === 'self' ? 'yourself' : chosen.name}`} open={open} onOpenChange={onOpenChange} disabled={disabled}
      triggerClassName="atlas-online-log__chip-button atlas-online-log__speaker-chip" face={<SpeakerIcon option={chosen} self={self} />}
    >
      {speakers.map((option) => (
        <Button
          key={option.key} variant="ghost" size="sm" role="menuitem" data-chosen={option.key === chosen.key}
          className="atlas-dropdown-menu-item atlas-online-log__speaker-item" onClick={() => onChoose(option.key)}
        >
          <span className="atlas-dropdown-menu-item__check">{option.key === chosen.key && <Check />}</span>
          <SpeakerIcon option={option} self={self} />
          <span className="atlas-online-log__speaker-item-name">{option.kind === 'self' ? `${option.name} (you)` : option.name}</span>
        </Button>
      ))}
    </ComposerMenu>
  );
}

export interface RollModeMenuProps {
  readonly mode: RollMode;
  readonly open: boolean;
  readonly disabled: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onChoose: (mode: RollMode) => void;
}

/** Who sees the viewer's rolls: a button with the mode's icon, and a menu of the four modes. */
export function RollModeMenu({ mode, open, disabled, onOpenChange, onChoose }: RollModeMenuProps): ReactElement {
  const Icon = ROLL_MODE_INFO[mode].icon;
  return (
    <ComposerMenu
      label={`Roll mode: ${ROLL_MODE_INFO[mode].choice}`} open={open} onOpenChange={onOpenChange} disabled={disabled}
      triggerClassName={`atlas-online-log__chip-button atlas-online-log__mode-button${mode === 'public' ? '' : ' is-private'}`} face={<Icon />}
    >
      {ROLL_MODES.map((option) => (
        <DropdownMenuItem key={option} role="menuitem" icon={ROLL_MODE_INFO[option].icon} label={ROLL_MODE_INFO[option].choice} isActive={option === mode} onClick={() => onChoose(option)} />
      ))}
    </ComposerMenu>
  );
}
