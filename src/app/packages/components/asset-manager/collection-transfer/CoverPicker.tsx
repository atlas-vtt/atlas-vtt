import React, { useId, useRef, useState } from 'react';
import { ImageOff, ImagePlus } from 'lucide-react';
import type { CoverCandidate, CoverChoice, CurrentCover } from '../../../../services/collectionBundle/collectionCover';
import { RevealImage } from '../../primitives/RevealImage';
import { useScrollActivity } from '../../primitives/useScrollActivity';
import { CoverCard } from './CoverCard';
import { t } from '../../../../i18n';

interface CoverPickerProps {
  value: CoverChoice;
  current?: CurrentCover | undefined;
  candidates: readonly CoverCandidate[];
  /** The image the user uploaded in this dialog, and its URL. */
  upload?: { image: Blob; url: string } | undefined;
  onUpload: (image: File) => void;
  onChange: (choice: CoverChoice) => void;
}

/** Side rail of large cover cards: upload an image, keep the current cover, use a map's or scene's artwork, or none. */
export function CoverPicker({ value, current, candidates, upload, onUpload, onChange }: CoverPickerProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [list, setList] = useState<HTMLDivElement | null>(null);
  useScrollActivity(list);
  const isArtwork = (path: string): boolean => value.kind === 'artwork' && value.path === path;
  return (
    <section className="atlas-transfer-covers" aria-labelledby={titleId}>
      <div className="atlas-transfer-covers__header">
        <span id={titleId} className="atlas-transfer-eyebrow">{t('cover.title')}</span>
        <span className="atlas-transfer-covers__hint">{t('cover.hint')}</span>
      </div>
      <div ref={setList} className="atlas-transfer-covers__list" role="radiogroup" aria-labelledby={titleId}>
        <CoverCard label={t('cover.upload')} hint={t('cover.uploadHint')} variant="action" isOption={false} onSelect={() => inputRef.current?.click()}>
          <ImagePlus aria-hidden="true" />
        </CoverCard>
        {upload && (
          <CoverCard label={t('cover.uploaded')} selected={value.kind === 'upload'} onSelect={() => onChange({ kind: 'upload', image: upload.image })}>
            <img src={upload.url} alt="" draggable={false} />
          </CoverCard>
        )}
        {current && (
          <CoverCard label={t('cover.current')} selected={value.kind === 'current'} onSelect={() => onChange({ kind: 'current' })}>
            <RevealImage src={current.url} alt="" />
          </CoverCard>
        )}
        {candidates.map((candidate) => (
          <CoverCard key={candidate.sourcePath} label={candidate.name} selected={isArtwork(candidate.sourcePath)} onSelect={() => onChange({ kind: 'artwork', path: candidate.sourcePath })}>
            <RevealImage src={candidate.previewUrl} alt="" lazy />
          </CoverCard>
        ))}
        <CoverCard label={t('cover.none')} hint={t('cover.noneHint')} variant="action" selected={value.kind === 'none'} onSelect={() => onChange({ kind: 'none' })}>
          <ImageOff aria-hidden="true" />
        </CoverCard>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="atlas-hidden-file-input"
        tabIndex={-1}
        onChange={(event) => {
          const image = event.target.files?.[0];
          event.target.value = '';
          if (image) onUpload(image);
        }}
      />
    </section>
  );
}
