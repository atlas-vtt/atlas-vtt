import React, { useEffect, useId, useRef, useState } from 'react';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { MAX_CAMPAIGN_DESCRIPTION } from '../../../campaigns/campaignValidation';
import { t } from '../../../i18n';

interface FieldProps {
  campaign: Campaign;
  service: CampaignService;
  disabled: boolean;
}

/**
 * A field's text while the GM edits it, and the stored value otherwise, so a change from another
 * device shows at once without overwriting what is being typed.
 */
function useDraft(stored: string): [string, (next: string) => void, (focused: boolean) => void] {
  const [draft, setDraft] = useState(stored);
  const [isFocused, setFocused] = useState(false);
  useEffect(() => {
    if (!isFocused) setDraft(stored);
  }, [stored, isFocused]);
  return [draft, setDraft, setFocused];
}

/** The campaign's name as the page's heading, renamed in place: Enter or leaving the field saves, Escape reverts. */
export function CampaignNameField({ campaign, service, disabled }: FieldProps): React.JSX.Element {
  const [draft, setDraft, setFocused] = useDraft(campaign.name);
  const labelId = useId();
  const errorId = useId();
  const changed = draft.trim() !== campaign.name;
  const error = changed ? service.nameError(draft, campaign.id) : null;

  // Escape leaves the field without saving what was typed.
  const reverting = useRef(false);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (error === null) event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      reverting.current = true;
      event.currentTarget.blur();
    }
  };

  const onBlur = (): void => {
    if (changed && error === null && !reverting.current) service.rename(campaign.id, draft);
    else setDraft(campaign.name);
    reverting.current = false;
    setFocused(false);
  };

  return (
    <div className="campaign-name">
      <span id={labelId} hidden>{t('campaign.nameLabel')}</span>
      <input
        className="campaign-name__input"
        type="text"
        value={draft}
        aria-labelledby={labelId}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
      {error && <div id={errorId} className="campaign-field-error" role="alert">{error}</div>}
    </div>
  );
}

/** The campaign's description, saved when the GM leaves the field; the field grows with its text. */
export function CampaignDescriptionField({ campaign, service, disabled }: FieldProps): React.JSX.Element {
  const [draft, setDraft, setFocused] = useDraft(campaign.description ?? '');
  const labelId = useId();

  const save = (): void => {
    setFocused(false);
    if (draft.trim() === (campaign.description ?? '').trim()) return;
    service.update(campaign.id, { description: draft.trim() === '' ? '' : draft });
  };

  return (
    <div className="campaign-description">
      <span id={labelId} className="panel-heading">{t('campaign.description')}</span>
      <div className={disabled ? 'campaign-description__field is-disabled' : 'campaign-description__field'}>
        <textarea
          className="campaign-description__input"
          value={draft}
          aria-labelledby={labelId}
          placeholder={t('campaign.descriptionPlaceholder')}
          maxLength={MAX_CAMPAIGN_DESCRIPTION}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
        />
      </div>
    </div>
  );
}
