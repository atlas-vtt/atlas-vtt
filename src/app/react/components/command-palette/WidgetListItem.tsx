import React from 'react';
import { Globe, MapPin, Pencil, Trash2, Users } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { AnyWidget } from '../../../types/widgetTypes';
import { isCollectionWidget } from '../../../utils/collectionWidgets';
import { WidgetIconGlyph } from '../WidgetIconGlyph';
import { t } from '../../../i18n';

interface WidgetListItemProps {
  widget: AnyWidget;
  /** Whether the widget is switched on in this scene. */
  active: boolean;
  /** Scenes in a collection can switch widgets on in every scene. */
  inCollection: boolean;
  onEdit: () => void;
  onUpdate: (changes: Partial<AnyWidget>) => void;
  onToggleHere: () => void;
  onToggleEveryScene: () => void;
  onDelete: () => void;
}

function whereShown(everyScene: boolean, active: boolean): string {
  if (everyScene) return active ? 'every scene' : 'every scene, off here';
  return active ? 'this scene' : 'off here';
}

interface ToggleButtonProps {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ToggleButton({ label, pressed, onClick, children }: ToggleButtonProps): React.ReactElement {
  return (
    <LabelTooltip label={label}>
      <Button
        variant="ghost"
        size="icon"
        className={cn('atlas-command-palette-icon-btn', pressed && 'atlas-active')}
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={label}
      >
        {children}
      </Button>
    </LabelTooltip>
  );
}

/** One widget of the widget settings list, with where it is switched on and its controls. */
export function WidgetListItem({
  widget, active, inCollection, onEdit, onUpdate, onToggleHere, onToggleEveryScene, onDelete,
}: WidgetListItemProps): React.ReactElement {
  const everyScene = isCollectionWidget(widget);
  return (
    <div className={cn('atlas-command-palette-widget-item', !active && 'atlas-command-palette-widget-item--off')}>
      <WidgetIconGlyph icon={widget.icon} size={20} {...(widget.color !== undefined ? { color: widget.color } : {})} />
      <div className="atlas-command-palette-widget-info">
        <div className="atlas-command-palette-widget-name">{widget.label}</div>
        <div className="atlas-command-palette-widget-type">
          {inCollection ? `${widget.type} · ${whereShown(everyScene, active)}` : `${widget.type}${active ? '' : ' · off'}`}
        </div>
      </div>
      <div className="atlas-command-palette-widget-controls">
        <LabelTooltip label={t('widgets.editNameIcon')}>
          <Button variant="ghost" size="icon" className="atlas-command-palette-icon-btn" onClick={onEdit} aria-label={t('widgets.editNameIcon')}>
            <Pencil />
          </Button>
        </LabelTooltip>
        <ToggleButton
          label={widget.visibleToPlayers ? t('widgets.hideFromPlayers') : t('widgets.showToPlayers')}
          pressed={widget.visibleToPlayers}
          onClick={() => onUpdate({ visibleToPlayers: !widget.visibleToPlayers })}
        >
          <Users />
        </ToggleButton>
        <ToggleButton
          label={active ? t('widgets.switchOff') : t('widgets.switchOn')}
          pressed={active}
          onClick={onToggleHere}
        >
          <MapPin />
        </ToggleButton>
        {inCollection && (
          <ToggleButton
            label={everyScene ? t('widgets.onlyWhereOn') : t('widgets.everyScene')}
            pressed={everyScene}
            onClick={onToggleEveryScene}
          >
            <Globe />
          </ToggleButton>
        )}
        <LabelTooltip label={inCollection ? t('widgets.deleteEverywhere') : t('widgets.delete')}>
          <Button
            variant="ghost"
            size="icon"
            className="atlas-command-palette-icon-btn atlas-icon-btn--danger"
            onClick={onDelete}
            aria-label={inCollection ? t('widgets.deleteEverywhere') : t('widgets.delete')}
          >
            <Trash2 />
          </Button>
        </LabelTooltip>
      </div>
    </div>
  );
}
