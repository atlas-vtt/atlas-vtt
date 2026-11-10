import React, { forwardRef } from 'react';
import { Link2, Plus } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import type { ImageBlock } from '../../model/templateTypes';

export interface TokenSocketFaceProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  shape: ImageBlock['shape'];
  /** The art the socket holds; null for an empty socket. */
  art: React.ReactNode | null;
  /** What an empty socket says under its ring. */
  prompt: string;
}

/**
 * What the Image block looks like beside a note (§2.1): the art in its frame
 * with a link badge, or an empty disc with a plus and a prompt. The
 * note view's `TokenSocket` and the template editor draw this one face, so
 * the block has the same box in both.
 */
export const TokenSocketFace = forwardRef<HTMLButtonElement, TokenSocketFaceProps>(({ shape, art, prompt, className, ...button }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn('atlas-sb-token-socket', art === null && 'atlas-sb-token-socket--empty', className)}
    data-shape={shape}
    {...button}
  >
    <span className="atlas-sb-token-socket__frame">
      {art ?? <Plus className="atlas-sb-token-socket__plus" aria-hidden="true" />}
      {art !== null && (
        <span className="atlas-sb-token-socket__badge" aria-hidden="true">
          <Link2 />
        </span>
      )}
    </span>
    {art === null && <span className="atlas-sb-token-socket__prompt">{prompt}</span>}
  </button>
));

TokenSocketFace.displayName = 'TokenSocketFace';
