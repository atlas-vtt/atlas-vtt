import React from 'react';
import { ObsidianMenuDropdown } from '../../shared/ObsidianMenuDropdown';
import { TOKEN_SIZE_OPTIONS } from '../../../../pixi/token-renderer/tokenSizing';

// Prefix numeric keys so JavaScript preserves the size order rather than sorting integer keys first.
const OPTION_PREFIX = 'size:';
const OPTIONS: Record<string, string> = Object.fromEntries(TOKEN_SIZE_OPTIONS.map(option => [`${OPTION_PREFIX}${option.size}`, option.label]));

/** Picks the default grid footprint of a token; `value` is the size multiplier, undefined means 1×1. */
export function TokenSizeSelect({ value, onChange, className }: {
  value: number | undefined;
  onChange: (size: number) => void;
  className?: string;
}): React.JSX.Element {
  return <ObsidianMenuDropdown {...(className && { className })} value={`${OPTION_PREFIX}${value ?? 1}`} options={OPTIONS} onChange={next => onChange(Number(next.slice(OPTION_PREFIX.length)))} />;
}
