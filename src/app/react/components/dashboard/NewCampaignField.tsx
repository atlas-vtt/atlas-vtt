import React, { useId, useState } from 'react';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { t } from '../../../i18n';

interface NewCampaignFieldProps {
  service: CampaignService;
  onCreated: (id: string) => void;
  onCancel: () => void;
}

/** Names a new campaign in place: Enter creates it, Escape or leaving the field empty cancels. */
export function NewCampaignField({ service, onCreated, onCancel }: NewCampaignFieldProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const labelId = useId();
  const errorId = useId();
  // An empty field is only an error once the GM tried to create it.
  const error = name.trim() !== '' || submitted ? service.nameError(name) : null;

  const create = (): void => {
    setSubmitted(true);
    if (service.nameError(name) !== null) return;
    onCreated(service.create(name).id);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      create();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="campaign-new">
      <span id={labelId} hidden>{t('campaign.nameLabel')}</span>
      <input
        className="campaign-new__input"
        type="text"
        value={name}
        placeholder={t('campaign.nameLabel')}
        aria-labelledby={labelId}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => { if (name.trim() === '') onCancel(); }}
      />
      {error && <div id={errorId} className="campaign-field-error" role="alert">{error}</div>}
    </div>
  );
}
