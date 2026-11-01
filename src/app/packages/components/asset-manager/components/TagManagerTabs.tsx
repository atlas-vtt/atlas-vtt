import React from 'react';
import { FolderOpen, Map as MapIcon, Music } from 'lucide-react';
import { TokenIcon } from '../../../../react/components/TokenIcon';
import type { TagGroup } from '../../../../services/tagGroups';
import { t } from '../../../../i18n';
import { useExperimentalFeature } from '../../../../react/hooks/useExperimentalFeature';

export type TagManagerTab = TagGroup | 'collections';

const TABS: readonly { id: TagManagerTab; label: string; icon: React.ReactElement }[] = [
  { id: 'maps', label: t('am.manage.mapTags'), icon: <MapIcon /> },
  { id: 'tokens', label: t('am.manage.characterTags'), icon: <TokenIcon /> },
  { id: 'sounds', label: t('audio.tags'), icon: <Music /> },
  { id: 'collections', label: t('am.manage.collections'), icon: <FolderOpen /> },
];

interface TagManagerTabsProps {
  activeTab: TagManagerTab;
  onSelect: (tab: TagManagerTab) => void;
}

/** Map tags, character tags, sound tags and collections: the lists Manage Tags & Collections edits. */
export function TagManagerTabs({ activeTab, onSelect }: TagManagerTabsProps): React.JSX.Element {
  const soundOn = useExperimentalFeature('sound');
  return (
    <div className="atlas-tag-manager-tabs">
      <div className="atlas-tab-switcher" role="tablist">
        {TABS.filter((tab) => soundOn || tab.id !== 'sounds').map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`atlas-tab-button ${activeTab === tab.id ? 'atlas-active' : ''}`}
            onClick={() => onSelect(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
