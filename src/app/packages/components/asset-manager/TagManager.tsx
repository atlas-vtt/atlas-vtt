import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Plus } from 'lucide-react';
import { openContextMenuGlobal, type ContextMenuEntry } from '../../../react/root/ContextMenuContext';
import type { TagGroup } from '../../../services/tagGroups';
import { confirmAction } from '../../../ui/confirmDialog';
import { isShortcutScopeActive } from '../../../utils/activeLeafGuard';
import { CloseButton } from '../primitives/CloseButton';
import { Button } from '../primitives/button';
import { dialogOverlayMotion, useDialogWindowVariants } from '../primitives/dialogMotion';
import { ManagedItemRow, type ManagedItem } from './components/ManagedItemRow';
import { TagManagerTabs, type TagManagerTab } from './components/TagManagerTabs';
import { useItemSelection } from './hooks/useItemSelection';
import { t } from '../../../i18n';

interface TagManagerProps {
  isOpen: boolean;
  onClose: () => void;
  tags: Readonly<Record<TagGroup, readonly ManagedItem[]>>;
  /** The tab shown whenever the manager opens: the tag group of the asset tab in view. */
  initialTab: TagGroup;
  collections: readonly ManagedItem[];
  onCreateTag: (group: TagGroup, name: string) => void;
  onCreateCollection: (name: string) => void;
  onUpdateTag: (group: TagGroup, tagId: string, name: string) => void | Promise<void>;
  onUpdateCollection: (collectionId: string, name: string) => void | Promise<void>;
  onDeleteTag: (group: TagGroup, tagId: string) => Promise<void>;
  onDeleteCollection: (collectionId: string) => Promise<void>;
}

