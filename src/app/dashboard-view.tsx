import { App, ItemView, WorkspaceLeaf, TFile, Notice } from "obsidian";
import type AtlasVTTPlugin from '../../main';
import { createRoot, Root } from 'react-dom/client';
import React, { useState, useEffect } from 'react';
import { AssetService } from './services/AssetService';
import { GlobalAssetManagerService } from './services/GlobalAssetManagerService';
import { Button } from './packages/components/primitives/button';
import {
  Map,
  Plus,
  FolderOpen,
  Clock,
  Loader2,
  FileText,
  Play,
  Sparkles,
} from 'lucide-react';
import { runInBackground } from './utils/backgroundTask';
import { t } from './i18n';
import { mapThumbnailPath } from './utils/dataFileMigration';
import { byLastOpened, SceneOpenHistory, type SceneRecency } from './services/sceneOpenHistory';

export const DASHBOARD_VIEW_TYPE = "atlas-vtt-dashboard";

interface RecentScene extends SceneRecency {
  id: string;
  path: string;
  name: string;
  collectionName: string;
  collectionId: string;
  thumbnailUrl: string | null;
}

/** When the scene was last played, or else when its record last changed. */
const lastActivity = (scene: RecentScene): number => scene.openedAt ?? scene.modifiedAt;

interface DashboardProps {
  app: App;
  onOpenScene: (filePath: string) => void;
  onCreateMap: () => void;
  onOpenAssetManager: () => void;
}

/** Resolve a scene's thumbnail to a vault resource URL. */
function resolveSceneThumbnail(app: App, mapPath: string): string | null {
  const thumbFile = app.vault.getAbstractFileByPath(mapThumbnailPath(mapPath));
  return thumbFile instanceof TFile ? app.vault.getResourcePath(thumbFile) : null;
}

