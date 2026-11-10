import { App, TFile } from 'obsidian';
import { t } from '../i18n';
import { showNotice } from '../ui/notice';

export interface MigrationMapping {
    oldPath: string | RegExp;
    newPath: string | ((match: string) => string);
    description: string;
}

export class DataFileMigration {
    private app: App;
    
    // Define migrations - Step 5: Add collection-specific data files
    private migrations: MigrationMapping[] = [
        // Step 1: Settings file
        {
            oldPath: 'atlas-vtt/settings.json',
            newPath: 'atlas-vtt/.atlas-data/settings.json',
            description: 'Settings file'
        },
        // Step 2: Global soundboard state
        {
            oldPath: 'atlas-vtt/global-soundboard.json',
            newPath: 'atlas-vtt/.atlas-data/global-soundboard.json',
            description: 'Global soundboard state'
        },
        // Step 3: Collections metadata
        {
            oldPath: 'atlas-vtt/collections/collections-metadata.json',
            newPath: 'atlas-vtt/.atlas-data/collections-metadata.json',
            description: 'Collections metadata'
        },
        // Step 4: Assets metadata (stores all token/asset information)
        {
            oldPath: 'atlas-vtt/assets-metadata.json',
            newPath: 'atlas-vtt/.atlas-data/assets-metadata.json',
            description: 'Assets metadata'
        },
        // Step 5: Collection playlists (individual files in playlists folder)
        {
            oldPath: /^atlas-vtt\/collections\/([^/]+)\/playlists\/(.+\.json)$/,
            newPath: (match: string) => {
                const parts = match.match(/^atlas-vtt\/collections\/([^/]+)\/playlists\/(.+\.json)$/);
                if (parts) {
                    return `atlas-vtt/.atlas-data/collections/${parts[1]}/playlists/${parts[2]}`;
                }
                return match;
            },
            description: 'Collection playlists (folder)'
        },
        // Step 5: Collection playlists (single file in collection root)
        {
            oldPath: /^atlas-vtt\/collections\/([^/]+)\/playlists\.json$/,
            newPath: (match: string) => {
                const parts = match.match(/^atlas-vtt\/collections\/([^/]+)\/playlists\.json$/);
                if (parts) {
                    return `atlas-vtt/.atlas-data/collections/${parts[1]}/playlists.json`;
                }
                return match;
            },
            description: 'Collection playlists (file)'
        },
        // Step 5: Collection ambient sounds  
        {
            oldPath: /^atlas-vtt\/collections\/([^/]+)\/ambient\/(.+\.json)$/,
            newPath: (match: string) => {
                const parts = match.match(/^atlas-vtt\/collections\/([^/]+)\/ambient\/(.+\.json)$/);
                if (parts) {
                    return `atlas-vtt/.atlas-data/collections/${parts[1]}/ambient/${parts[2]}`;
                }
                return match;
            },
            description: 'Collection ambient sounds'
        },
        // Step 5: Music track metadata files
        {
            oldPath: /^atlas-vtt\/collections\/([^/]+)\/music\/\.metadata\/(.+\.json)$/,
            newPath: (match: string) => {
                const parts = match.match(/^atlas-vtt\/collections\/([^/]+)\/music\/\.metadata\/(.+\.json)$/);
                if (parts) {
                    return `atlas-vtt/.atlas-data/collections/${parts[1]}/music/.metadata/${parts[2]}`;
                }
                return match;
            },
            description: 'Music track metadata'
        },
        // Step 6: Map thumbnails
        {
            oldPath: /^atlas-vtt\/collections\/([^/]+)\/maps\/(.+\.thumb\.jpg)$/,
            newPath: (match: string) => {
                const parts = match.match(/^atlas-vtt\/collections\/([^/]+)\/maps\/(.+\.thumb\.jpg)$/);
                if (parts) {
                    return `atlas-vtt/.atlas-data/collections/${parts[1]}/maps/${parts[2]}`;
                }
                return match;
            },
            description: 'Map thumbnails'
        }
    ];

