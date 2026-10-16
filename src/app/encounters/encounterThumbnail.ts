import { App as ObsidianApp } from 'obsidian';
import { imageSrc } from '../utils/imageSource';

interface ThumbnailToken {
  imagePath?: string;
}

/**
 * Generates a composite circular-portrait thumbnail from up to 3 token images.
 * Returns a data-URL string, or '' on failure.
 */
export async function generateEncounterThumbnail(
  app: ObsidianApp,
  tokenAssets: ThumbnailToken[]
): Promise<string> {
  return new Promise((resolve) => {
    const canvas = createEl('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve('');
      return;
    }

    const SIZE = 200;
    canvas.width = SIZE;
    canvas.height = SIZE;
    ctx.clearRect(0, 0, SIZE, SIZE);

    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const tokensToShow = tokenAssets.slice(0, 3);

    if (tokensToShow.length === 0) {
      resolve('');
      return;
    }

    const getUrl = (token: ThumbnailToken): string => imageSrc(app, token.imagePath) || (token.imagePath ?? '');

    const drawCircle = (
      img: HTMLImageElement,
      x: number,
      y: number,
      r: number
    ): void => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, 2 * Math.PI);
      ctx.clip();
      ctx.drawImage(img, x, y, r * 2, r * 2);
      ctx.restore();
    };

    const addOverflowBadge = (): void => {
      if (tokenAssets.length <= 3) return;
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.beginPath();
      ctx.arc(SIZE - 25, SIZE - 25, 20, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`+${tokenAssets.length - 3}`, SIZE - 25, SIZE - 25);
      ctx.restore();
    };

    // ── 1 token ──────────────────────────────────────────────────
    if (tokensToShow.length === 1) {
      const r = SIZE * 0.4;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        drawCircle(img, cx - r, cy - r, r);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = getUrl(tokensToShow[0]!);
      return;
    }

    // ── 2 tokens ─────────────────────────────────────────────────
    if (tokensToShow.length === 2) {
      const r = SIZE * 0.2;
      const spacing = SIZE * 0.25;
      let loaded = 0;
      tokensToShow.forEach((token, i) => {
        const x = cx + (i === 0 ? -spacing : spacing) - r;
        const y = cy - r;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          drawCircle(img, x, y, r);
          if (++loaded === 2) resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => {
          if (++loaded === 2) resolve(canvas.toDataURL('image/png'));
        };
        img.src = getUrl(token);
      });
      return;
    }

    // ── 3 tokens ─────────────────────────────────────────────────
    const r = SIZE * 0.175;
    const positions = [
      { x: cx - r, y: cy - SIZE * 0.15 - r },
      { x: cx - SIZE * 0.2 - r, y: cy + SIZE * 0.1 - r },
      { x: cx + SIZE * 0.2 - r, y: cy + SIZE * 0.1 - r },
    ];
    let loaded = 0;
    tokensToShow.forEach((token, i) => {
      const pos = positions[i]!;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        drawCircle(img, pos.x, pos.y, r);
        if (++loaded === 3) {
          addOverflowBadge();
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.onerror = () => {
        if (++loaded === 3) {
          addOverflowBadge();
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.src = getUrl(token);
    });

    // Fallback timeout
    window.setTimeout(() => resolve(''), 3000);
  });
}