export const Dashboard: React.FC<DashboardProps> = ({
  app,
  onOpenScene,
  onCreateMap,
  onOpenAssetManager,
}) => {
  const [recentScenes, setRecentScenes] = useState<RecentScene[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadRecentScenes();
    const refreshRef = app.workspace.on('atlas-vtt:refresh-assets', () => { void loadRecentScenes(); });
    const thumbnailRef = app.workspace.on('atlas-vtt:scene-thumbnail-updated', () => { void loadRecentScenes(); });
    const openedRef = app.workspace.on('atlas-vtt:scene-opened', () => { void loadRecentScenes(); });
    return () => {
      app.workspace.offref(refreshRef);
      app.workspace.offref(thumbnailRef);
      app.workspace.offref(openedRef);
    };
  }, []);

  const loadRecentScenes = async (): Promise<void> => {
    try {
      const assetService = AssetService.getInstance(app);
      const collections = await assetService.getCollections();
      const openHistory = SceneOpenHistory.forApp(app);

      // Only scenes open in the Atlas view; a map asset is an image to build a scene from
      const scenePromises = collections.map(async (col) => {
        const assets = await assetService.getAssets(col.id, 'scene');
        return assets.map((asset) => {
          const path = asset.data?.mapPath ?? '';
          return {
            id: asset.id,
            path,
            name: asset.name,
            collectionName: col.name,
            collectionId: col.id,
            openedAt: openHistory.openedAt(asset.id),
            modifiedAt: asset.modifiedAt,
            thumbnailUrl: path ? resolveSceneThumbnail(app, path) : null,
          } satisfies RecentScene;
        });
      });

      const allScenes = (await Promise.all(scenePromises))
        .flat()
        .filter((scene) => scene.path !== '')
        .sort(byLastOpened)
        .slice(0, 8);

      setRecentScenes(allScenes);
    } catch (error) {
      console.error('[Dashboard] Error loading recent scenes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatRelativeTime = (timestamp: number): string => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return t('dashboard.justNow');
    if (minutes < 60) return t('dashboard.minutesAgo', { count: minutes });
    if (hours < 24) return t('dashboard.hoursAgo', { count: hours });
    return t('dashboard.daysAgo', { count: days });
  };

  const heroScene = recentScenes[0] ?? null;

  const actionTiles = [
    { key: 'create', icon: Plus, title: t('dashboard.createScene'), desc: t('dashboard.createSceneDesc'), onClick: onCreateMap },
    { key: 'assets', icon: FolderOpen, title: t('dashboard.assets'), desc: t('dashboard.assetsDesc'), onClick: onOpenAssetManager },
  ] as const;

  return (
    <div className="atlas-dashboard">
      <div className="dashboard-container">
        {/* Hero + actions stage */}
        <main className="dashboard-stage">
          <div className="dashboard-hero">
            <h1 className="dashboard-title">
              Atlas<span>VTT</span>
            </h1>
            <p className="dashboard-tagline">{t('dashboard.tagline')}</p>
          </div>

          <div className="dashboard-columns">
            <div className="dashboard-actions">
              {heroScene ? (
                <Button
                  variant="ghost"
                  className="hero-card"
                  onClick={() => onOpenScene(heroScene.path)}
                >
                  <div className="dashboard-thumb dashboard-thumb--l">
                    {heroScene.thumbnailUrl ? (
                      <img src={heroScene.thumbnailUrl} alt="" />
                    ) : (
                      <Map size={24} />
                    )}
                  </div>
                  <div className="hero-card-body">
                    <span className="hero-card-eyebrow">
                      <Clock size={13} /> {t('dashboard.continue')}
                    </span>
                    <span className="hero-card-title">{heroScene.name}</span>
                    <span className="hero-card-meta">
                      {heroScene.collectionName} &middot; {formatRelativeTime(lastActivity(heroScene))}
                    </span>
                  </div>
                  <span className="hero-card-go">
                    <Play size={18} />
                  </span>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  className="hero-card hero-card--empty"
                  onClick={onCreateMap}
                >
                  <div className="hero-card-body">
                    <span className="hero-card-eyebrow">
                      <Sparkles size={13} /> Begin
                    </span>
                    <span className="hero-card-title">{t('dashboard.firstScene')}</span>
                    <span className="hero-card-meta">{t('dashboard.firstSceneMeta')}</span>
                  </div>
                  <span className="hero-card-go">
                    <Plus size={18} />
                  </span>
                </Button>
              )}

              <div className="action-grid">
                {actionTiles.map(({ key, icon: Icon, title, desc, onClick }) => (
                  <Button key={key} variant="ghost" className="action-card" onClick={onClick}>
                    <span className="action-icon">
                      <Icon size={18} />
                    </span>
                    <span className="action-text">
                      <span className="action-title">{title}</span>
                      <span className="action-desc">{desc}</span>
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <aside className="dashboard-recent">
              <div className="dashboard-panel">
                <div className="panel-heading">{t('dashboard.recent')}</div>
                {isLoading ? (
                  <div className="recent-loading">
                    <Loader2 size={20} className="spinner" />
                    <span>{t('dashboard.loadingScenes')}</span>
                  </div>
                ) : recentScenes.length > 0 ? (
                  <div className="recent-scenes">
                    {recentScenes.map((scene) => (
                      <Button
                        key={scene.id}
                        variant="ghost"
                        className="recent-scene-item"
                        onClick={() => onOpenScene(scene.path)}
                      >
                        <div className="dashboard-thumb">
                          {scene.thumbnailUrl ? (
                            <img src={scene.thumbnailUrl} alt={scene.name} />
                          ) : (
                            <Map size={18} />
                          )}
                        </div>
                        <div className="recent-scene-content">
                          <div className="recent-scene-name">{scene.name}</div>
                          <div className="recent-scene-meta">
                            <span className="recent-scene-collection">{scene.collectionName}</span>
                            <span className="recent-scene-separator">&middot;</span>
                            <span>{formatRelativeTime(lastActivity(scene))}</span>
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="recent-empty">
                    <FileText size={28} className="empty-icon" />
                    <p>{t('dashboard.noScenes')}</p>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
};

/**
 * Dashboard View - Welcome screen and main entry point for Atlas VTT
 */
export class DashboardView extends ItemView {
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: AtlasVTTPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return t('dashboard.title');
  }

  getIcon(): string {
    return "home";
  }

  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('atlas-vtt-plugin');
    containerEl.addClass('atlas-dashboard-view');

    try {
      this.root = createRoot(containerEl);

      this.root.render(
        <Dashboard
          app={this.app}
          onOpenScene={(filePath) => { void this.handleOpenScene(filePath); }}
          onCreateMap={() => runInBackground(this.handleCreateMap(), 'Opening the map picker', 'Could not open the asset manager')}
          onOpenAssetManager={() => this.handleOpenAssetManager()}
        />
      );
    } catch (error) {
      console.error('[DashboardView] Error during React rendering:', error);
      containerEl.createDiv({ text: t('dashboard.failed') });
    }
  }

  async onClose(): Promise<void> {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
  }

  private async handleOpenScene(filePath: string): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      if (!file) {
        new Notice(t('view.sceneNotFound', { path: filePath }));
        return;
      }

      const leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: 'atlas-vtt',
        state: { file: filePath }
      });
      this.app.workspace.setActiveLeaf(leaf);
    } catch (error) {
      console.error('Error opening scene:', error);
      new Notice(t('dashboard.openFailed'));
    }
  }

  private async handleCreateMap(): Promise<void> {
    const assetService = AssetService.getInstance(this.app);
    const maps = await assetService.getAssets(undefined, 'map');

    if (maps.length === 0) {
      new Notice(t('dashboard.addMapFirst'));
    }

    const globalAM = new GlobalAssetManagerService(this.app);
    globalAM.open('maps');
  }

  private handleOpenAssetManager(): void {
    const globalAM = new GlobalAssetManagerService(this.app);
    globalAM.open('scenes');
  }
}
