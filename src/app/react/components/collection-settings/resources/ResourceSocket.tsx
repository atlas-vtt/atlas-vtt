import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '../../../../../utils/cn';
import { t } from '../../../../i18n';
import type { ResourceDefinition } from '../../../../resources/resourceTypes';
import { isComplete, SOCKET_SIZE, type SocketPlace } from './resourceSockets';

interface ResourceSocketProps {
  place: SocketPlace;
  resource: ResourceDefinition | undefined;
  selected: boolean;
  /** Being dragged to another socket. */
  lifted: boolean;
  /** A dragged resource would land here. */
  dropTarget: boolean;
  onSelect: () => void;
  onPress: () => void;
  onEnter: () => void;
}

/** Share of a bar or ring that is filled in the picture: enough to read as a gauge. A static value shows whole. */
const SAMPLE_FILL = 0.68;
const sampleFill = (resource: ResourceDefinition): number => (resource.direction === 'static' ? 1 : SAMPLE_FILL);
const RING = { radius: 15, width: 6 } as const;

/** The ring of a wheel socket, as the map draws it: a faint groove and the fill in the resource's colour. */
function WheelRing({ color, fill }: { color: string; fill: number }): React.ReactElement {
  const size = SOCKET_SIZE.wheel.width;
  const circumference = 2 * Math.PI * RING.radius;
  return (
    <svg className="atlas-csm-socket__ring" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle className="atlas-csm-socket__groove" cx={size / 2} cy={size / 2} r={RING.radius} fill="none" strokeWidth={RING.width} />
      <circle cx={size / 2} cy={size / 2} r={RING.radius} fill="none" stroke={color} strokeWidth={RING.width}
        strokeDasharray={`${circumference * fill} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

/**
 * One socket of the token in the Resources tab: empty, or showing its resource as the map
 * will (a bar, or a wheel with its name beside it). A click selects it; pressing a filled
 * socket and moving onto another one drags its resource there.
 */
export function ResourceSocket({ place, resource, selected, lifted, dropTarget, onSelect, onPress, onEnter }: ResourceSocketProps): React.ReactElement {
  const { width, height } = SOCKET_SIZE[place.shape];
  const name = resource ? resource.name.trim() || t('resource.socket.unnamedResource') : t('resource.socket.empty');
  return (
    <button
      type="button"
      className={cn(
        'atlas-csm-socket', `atlas-csm-socket--${place.shape}`, `atlas-csm-socket--${place.fanSide}`,
        resource ? 'atlas-csm-socket--filled' : 'atlas-csm-socket--empty',
        selected && 'atlas-selected', lifted && 'atlas-lifted', dropTarget && 'atlas-drop-target',
      )}
      style={{ left: place.x - width / 2, top: place.y - height / 2, width, height }}
      aria-label={t('resource.socket.named', { name, where: place.where })}
      aria-pressed={selected}
      aria-invalid={resource && !isComplete(resource) ? true : undefined}
      onClick={onSelect}
      // The primary button only; a right or middle press drags nothing
      onPointerDown={(event) => { if (resource && !(event.button > 0)) onPress(); }}
      onPointerEnter={onEnter}
    >
      <span className="atlas-csm-socket__shape">
        {resource && place.shape === 'bar' && (
          <span className="atlas-csm-socket__fill" style={{ width: `calc(${sampleFill(resource) * 100}% - ${sampleFill(resource) * 4}px)`, backgroundColor: resource.color }} />
        )}
        {resource && place.shape === 'wheel' && <WheelRing color={resource.color} fill={sampleFill(resource)} />}
      </span>
      {resource
        ? <span className="atlas-csm-socket__label">{resource.name.trim() || t('resource.socket.unnamed')}</span>
        : <Plus className="atlas-csm-socket__plus" aria-hidden="true" />}
    </button>
  );
}
