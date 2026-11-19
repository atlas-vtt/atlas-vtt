import React from 'react';

/**
 * A total in the dice face, each digit in a box of one width: the face has no tabular figures,
 * and a total that counts up must not change width under the eye. The number is in the text once
 * (for screen readers and whoever reads it); the boxes draw their digit as generated content.
 */
export function RollDigits({ value }: { value: number }): React.ReactElement {
  const text = value < 0 ? `−${-value}` : String(value);
  return (
    <>
      <span className="atlas-roll-digits__text">{text}</span>
      <span aria-hidden="true">
        {[...text].map((char, i) => <span key={i} className="atlas-roll-digits__digit" data-digit={char} />)}
      </span>
    </>
  );
}