const TagManager: React.FC<TagManagerProps> = ({
  isOpen,
  onClose,
  tags,
  initialTab,
  collections,
  onCreateTag,
  onCreateCollection,
  onUpdateTag,
  onUpdateCollection,
  onDeleteTag,
  onDeleteCollection,
}) => {
  const [activeTab, setActiveTab] = useState<TagManagerTab>(initialTab);
  const [wasOpen, setWasOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [error, setError] = useState('');

  const modalRef = useRef<HTMLDivElement>(null);
  const windowVariants = useDialogWindowVariants();

  const tagGroup = activeTab === 'collections' ? null : activeTab;
  const items = tagGroup ? tags[tagGroup] : collections;
  const createItem = (name: string): void => tagGroup ? onCreateTag(tagGroup, name) : onCreateCollection(name);
  const updateItem = (id: string, name: string): void | Promise<void> =>
    tagGroup ? onUpdateTag(tagGroup, id, name) : onUpdateCollection(id, name);
  const deleteItem = (id: string): Promise<void> => tagGroup ? onDeleteTag(tagGroup, id) : onDeleteCollection(id);
  const existsMessage = tagGroup ? t('am.manage.tagExists') : t('am.manage.collectionExists');

  const filteredItems = items.filter((item) => item.name.toLowerCase().includes(searchValue.toLowerCase()));
  const selection = useItemSelection(filteredItems.map((item) => item.id));
  const { selectedIds } = selection;

  const nameTaken = (name: string, exceptId?: string): boolean =>
    items.some((item) => item.id !== exceptId && item.name.toLowerCase() === name.toLowerCase());
  const showCreateOption = searchValue && !nameTaken(searchValue);

  // Selection and editing belong to one tab: ids of tags and collections must never mix.
  const switchTab = (tab: TagManagerTab): void => {
    setActiveTab(tab);
    selection.clear();
    setEditingId(null);
    setError('');
  };

  // Each opening starts on the tags of the asset tab in view, with a fresh search.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      switchTab(initialTab);
      setSearchValue('');
    }
  }

  useEffect(() => {
    if (isOpen && !editingId) {
      modalRef.current?.focus();
    }
  }, [isOpen, editingId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!isOpen || !isShortcutScopeActive(modalRef.current)) return;
      if (e.key === 'Escape' && !editingId) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editingId, onClose]);

  const handleCreate = (): void => {
    if (!searchValue.trim()) return;
    if (nameTaken(searchValue.trim())) {
      setError(existsMessage);
      return;
    }
    createItem(searchValue.trim());
    setSearchValue('');
    setError('');
  };

  const handleEdit = (item: ManagedItem): void => {
    setEditingId(item.id);
    setEditValue(item.name);
  };

  const handleCancelEdit = (): void => {
    setEditingId(null);
    setEditValue('');
    setError('');
  };

  const handleSaveEdit = (): void => {
    const name = editValue.trim();
    if (!name) {
      setError('Name cannot be empty');
      return;
    }
    if (editingId && nameTaken(name, editingId)) {
      setError(existsMessage);
      return;
    }
    if (editingId) void updateItem(editingId, name);
    handleCancelEdit();
  };

  const confirmDelete = async (targets: readonly ManagedItem[]): Promise<boolean> => {
    if (tagGroup) return true;
    return confirmAction({
      title: targets.length === 1 ? t('am.manage.deleteCollection', { name: targets[0]!.name }) : t('am.manage.deleteCollections', { count: targets.length }),
      message: [t('am.manage.toTrash')],
      confirmLabel: t('common.delete'),
      destructive: true,
    });
  };

  const deleteItems = async (targets: readonly ManagedItem[]): Promise<void> => {
    if (targets.length === 0 || !(await confirmDelete(targets))) return;
    for (const target of targets) await deleteItem(target.id);
    selection.clear();
  };

  const selectedItems = (): ManagedItem[] => items.filter((item) => selectedIds.has(item.id));

  const handleItemContextMenu = (item: ManagedItem, event: React.MouseEvent): void => {
    // A row outside the selection acts on its own; the menu must not target the old selection.
    const targets = selectedIds.has(item.id) ? selectedItems() : [item];
    if (!selectedIds.has(item.id)) selection.replace([item.id]);

    const entries: ContextMenuEntry[] = [
      { type: 'item', label: t('common.edit'), icon: 'edit', onClick: () => handleEdit(item) },
      {
        type: 'item',
        label: targets.length > 1 ? t('am.manage.deleteItems', { count: targets.length }) : t('common.delete'),
        icon: 'trash',
        destructive: true,
        onClick: () => { void deleteItems(targets); },
      },
    ];

    openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          {...dialogOverlayMotion}
          className="atlas-vtt-plugin atlas-vtt-root atlas-tag-manager-modal"
          onClick={(e) => {
            e.stopPropagation();
            // Only close if clicking the backdrop itself
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
        >
          <motion.div
            ref={modalRef}
            className="atlas-tag-manager-content"
            variants={windowVariants}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="atlas-tag-manager-header">
              <h2>{t('am.manage.title')}</h2>
              <CloseButton onClick={onClose} />
            </div>

            <TagManagerTabs activeTab={activeTab} onSelect={switchTab} />

            <div className="atlas-tag-manager-body">
              <div className="atlas-search-section">
                <div className="atlas-search-input-wrapper">
                  <Search size={16} className="atlas-search-icon" />
                  <input
                    type="text"
                    placeholder={tagGroup ? t('am.manage.searchTags') : t('am.manage.searchCollections')}
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && showCreateOption) {
                        handleCreate();
                      }
                    }}
                    className="atlas-search-input"
                  />
                </div>
              </div>

              {error && (
                <div className="atlas-error-message">
                  {error}
                </div>
              )}

              <div className="atlas-items-list">
                {showCreateOption && (
                  <div className="atlas-create-item" onClick={handleCreate}>
                    <Plus size={16} />
                    {t('am.manage.create', { name: searchValue })}
                  </div>
                )}

                {filteredItems.map((item) => (
                  <ManagedItemRow
                    key={item.id}
                    item={item}
                    kind={tagGroup ? 'tag' : 'collection'}
                    isSelected={selectedIds.has(item.id)}
                    editValue={editingId === item.id ? editValue : null}
                    onEditValueChange={setEditValue}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={handleCancelEdit}
                    onSelect={(range) => selection.select(item.id, range)}
                    onOpenMenu={(e) => handleItemContextMenu(item, e)}
                  />
                ))}

                {filteredItems.length === 0 && !showCreateOption && (
                  <div className="atlas-empty-state">
                    {tagGroup ? t('am.manage.noTags') : t('am.manage.noCollections')}
                  </div>
                )}
              </div>
            </div>

            <div className="atlas-tag-manager-footer">
              {selectedIds.size > 0 && (
                <>
                  <span className="atlas-selected-count">{selectedIds.size} selected</span>
                  <Button variant="destructive" size="sm" onClick={() => { void deleteItems(selectedItems()); }}>
                    {t('am.manage.deleteSelected')}
                  </Button>
                </>
              )}
              <Button variant="default" size="sm" onClick={onClose}>{t('common.done')}</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default TagManager;