    constructor(app: App) {
        this.app = app;
    }

    /**
     * Check if migration is needed
     */
    async needsMigration(): Promise<boolean> {
        // Check if the migration has already been completed
        const migrationFlag = 'atlas-vtt/.atlas-data/migration-completed.json';
        if (await this.app.vault.adapter.exists(migrationFlag)) {
            // Double-check that the migration actually completed by checking if files exist at new locations
            const newSettingsPath = 'atlas-vtt/.atlas-data/settings.json';
            const oldSettingsPath = 'atlas-vtt/settings.json';
            
            const newExists = await this.app.vault.adapter.exists(newSettingsPath);
            const oldExists = await this.app.vault.adapter.exists(oldSettingsPath);
            
            // If old files exist but new ones don't, the migration didn't actually complete
            if (oldExists && !newExists) {
                try {
                    await this.app.vault.adapter.remove(migrationFlag);
                } catch (e) {
                    console.error('[DataFileMigration] Failed to remove stale migration flag:', e);
                }
                // Continue to check for migration
            } else {
                return false;
            }
        }

        // Check if any old files exist
        for (const migration of this.migrations) {
            if (typeof migration.oldPath === 'string') {
                const exists = await this.app.vault.adapter.exists(migration.oldPath);
                if (exists) {
                    return true;
                }
            } else {
                // For regex patterns, check common locations
                const allFiles = this.app.vault.getFiles();
                const oldPathPattern = migration.oldPath;
                const matchingFiles = allFiles.filter(file => oldPathPattern.test(file.path));
                if (matchingFiles.length > 0) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Run the migration
     */
    async migrate(): Promise<void> {
        showNotice(t('migration.running'));

        let migratedCount = 0;
        let errorCount = 0;

        // Get all files in the vault
        const allFiles = this.app.vault.getFiles();

        for (const migration of this.migrations) {
            const filesToMigrate: TFile[] = [];

            if (typeof migration.oldPath === 'string') {
                // Exact path match
                const file = this.app.vault.getAbstractFileByPath(migration.oldPath);
                if (file instanceof TFile) {
                    filesToMigrate.push(file);
                }
            } else {
                // Regex pattern match
                const oldPathPattern = migration.oldPath;
                filesToMigrate.push(...allFiles.filter(file => oldPathPattern.test(file.path)));
            }

            for (const file of filesToMigrate) {
                try {
                    const newPath = typeof migration.newPath === 'string' 
                        ? migration.newPath 
                        : migration.newPath(file.path);

                    // Ensure target directory exists
                    const targetDir = newPath.substring(0, newPath.lastIndexOf('/'));
                    await this.ensureDirectoryExists(targetDir);

                    // Move the file
                    await this.app.fileManager.renameFile(file, newPath);
                    migratedCount++;
                } catch (error) {
                    console.error(`Failed to migrate ${file.path}:`, error);
                    errorCount++;
                }
            }
        }

        // Create migration flag
        try {
            await this.ensureDirectoryExists('atlas-vtt/.atlas-data');
            await this.app.vault.create(
                'atlas-vtt/.atlas-data/migration-completed.json',
                JSON.stringify({
                    version: 2,
                    timestamp: new Date().toISOString(),
                    migratedFiles: migratedCount,
                    errors: errorCount
                }, null, 2)
            );
        } catch (error) {
            console.error('Failed to create migration flag:', error);
        }

        if (errorCount > 0) {
            showNotice(t('migration.errors', { count: errorCount }));
        } else {
            showNotice(t('migration.done', { count: migratedCount }));
        }
    }

    /**
     * Ensure a directory exists, creating it if necessary
     */
    private async ensureDirectoryExists(path: string): Promise<void> {
        const parts = path.split('/');
        let currentPath = '';

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            
            if (!await this.app.vault.adapter.exists(currentPath)) {
                await this.app.vault.adapter.mkdir(currentPath);
            }
        }
    }

    /**
     * Get the new path for a given old path
     */
    getNewPath(oldPath: string): string | null {
        for (const migration of this.migrations) {
            if (typeof migration.oldPath === 'string') {
                if (oldPath === migration.oldPath) {
                    return typeof migration.newPath === 'string' 
                        ? migration.newPath 
                        : migration.newPath(oldPath);
                }
            } else {
                if (migration.oldPath.test(oldPath)) {
                    return typeof migration.newPath === 'string' 
                        ? migration.newPath 
                        : migration.newPath(oldPath);
                }
            }
        }
        return null;
    }
}

/** Vault path of the thumbnail saved for a map, named after its .atlasmap file. */
export function mapThumbnailPath(mapPath: string): string {
    return getDataFilePath(mapPath.replace('.atlasmap', '.thumb.jpg'));
}

/**
 * Helper function to get the correct path for data files
 * This should be used throughout the codebase when saving/loading data files
 * We'll gradually move files to centralized location, starting with settings
 */
export function getDataFilePath(originalPath: string): string {
    // Step 1: Settings file
    if (originalPath === 'atlas-vtt/settings.json') {
        return 'atlas-vtt/.atlas-data/settings.json';
    }
    
    // Step 2: Global soundboard state
    if (originalPath === 'atlas-vtt/global-soundboard.json') {
        return 'atlas-vtt/.atlas-data/global-soundboard.json';
    }
    
    // Step 3: Collections metadata
    if (originalPath.endsWith('collections-metadata.json')) {
        return 'atlas-vtt/.atlas-data/collections-metadata.json';
    }
    
    // Step 4: Assets metadata
    if (originalPath === 'atlas-vtt/assets-metadata.json') {
        return 'atlas-vtt/.atlas-data/assets-metadata.json';
    }
    
    // Step 5: Collection playlists
    const playlistMatch = originalPath.match(/^atlas-vtt\/collections\/([^/]+)\/playlists\/(.+\.json)$/);
    if (playlistMatch) {
        return `atlas-vtt/.atlas-data/collections/${playlistMatch[1]}/playlists/${playlistMatch[2]}`;
    }
    
    // Handle simplified collection playlist paths (e.g., "atlas-vtt/collections/my-collection/playlists.json")
    const simplePlaylistMatch = originalPath.match(/^atlas-vtt\/collections\/([^/]+)\/playlists\.json$/);
    if (simplePlaylistMatch) {
        return `atlas-vtt/.atlas-data/collections/${simplePlaylistMatch[1]}/playlists.json`;
    }
    
    // Step 5: Collection ambient sounds
    const ambientMatch = originalPath.match(/^atlas-vtt\/collections\/([^/]+)\/ambient\/(.+\.json)$/);
    if (ambientMatch) {
        return `atlas-vtt/.atlas-data/collections/${ambientMatch[1]}/ambient/${ambientMatch[2]}`;
    }
    
    // Step 5: Music track metadata
    const musicMetadataMatch = originalPath.match(/^atlas-vtt\/collections\/([^/]+)\/music\/\.metadata\/(.+\.json)$/);
    if (musicMetadataMatch) {
        return `atlas-vtt/.atlas-data/collections/${musicMetadataMatch[1]}/music/.metadata/${musicMetadataMatch[2]}`;
    }
    
    // Step 6: Map thumbnails
    const mapThumbnailMatch = originalPath.match(/^atlas-vtt\/collections\/([^/]+)\/maps\/(.+\.thumb\.jpg)$/);
    if (mapThumbnailMatch) {
        return `atlas-vtt/.atlas-data/collections/${mapThumbnailMatch[1]}/maps/${mapThumbnailMatch[2]}`;
    }
    
    // Everything else stays in original location for now
    return originalPath;
}
