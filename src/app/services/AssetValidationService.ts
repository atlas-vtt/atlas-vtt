import { App, Notice, TFile, normalizePath } from 'obsidian';
import type { MapFile } from './MapPersistence';
import { t } from '../i18n';

/** The parts of a map that reference vault images; satisfied by a MapFile and by the live store state. */
export interface MapAssetReferences {
    background: MapFile['background'];
    objects: Pick<MapFile['objects'], 'tokens'>;
}

export interface MissingAsset {
    id: string;
    type: 'token' | 'map';
    path: string;
    objectId: string;
    objectName?: string;
}

export interface AssetValidationResult {
    valid: boolean;
    missingAssets: MissingAsset[];
}

/** Side of the image that stands in for a missing asset, in pixels. */
export const MISSING_ASSET_SIZE = 128;

/** The grey question mark that stands in for a missing asset, or null where no canvas can be drawn. */
export function drawMissingAssetImage(): HTMLCanvasElement | null {
    const canvas = createEl('canvas');
    canvas.width = MISSING_ASSET_SIZE;
    canvas.height = MISSING_ASSET_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#404040';
    ctx.fillRect(0, 0, MISSING_ASSET_SIZE, MISSING_ASSET_SIZE);
    ctx.fillStyle = '#808080';
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 64, 64);
    ctx.strokeStyle = '#606060';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 124, 124);
    return canvas;
}

export class AssetValidationService {
    private validationCache = new Map<string, boolean>();
    
    constructor(private plugin: { app: App }) {}

    async validateAsset(path: string): Promise<boolean> {
        // Check cache first
        if (this.validationCache.has(path)) {
            return this.validationCache.get(path)!;
        }

        try {
            const file = this.plugin.app.vault.getAbstractFileByPath(normalizePath(path));
            const exists = file instanceof TFile;
            this.validationCache.set(path, exists);
            return exists;
        } catch {
            this.validationCache.set(path, false);
            return false;
        }
    }

    async validateMapAssets(mapData: MapAssetReferences): Promise<AssetValidationResult> {
        const result: AssetValidationResult = {
            valid: true,
            missingAssets: []
        };

        if (mapData.background && !(await this.validateAsset(mapData.background))) {
            result.valid = false;
            result.missingAssets.push({
                id: 'background',
                type: 'map',
                path: mapData.background,
                objectId: 'background',
                objectName: t('validation.mapBackground')
            });
        }

        for (const [tokenId, token] of Object.entries(mapData.objects.tokens)) {
            if (token.imagePath && !(await this.validateAsset(token.imagePath))) {
                result.valid = false;
                result.missingAssets.push({
                    id: tokenId,
                    type: 'token',
                    path: token.imagePath,
                    objectId: tokenId,
                    objectName: (token.kind === 'character' && token.name) || tokenId
                });
            }
        }

        return result;
    }

    showMissingAssetsNotice(missingAssets: MissingAsset[]): void {
        if (missingAssets.length === 0) return;

        const tokenCount = missingAssets.filter(a => a.type === 'token').length;
        const mapCount = missingAssets.filter(a => a.type === 'map').length;

        let message = `${t('validation.missing')}\n`;
        if (tokenCount > 0) message += `- ${t('validation.tokenImages', { count: tokenCount })}\n`;
        if (mapCount > 0) message += `- ${t('validation.backgrounds', { count: mapCount })}\n`;
        
        message += `\n${t('validation.placeholders')}`;

        new Notice(message, 5000);
    }

    clearCache(): void {
        this.validationCache.clear();
    }

    // Asset recovery methods
    async findSimilarAssets(missingPath: string): Promise<string[]> {
        const fileName = missingPath.split('/').pop() || '';
        const similarFiles: string[] = [];

        // Search for files with similar names
        const allFiles = this.plugin.app.vault.getFiles();
        for (const file of allFiles) {
            if (file.extension.match(/^(png|jpg|jpeg|webp|gif)$/i)) {
                if (file.name.toLowerCase().includes(fileName.toLowerCase())) {
                    similarFiles.push(file.path);
                }
            }
        }

        return similarFiles;
    }
}
