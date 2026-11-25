import React from 'react';
import { titleParts } from './welcomeIntro';

/**
 * A heading drawn letter by letter, each letter numbered for its place in the opening's stagger. A word stays one
 * piece, so a line only breaks between words; assistive technology reads the text whole.
 */
export function LetterTitle({ text }: { text: string }): React.JSX.Element {
  return (
    <>
      <span className="atlas-welcome-letters__text">{text}</span>
      <span className="atlas-welcome-letters" aria-hidden="true">
        {titleParts(text).map((part, at) => ('space' in part
          ? part.space
          : (
            <span key={at} className="atlas-welcome-letters__word">
              {part.word.map((letter, offset) => (
                <span key={offset} className="atlas-welcome-letters__letter" style={{ '--atlas-letter': part.first + offset } as React.CSSProperties}>
                  {letter}
                </span>
              ))}
            </span>
          )))}
      </span>
    </>
  );
}
