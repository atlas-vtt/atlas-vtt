import React, { useId, useRef } from 'react';
import { ChevronRight, Folder } from 'lucide-react';
import type { Tab, Folder as FolderType } from '../types';
import { getTabDisplayName } from '../types';
import { LabelTooltip } from '../../primitives/tooltip';
import { t } from '../../../../i18n';

export interface BreadcrumbProps {
  activeTab: Tab;
  /** Folders from the tab root down to the open folder; empty at the root. */
  path: FolderType[];
  onNavigateToFolder: (folderId: string | null) => void;
}

/**
 * Path from the tab root to the open folder. The last segment is the current location. The names take the row's
 * width; where it runs out the folders between the tab and the current one give way first. At the root
 * it shows nothing but keeps its room: the section header below names the tab, and one heading per
 * pane is enough.
 */
interface SegmentProps {
  label: string;
  folderId: string | null;
  isCurrent: boolean;
  onNavigate: (folderId: string | null) => void;
}

/** One place of the path. Its name shows whole while the row has room; cut, it shows whole in a tooltip. */
function BreadcrumbSegment({ label, folderId, isCurrent, onNavigate }: SegmentProps): React.JSX.Element {
  const nameRef = useRef<HTMLSpanElement>(null);
  const isCut = (): boolean => { const el = nameRef.current; return el !== null && el.scrollWidth > el.clientWidth; };
  return (
    <LabelTooltip label={label} describe opensWhen={isCut}>
      <button
        type="button"
        className={`atlas-breadcrumb-btn ${isCurrent ? 'atlas-current' : ''}`}
        onClick={isCurrent ? undefined : () => onNavigate(folderId)}
        aria-current={isCurrent ? 'location' : undefined}
      >
        {folderId && <Folder />}
        <span ref={nameRef}>{label}</span>
      </button>
    </LabelTooltip>
  );
}

export function Breadcrumb({ activeTab, path, onNavigateToFolder }: BreadcrumbProps): React.JSX.Element {
  const labelId = useId();
  if (path.length === 0) return <div className="atlas-asset-manager-breadcrumb" />;


  return (
    <nav className="atlas-asset-manager-breadcrumb" aria-labelledby={labelId}>
      <span id={labelId} hidden>{t('am.breadcrumb')}</span>
      <BreadcrumbSegment label={getTabDisplayName(activeTab)} folderId={null} isCurrent={false} onNavigate={onNavigateToFolder} />
      {path.map((folder, index) => (
        <React.Fragment key={folder.id}>
          <ChevronRight className="atlas-breadcrumb-separator" />
          <BreadcrumbSegment label={folder.name} folderId={folder.id} isCurrent={index === path.length - 1} onNavigate={onNavigateToFolder} />
        </React.Fragment>
      ))}
    </nav>
  );
}
