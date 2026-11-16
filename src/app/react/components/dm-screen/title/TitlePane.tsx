import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Grid2X2, Grid3X3, List, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import type { App } from 'obsidian';
import { t } from '../../../../i18n';
import { SettingsService } from '../../../../services/SettingsService';
import { readTitleCardLayout, readTitleCards, type TitleCard, type TitleCardLayout } from '../../../../titleCards/titleCardTypes';

interface TitlePaneProps {
  app: App;
}

interface TitleCardDraft {
  title: string;
  subtitle: string;
  description: string;
}

const EMPTY_DRAFT: TitleCardDraft = { title: '', subtitle: '', description: '' };

const makeId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export function TitlePane({ app }: TitlePaneProps): React.JSX.Element {
  const settings = SettingsService.forApp(app);
  const [cards, setCards] = useState<TitleCard[]>(() => readTitleCards(settings?.getSetting('titleCards')));
  const [layout, setLayout] = useState<TitleCardLayout>(() => readTitleCardLayout(settings?.getSetting('titleCardLayout')));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<TitleCardDraft>(EMPTY_DRAFT);

  useEffect(() => {
    if (!settings) return undefined;
    return settings.onChange((next) => {
      setCards(readTitleCards(next.titleCards));
      setLayout(readTitleCardLayout(next.titleCardLayout));
    });
  }, [settings]);

  const saveCards = useCallback((next: TitleCard[]): void => {
    setCards(next);
    settings?.setSetting('titleCards', next);
  }, [settings]);

  const beginCreate = (): void => {
    setDraft(EMPTY_DRAFT);
    setEditingId('new');
  };

  const beginEdit = (card: TitleCard): void => {
    setDraft({ title: card.title, subtitle: card.subtitle, description: card.description });
    setEditingId(card.id);
  };

  const saveDraft = (): void => {
    const title = draft.title.trim();
    if (!title) return;

    const now = Date.now();
    const content = { ...draft, title };
    if (editingId === 'new') {
      saveCards([...cards, { id: makeId(), ...content, createdAt: now, updatedAt: now }]);
    } else {
      saveCards(cards.map((card) => card.id === editingId ? { ...card, ...content, updatedAt: now } : card));
    }
    setEditingId(null);
  };

  const filteredCards = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return cards;
    return cards.filter((card) => `${card.title} ${card.subtitle} ${card.description}`.toLocaleLowerCase().includes(term));
  }, [cards, query]);

  const changeLayout = (next: TitleCardLayout): void => {
    setLayout(next);
    settings?.setSetting('titleCardLayout', next);
  };

  const duplicate = (card: TitleCard): void => {
    const now = Date.now();
    saveCards([...cards, {
      ...card,
      id: makeId(),
      title: t('titleCards.duplicateTitle', { title: card.title }),
      createdAt: now,
      updatedAt: now,
    }]);
  };

  const remove = (card: TitleCard): void => {
    if (!window.confirm(t('titleCards.confirmDelete', { title: card.title }))) return;
    saveCards(cards.filter((item) => item.id !== card.id));
  };

  return (
    <section className="atlas-title-pane">
      <header className="atlas-title-header">
        <div>
          <h1>{t('titleCards.heading')}</h1>
          <p>{t('titleCards.description')}</p>
        </div>
        <button className="atlas-title-primary" onClick={beginCreate} type="button">
          <Plus size={16} />
          {t('titleCards.newCard')}
        </button>
      </header>

      <div className="atlas-title-toolbar">
        <label className="atlas-title-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={t('titleCards.search')} />
        </label>
        <div className="atlas-title-layout" role="group" aria-label={t('titleCards.layout')}>
          <button type="button" aria-label={t('titleCards.list')} aria-pressed={layout === 'list'} onClick={() => changeLayout('list')}>
            <List size={17} />
          </button>
          <button type="button" aria-label={t('titleCards.twoColumns')} aria-pressed={layout === 'two'} onClick={() => changeLayout('two')}>
            <Grid2X2 size={17} />
          </button>
          <button type="button" aria-label={t('titleCards.threeColumns')} aria-pressed={layout === 'three'} onClick={() => changeLayout('three')}>
            <Grid3X3 size={17} />
          </button>
        </div>
      </div>

      {editingId !== null && (
        <form className="atlas-title-editor" onSubmit={(event) => { event.preventDefault(); saveDraft(); }}>
          <div className="atlas-title-editor-heading">
            <h2>{editingId === 'new' ? t('titleCards.createHeading') : t('titleCards.editHeading')}</h2>
            <button type="button" className="atlas-title-icon-button" aria-label={t('titleCards.closeEditor')} onClick={() => setEditingId(null)}>
              <X size={17} />
            </button>
          </div>
          <label>
            {t('titleCards.title')}
            <input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })} placeholder={t('titleCards.titlePlaceholder')} maxLength={100} />
          </label>
          <label>
            {t('titleCards.subtitle')}
            <input value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.currentTarget.value })} placeholder={t('titleCards.subtitlePlaceholder')} maxLength={160} />
          </label>
          <label>
            {t('titleCards.notes')}
            <textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.currentTarget.value })} placeholder={t('titleCards.notesPlaceholder')} rows={3} maxLength={1000} />
          </label>
          <div className="atlas-title-editor-actions">
            <button type="button" onClick={() => setEditingId(null)}>{t('titleCards.cancel')}</button>
            <button type="submit" className="atlas-title-primary" disabled={!draft.title.trim()}>{t('titleCards.save')}</button>
          </div>
        </form>
      )}

      {filteredCards.length === 0 ? (
        <div className="atlas-title-empty">
          <h2>{query ? t('titleCards.noResults') : t('titleCards.emptyHeading')}</h2>
          <p>{query ? t('titleCards.noResultsHint') : t('titleCards.emptyHint')}</p>
          {!query && (
            <button type="button" onClick={beginCreate}>
              <Plus size={16} />
              {t('titleCards.createFirst')}
            </button>
          )}
        </div>
      ) : (
        <div className={`atlas-title-cards atlas-title-cards--${layout}`}>
          {filteredCards.map((card) => (
            <article className="atlas-title-card" key={card.id}>
              <div className="atlas-title-card-preview">
                <span>{t('titleCards.previewLabel')}</span>
                <div>
                  <h2>{card.title}</h2>
                  {card.subtitle && <p>{card.subtitle}</p>}
                </div>
              </div>
              <div className="atlas-title-card-content">
                <div className="atlas-title-card-copy">
                  <h3>{card.title}</h3>
                  {card.subtitle && <p className="atlas-title-card-subtitle">{card.subtitle}</p>}
                  <p className="atlas-title-card-description">{card.description || t('titleCards.noNotes')}</p>
                </div>
                <div className="atlas-title-card-meta">
                  <span>{t('titleCards.manualDisplay')}</span>
                  <span>{new Date(card.updatedAt).toLocaleDateString()}</span>
                </div>
                <div className="atlas-title-card-actions">
                  <button type="button" onClick={() => beginEdit(card)}>
                    <Pencil size={15} />
                    {t('titleCards.edit')}
                  </button>
                  <button type="button" aria-label={t('titleCards.duplicate')} onClick={() => duplicate(card)}>
                    <Copy size={15} />
                  </button>
                  <button type="button" aria-label={t('titleCards.delete')} onClick={() => remove(card)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
