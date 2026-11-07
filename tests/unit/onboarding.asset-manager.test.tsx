// @vitest-environment jsdom
import React, { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { Tutorial } from '../../src/app/onboarding/Tutorial';
import { useAssetManagerEffects } from '../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects';
import InputModal from '../../src/app/packages/components/primitives/InputModal';

afterEach(cleanup);
it('keeps the asset manager open through tutorial clicks and hands off to collection creation', () => {
  const settings = new SettingsService({ vault: { adapter: { exists: async () => true, write: async () => {} } } } as any);
  const onClose = vi.fn();
  const onConfirm = vi.fn();
  function Harness() {
    const modalRef = useRef<HTMLDivElement>(null), containerRef = useRef<HTMLDivElement>(null);
    const [inputOpen, setInputOpen] = useState(false);
    useAssetManagerEffects({
      isOpen: true, onClose, initialTab: undefined, modalRef, containerRef,
      setSearch: vi.fn(), setActiveTab: vi.fn(), setIsSidebarCollapsed: vi.fn(), setSelectedCollection: vi.fn(),
      data: {}, sel: { selectedAssetIds: [], setSelectedAssetIds: vi.fn(), setSelectedFolderIds: vi.fn(), setSelectedFolderId: vi.fn(), setSelectedTagIds: vi.fn(), setSpawnCounts: vi.fn(), navigationHistory: {clear:vi.fn(),push:vi.fn()} },
      crud: { inputModalState: {isOpen:inputOpen}, settingsModalCollectionId: null }, tags: {}, statblock: { linkingStatblockAsset:null },
    } as any);
    return <div className="workspace-leaf mod-active"><div ref={modalRef} tabIndex={-1}><div ref={containerRef}>Assets</div></div>
      <Tutorial settings={settings} id="assets" steps={[{title:'Your library',body:'Browse assets.'},{title:'Start with a collection',body:'Keep your campaign together.'}]} action={{label:'Create collection',onClick:()=>setInputOpen(true)}}/>
      <InputModal isOpen={inputOpen} title="Create New Collection" placeholder="Collection name" onClose={()=>setInputOpen(false)} onConfirm={onConfirm}/>
    </div>;
  }
  render(<Harness/>);
  const click = (name: string) => { const button=screen.getByRole('button',{name}); fireEvent.mouseDown(button); fireEvent.click(button); };
  click('Next');
  expect(onClose).not.toHaveBeenCalled();
  click('Create collection');
  expect(screen.getByPlaceholderText('Collection name')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
  expect(settings.shouldShowTutorial('assets')).toBe(false);
});
