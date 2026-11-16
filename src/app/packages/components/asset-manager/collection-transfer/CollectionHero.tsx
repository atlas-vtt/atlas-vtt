import React from 'react';

interface CollectionHeroProps {
  /** What is happening to the collection, e.g. "Export collection" or "Update". */
  eyebrow: string;
  imageUrl?: string | undefined;
  /** The collection's name, or a field to edit it. */
  name: React.ReactNode;
  /** e.g. `v3`, or `v2 → v3` for an update. */
  version: string;
  /** Further facts after the version: author, export date, … */
  details: readonly string[];
  description?: string | undefined;
}

/** Key-art banner: the collection as people who install it see it, its name over its cover; just the name without one. */
export function CollectionHero({ eyebrow, imageUrl, name, version, details, description }: CollectionHeroProps): React.JSX.Element {
  return (
    // Not a <header>: inside the dialog it would be a second banner beside the asset manager's.
    <div className="atlas-transfer-hero" data-empty={!imageUrl || undefined}>
      {imageUrl && (
        <div className="atlas-transfer-hero__art">
          <img key={imageUrl} src={imageUrl} alt="" draggable={false} decoding="async" />
        </div>
      )}
      <div className="atlas-transfer-hero__identity">
        <span className="atlas-transfer-eyebrow">{eyebrow}</span>
        <h2 className="atlas-transfer-hero__name">{name}</h2>
        <div className="atlas-transfer-hero__meta">
          <span className="atlas-transfer-chip">{version}</span>
          {details.filter(Boolean).map((detail) => <span key={detail} className="atlas-transfer-hero__detail">{detail}</span>)}
        </div>
        {description && <p className="atlas-transfer-hero__description">{description}</p>}
      </div>
    </div>
  );
}
