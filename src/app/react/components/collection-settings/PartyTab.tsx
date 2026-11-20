/**
 * PartyTab — Who fights without a token in the initiative tracker: the players at the table, a
 * name and a picture each, and the picture of an enemy added by name.
 */

import React, { useState } from 'react';
import type { App } from 'obsidian';
import { Bot, CircleOff, Plus, Trash2, User } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import { DropdownSwatchGrid } from '../../../packages/components/primitives/DropdownSwatchGrid';
import { RESOURCE_COLORS } from '../../../resources/resourceColors';
import type { PartyMember } from '../../../types/collectionSettingsTypes';
import { PartyImagePicker } from './PartyImagePicker';
import { t } from '../../../i18n';

interface PartyTabProps {
  app: App;
  party: PartyMember[];
  onChange: (party: PartyMember[]) => void;
  /** The picture of an enemy added by name; empty for none. */
  enemyImagePath: string;
  onEnemyImageChange: (path: string) => void;
}

/** Stands in `picking` for the enemy's picture, which no member's id can be. */
const ENEMY = 'enemy';

export function PartyTab({ app, party, onChange, enemyImagePath, onEnemyImageChange }: PartyTabProps): React.ReactElement {
  // The member (or `ENEMY`) whose picture is being picked, and whose colour; one at a time
  const [picking, setPicking] = useState<string | null>(null);
  const [colouring, setColouring] = useState<string | null>(null);

  const update = (id: string, changes: Partial<PartyMember>): void => {
    onChange(party.map((member) => (member.id === id ? { ...member, ...changes } : member)));
  };
  const add = (): void => {
    const member = { id: crypto.randomUUID(), name: '' };
    onChange([...party, member]);
    setPicking(null);
  };

  return (
    <>
      <p className="atlas-csm-hint">{t('csm.party.intro')}</p>

      {party.length > 0 ? (
        <div className="atlas-csm-party-list">
          {party.map((member) => (
            <React.Fragment key={member.id}>
              <div className="atlas-csm-party-member">
                <LabelTooltip label={t('csm.party.pickPicture')}>
                  <button
                    type="button"
                    className="atlas-csm-party-picture"
                    aria-label={t('csm.party.pickPicture')}
                    aria-expanded={picking === member.id}
                    onClick={() => { setPicking(picking === member.id ? null : member.id); setColouring(null); }}
                  >
                    {member.imagePath
                      ? <TokenPortrait src={app.vault.adapter.getResourcePath(member.imagePath)} alt="" showRing />
                      : <User />}
                  </button>
                </LabelTooltip>
                <LabelTooltip label={t('csm.party.pickColour')}>
                  <button
                    type="button"
                    className="atlas-csm-party-colour"
                    aria-label={t('csm.party.pickColour')}
                    aria-expanded={colouring === member.id}
                    data-empty={member.color ? undefined : ''}
                    style={member.color ? { background: member.color } : undefined}
                    onClick={() => { setColouring(colouring === member.id ? null : member.id); setPicking(null); }}
                  />
                </LabelTooltip>
                <input
                  type="text"
                  className="atlas-csm-input"
                  aria-label={t('csm.party.name')}
                  placeholder={t('csm.party.namePlaceholder')}
                  value={member.name}
                  // A new player's row is for typing their name
                  autoFocus={member.name === ''}
                  onChange={(e) => update(member.id, { name: e.target.value })}
                />
                <LabelTooltip label={t('csm.party.remove')}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="atlas-csm-condition-delete"
                    aria-label={t('csm.party.remove')}
                    onClick={() => onChange(party.filter(({ id }) => id !== member.id))}
                  >
                    <Trash2 />
                  </Button>
                </LabelTooltip>
              </div>
              {/* Under the row, not in it: a row would widen to its content */}
              {picking === member.id && (
                <PartyImagePicker app={app} onSelect={(imagePath) => { update(member.id, { imagePath }); setPicking(null); }} />
              )}
              {colouring === member.id && (
                <div className="atlas-csm-party-colours">
                  <DropdownSwatchGrid
                    label={t('csm.party.colour')}
                    swatches={RESOURCE_COLORS}
                    value={member.color ?? ''}
                    onChange={(color) => { update(member.id, { color }); setColouring(null); }}
                  >
                    <LabelTooltip label={t('csm.party.noColour')}>
                      <button
                        type="button"
                        className="atlas-swatch atlas-csm-party-no-colour"
                        aria-label={t('csm.party.noColour')}
                        aria-pressed={!member.color}
                        onClick={() => { update(member.id, { color: undefined }); setColouring(null); }}
                      >
                        <CircleOff aria-hidden="true" />
                      </button>
                    </LabelTooltip>
                  </DropdownSwatchGrid>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div className="atlas-csm-empty">{t('csm.party.none')}</div>
      )}

      <Button variant="ghost" className="atlas-csm-add-btn" onClick={add}>
        <Plus />
        {t('csm.party.add')}
      </Button>

      <div className="atlas-csm-label">{t('csm.party.enemy')}</div>
      <p className="atlas-csm-hint">{t('csm.party.enemyHint')}</p>
      <div className="atlas-csm-party-list">
        <div className="atlas-csm-party-member">
          <LabelTooltip label={t('csm.party.pickPicture')}>
            <button
              type="button"
              className="atlas-csm-party-picture"
              aria-label={t('csm.party.enemyPick')}
              aria-expanded={picking === ENEMY}
              onClick={() => { setPicking(picking === ENEMY ? null : ENEMY); setColouring(null); }}
            >
              {enemyImagePath
                ? <TokenPortrait src={app.vault.adapter.getResourcePath(enemyImagePath)} alt="" showRing />
                : <Bot />}
            </button>
          </LabelTooltip>
          <span className="atlas-csm-party-enemy-name">{t('initiative.enemyName', { number: 1 })}</span>
          {enemyImagePath && (
            <LabelTooltip label={t('csm.party.enemyClear')}>
              <Button variant="ghost" size="icon" className="atlas-csm-condition-delete" aria-label={t('csm.party.enemyClear')} onClick={() => onEnemyImageChange('')}>
                <Trash2 />
              </Button>
            </LabelTooltip>
          )}
        </div>
        {picking === ENEMY && (
          <PartyImagePicker app={app} onSelect={(path) => { onEnemyImageChange(path); setPicking(null); }} />
        )}
      </div>
    </>
  );
}
