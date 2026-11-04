import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { hasAssetTag } from '../../../../services/tagGroups';
import type { AnyAsset, Tag } from '../types';
import { tagPickerOptions, toggleAssetTag } from '../utils/assetTags';
import { useAssetTagMenuActions } from './assetTagMenuContext';
import { STANDING_LIST } from '../../../../keyboard/tooltipEscape';
import { t } from '../../../../i18n';

interface AssetTagPickerProps {
  asset: AnyAsset;
}

/** Search field and tag list of a card's tag menu: toggles tags on the asset and creates new ones. */
export function AssetTagPicker({ asset }: AssetTagPickerProps): React.ReactElement {
  const { tags, setAssetTags, createTag } = useAssetTagMenuActions();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  // Tags assigned when the menu opened stay on top, so rows never jump while toggling.
  const [pinned] = useState(() => new Set(tags.filter((tag) => hasAssetTag(asset.tags, tag)).map((tag) => tag.id)));
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Creating waits for the service; the tags assigned meanwhile must not be lost.
  const latestAsset = useRef(asset);
  latestAsset.current = asset;
  const idPrefix = useId();

  const name = query.trim();
  const options = useMemo(() => tagPickerOptions(tags, pinned, name), [tags, pinned, name]);
  const canCreate = name !== '' && !tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase());
  const rowCount = options.length + (canCreate ? 1 : 0);
  const activeIndex = Math.min(active, rowCount - 1);
  const optionId = (index: number): string => `${idPrefix}-option-${index}`;

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    listRef.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const toggle = (tag: Tag): void => {
    void setAssetTags(asset, toggleAssetTag(asset.tags, tag));
  };

  const create = async (): Promise<void> => {
    if (!canCreate || isCreating) return;
    setIsCreating(true);
    const tag = await createTag(name);
    setIsCreating(false);
    if (!tag) return;
    setQuery('');
    const current = latestAsset.current;
    if (!hasAssetTag(current.tags, tag)) await setAssetTags(current, [...(current.tags ?? []), tag.name]);
  };

  const choose = (index: number): void => {
    const tag = options[index];
    if (tag) toggle(tag);
    else void create();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && rowCount > 0) {
      event.preventDefault();
      setActive((activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + rowCount) % rowCount);
    } else if (event.key === 'Enter' && rowCount > 0) {
      event.preventDefault();
      choose(activeIndex);
    }
  };

  return (
    <>
      <div className="atlas-asset-tag-menu__search">
        <Search aria-hidden />
        {/* Named without aria-label, which Obsidian shows as its own tooltip. */}
        <span id={`${idPrefix}-search-label`} hidden>{t('creator.searchTags')}</span>
        <span id={`${idPrefix}-list-label`} hidden>Tags of {asset.name}</span>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded
          aria-controls={`${idPrefix}-list`}
          aria-activedescendant={rowCount > 0 ? optionId(activeIndex) : undefined}
          aria-labelledby={`${idPrefix}-search-label`}
          placeholder={t('am.tagPicker.placeholder')}
          spellCheck={false}
          autoComplete="off"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={handleKeyDown}
        />
      </div>
      <div
        ref={listRef}
        id={`${idPrefix}-list`}
        role="listbox"
        {...STANDING_LIST}
        aria-multiselectable
        aria-labelledby={`${idPrefix}-list-label`}
        className="atlas-asset-tag-menu__list"
        // Clicks keep focus in the search field.
        onMouseDown={(event) => event.preventDefault()}
      >
        {options.map((tag, index) => {
          const isAssigned = hasAssetTag(asset.tags, tag);
          return (
            <div
              key={tag.id}
              id={optionId(index)}
              role="option"
              aria-selected={isAssigned}
              data-active={index === activeIndex || undefined}
              className="atlas-ctx-item atlas-asset-tag-menu__option"
              onMouseMove={() => setActive(index)}
              onClick={() => toggle(tag)}
            >
              <span className="atlas-asset-tag-menu__check">{isAssigned && <Check />}</span>
              <span className="atlas-asset-tag-menu__name">{tag.name}</span>
            </div>
          );
        })}
        {canCreate && (
          <div
            id={optionId(options.length)}
            role="option"
            aria-selected={false}
            aria-disabled={isCreating}
            data-active={activeIndex === options.length || undefined}
            className="atlas-ctx-item atlas-asset-tag-menu__option atlas-asset-tag-menu__option--create"
            onMouseMove={() => setActive(options.length)}
            onClick={() => { void create(); }}
          >
            <span className="atlas-asset-tag-menu__check"><Plus /></span>
            <span className="atlas-asset-tag-menu__name">{isCreating ? t('am.create.creating') : t('am.tagPicker.create', { name })}</span>
          </div>
        )}
        {rowCount === 0 && <div className="atlas-asset-tag-menu__empty">{t('am.tagPicker.empty')}</div>}
      </div>
    </>
  );
}
