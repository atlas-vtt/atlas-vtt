/**
 * ResourcesTab — the expendable resources tokens of a collection track (HP, Stress, ammunition…),
 * edited on a picture of a token: each resource sits in the socket where the map shows it.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';
import fighterArt from '../../../assets/starter-tokens/fighter.webp?inline';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import { EASE_OUT_CONTROL_POINTS } from '../../../utils/motion';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { ResourceCard } from './resources/ResourceCard';
import { ResourceFan } from './resources/ResourceFan';
import { ResourceSocket } from './resources/ResourceSocket';
import { isUntouched, movedResources, newResourceAt, resourcesBySocket, SOCKETS, withSockets } from './resources/resourceSockets';

interface ResourcesTabProps {
  resources: ResourceDefinition[];
  onChange: (resources: ResourceDefinition[]) => void;
  /** Statblock fields of the collection's creatures that hold a quantity, offered for the field. */
  fieldSuggestions: readonly string[];
}

const CARD_MOTION = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: EASE_OUT_CONTROL_POINTS, delay: 0.06 } },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.12, ease: EASE_OUT_CONTROL_POINTS } },
} as const;

export function ResourcesTab({ resources, onChange, fieldSuggestions }: ResourcesTabProps): React.ReactElement {
  const [selected, setSelected] = useState<number | null>(null);
  /** The socket a resource was last placed in by a click; its card starts with the name. */
  const [placed, setPlaced] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [lifted, setLifted] = useState<number | null>(null);
  /** The socket whose resource is pressed, until the pointer is released. */
  const pressed = useRef<number | null>(null);
  const bySocket = resourcesBySocket(resources);
  const current = selected === null ? undefined : bySocket[selected];
  const place = selected === null ? undefined : SOCKETS[selected];

  /** The list without a resource that was placed and then left as it came. */
  const withoutUntouched = (slot: number | null): ResourceDefinition[] => {
    const resource = slot === null ? undefined : bySocket[slot];
    return resource && isUntouched(resource) ? withSockets(resources).filter((other) => other.slot !== slot) : withSockets(resources);
  };

  const close = (): void => {
    if (selected === null) return;
    const kept = withoutUntouched(selected);
    if (kept.length !== resources.length) onChange(kept);
    setSelected(null);
  };

  const select = (slot: number): void => {
    if (slot === selected) {
      close();
      return;
    }
    const kept = withoutUntouched(selected);
    if (bySocket[slot]) {
      if (kept.length !== resources.length) onChange(kept);
    } else {
      onChange(withSockets([...kept, newResourceAt(slot, kept)]));
      setPlaced(slot);
    }
    setSelected(slot);
  };

  const change = (partial: Partial<ResourceDefinition>): void => {
    onChange(withSockets(resources).map((resource) => (resource.slot === selected ? { ...resource, ...partial } : resource)));
  };

  const remove = (): void => {
    onChange(withSockets(resources).filter((resource) => resource.slot !== selected));
    setSelected(null);
  };

  // A drag ends wherever the pointer is released: on a socket it moves the resource there
  useEffect(() => {
    const release = (): void => {
      const from = pressed.current;
      pressed.current = null;
      if (from !== null && dropTarget !== null && dropTarget !== from) {
        onChange(movedResources(resources, from, dropTarget));
        setSelected(null);
      }
      setLifted(null);
      setDropTarget(null);
    };
    window.addEventListener('pointerup', release);
    return () => window.removeEventListener('pointerup', release);
  }, [dropTarget, resources, onChange]);

  const enter = (slot: number): void => {
    if (pressed.current === null || pressed.current === slot) return;
    setLifted(pressed.current);
    setDropTarget(slot);
  };

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Escape' || selected === null) return;
    // Escape closes the socket; the dialog stays open
    event.stopPropagation();
    close();
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="atlas-csm-resources" onKeyDown={onKeyDown}>
        <p className="atlas-csm-hint">{t('resource.tab.hint')}</p>

        <div className={cn('atlas-csm-token-stage', selected !== null && 'atlas-focused', lifted !== null && 'atlas-dragging')}
          role="presentation" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
          <div className="atlas-csm-token-rig" role="group" aria-label={t('resource.tab.sockets')}>
            {/* A token as the map draws it: the fighter of the starter tokens in Atlas' ring */}
            <span className="atlas-csm-token-art" aria-hidden="true"><TokenPortrait src={fighterArt} alt="" /></span>
            <span className="atlas-csm-token-nameplate" aria-hidden="true">{t('resource.tab.nameplate')}</span>
            <span className="atlas-csm-token-caption atlas-csm-token-caption--bars" aria-hidden="true">{t('resource.tab.alwaysShown')}</span>
            <span className="atlas-csm-token-caption atlas-csm-token-caption--right" aria-hidden="true">{t('resource.tab.onHover')}</span>
            <span className="atlas-csm-token-caption atlas-csm-token-caption--left" aria-hidden="true">{t('resource.tab.onHover')}</span>
            {SOCKETS.map((socket) => (
              <ResourceSocket
                key={socket.slot}
                place={socket}
                resource={bySocket[socket.slot]}
                selected={selected === socket.slot}
                lifted={lifted === socket.slot}
                dropTarget={dropTarget === socket.slot}
                onSelect={() => select(socket.slot)}
                onPress={() => { pressed.current = socket.slot; }}
                onEnter={() => enter(socket.slot)}
              />
            ))}
            <AnimatePresence>
              {place && current && <ResourceFan key={place.slot} place={place} resource={current} onChange={change} onRemove={remove} />}
            </AnimatePresence>
          </div>
        </div>

        <div className="atlas-csm-resource-dock">
          <div className={cn('atlas-csm-resource-dock__idle', current && 'atlas-hidden')}>{t('resource.tab.idle')}</div>
          <AnimatePresence>
            {place && current && (
              <motion.div key="card" className="atlas-csm-resource-dock__card" {...CARD_MOTION}>
                <ResourceCard place={place} resource={current} fieldSuggestions={fieldSuggestions} focusName={placed === place.slot} onChange={change} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}
