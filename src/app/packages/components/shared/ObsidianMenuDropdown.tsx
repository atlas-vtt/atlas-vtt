import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { renderEntries, type ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { Button } from '../primitives/button';
import { useExclusiveDropdown } from '../primitives/useExclusiveDropdown';
import { t } from '../../../i18n';

interface ObsidianMenuDropdownProps {
  id?: string;
  disabled?: boolean;
  value: string;
  options: readonly string[] | Record<string, string>;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Id of a visible label: the trigger is named by it and the value it shows. */
  labelledBy?: string;
  /** What each option does, by option key: shown in a tooltip beside its row. */
  descriptions?: Readonly<Record<string, string>>;
}

const EMPTY_OPTION_LABEL = t('common.none');

function formatOptionLabel(label: string): string {
  const normalizedLabel = label.trim();
  return normalizedLabel.length > 0 ? label : EMPTY_OPTION_LABEL;
}

export const ObsidianMenuDropdown: React.FC<ObsidianMenuDropdownProps> = ({
  id,
  disabled,
  value,
  options,
  onChange,
  placeholder,
  className,
  labelledBy,
  descriptions
}) => {
  const valueId = React.useId();
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const { isOpen, setIsOpen, onCloseAutoFocus } = useExclusiveDropdown();
  const close = (): void => setIsOpen(false);
  const optionEntries = Array.isArray(options)
    ? (options as readonly string[]).map((option) => [option, option] as const)
    : Object.entries(options as Record<string, string>);
  const entries: ContextMenuEntry[] = optionEntries.map(([key, label]) => ({
    type: 'item',
    label: formatOptionLabel(label),
    checked: value === key,
    onClick: () => onChange(key),
    ...(descriptions?.[key] && { description: descriptions[key] }),
  }));

  // Get display value
  let displayValue = value;
  if (!Array.isArray(options) && value) {
    displayValue = (options as Record<string, string>)[value] || value;
  }
  
  return (
    <DropdownMenu.Root open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button
          ref={setTrigger}
          id={id}
          disabled={disabled}
          variant="ghost"
          className={`text-icon-button atlas-obsidian-menu-dropdown ${className || ''}`}
          aria-labelledby={labelledBy ? `${labelledBy} ${valueId}` : undefined}
        >
          <span id={valueId} className="text-button-label">
            {displayValue || placeholder || t('common.select')}
          </span>
          <span className="text-button-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-chevron-down">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={trigger?.closest<HTMLElement>('[role="dialog"], .modal') ?? trigger?.ownerDocument.body}>
        <DropdownMenu.Content
          className="atlas-ctx-menu atlas-ctx-menu--dropdown"
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={(event) => event.stopPropagation()}
        >
          {renderEntries(entries, close)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
