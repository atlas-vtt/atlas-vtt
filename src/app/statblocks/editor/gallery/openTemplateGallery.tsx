/**
 * Opening the template gallery outside a dialog of Atlas (the command "New
 * statblock template…"): for the collection named, else the default one. The
 * new template opens in the template editor unsaved; "Use for" gives it to the
 * role once it is saved. Behind the `statblockEditor` switch.
 */

import React from 'react';
import type { App } from 'obsidian';
import { experimentalFeatureOn } from '../../../experimental/experimentalFeatures';
import { AssetService } from '../../../services/AssetService';
import { systemPresetsOf } from '../../../services/mapCollectionRules';
import { collectionStatblockRoles } from '../../roles/collectionStatblockRoles';
import { showHostedDialog } from '../hostedDialog';
import { openPick } from './galleryActions';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import { builtInsNamedBy, systemTemplateIds } from './gallerySources';
import { TemplateGallery, type TemplateGalleryProps } from './TemplateGallery';

type HostedGallery = Omit<TemplateGalleryProps, 'onClose'>;

/** Shows the gallery in `gallery.doc`; focus goes back where it was once it closes. */
export function showTemplateGallery(gallery: HostedGallery): void {
  showHostedDialog(gallery.doc, 'atlas-te-gallery-host', (close) => <TemplateGallery key="gallery" {...gallery} onClose={close} />);
}

/** "New statblock template…": the gallery for a collection, whose new template opens in the template editor. */
export async function openTemplateGallery(app: App, collectionId: string | null = null): Promise<void> {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return;
  const assets = AssetService.getInstance(app);
  const known = await assets.getCollections();
  const id = collectionId !== null && known.some((collection) => collection.id === collectionId) ? collectionId : assets.getDefaultCollectionId();
  const settings = assets.getCollectionSettings(id);
  const presets = systemPresetsOf(app);
  const system = presets.find((preset) => preset.id === settings.systemPresetId)?.rules.statblockRoles;
  const name = known.find((collection) => collection.id === id)?.name ?? id;
  const builtIns = TemplateLibrary.forApp(app).list().filter((entry) => entry.builtIn);
  showTemplateGallery({
    app,
    doc: activeDocument,
    roles: collectionStatblockRoles(settings, presets),
    systemTemplateIds: [...new Set([...builtInsNamedBy(name, builtIns), ...systemTemplateIds(system)])],
    onUse: (pick, roleId) => openPick(app, pick, id, roleId),
  });
}
