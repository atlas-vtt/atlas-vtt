import React from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { MAP_LOADING_OVERLAY_FADE_MS, MAP_LOADING_REVEAL_DELAY_MS } from '../../pixi/mapLoadingFrameHold';
import { LoadingSpinner } from '../../packages/components/primitives/LoadingSpinner';
import { EASE_OUT_CONTROL_POINTS, MOTION_NORMAL_MS } from '../../utils/motion';
import { cn } from '../../../utils/cn';
import './map-loading-overlay.scss';
import { t } from '../../i18n';

/** Timing shared with the canvas frame hold, which hands over to the overlay once it is opaque. */
const TIMING_STYLE = {
    '--atlas-map-loading-reveal-delay': `${MAP_LOADING_REVEAL_DELAY_MS}ms`,
    '--atlas-map-loading-fade': `${MAP_LOADING_OVERLAY_FADE_MS}ms`,
} as React.CSSProperties;

const MESSAGE_TRANSITION = { duration: MOTION_NORMAL_MS / 1000, ease: EASE_OUT_CONTROL_POINTS };

interface MapLoadingOverlayProps {
    isLoading: boolean;
    progress?: number;
    message?: string;
}

export const MapLoadingOverlay: React.FC<MapLoadingOverlayProps> = ({
    isLoading,
    progress,
    message = t('map.loading')
}): React.ReactElement => {
    // Stays mounted so it can fade out; it blocks input from the start of a load but only fades in after the reveal delay
    return (
        <div
            className={cn('atlas-map-loading-overlay', isLoading && 'atlas-map-loading-overlay--active')}
            style={TIMING_STYLE}
            aria-hidden={!isLoading}
        >
            <div className="atlas-map-loading-content">
                <LoadingSpinner />
                <MotionConfig reducedMotion="user">
                    {/* Messages stack in one grid cell so the outgoing one crossfades in place */}
                    <div className="atlas-map-loading-text">
                        <AnimatePresence initial={false}>
                            <motion.span
                                key={message}
                                initial={{ opacity: 0, y: 4, filter: 'blur(2px)' }}
                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, y: -4, filter: 'blur(2px)' }}
                                transition={MESSAGE_TRANSITION}
                            >
                                {message}
                            </motion.span>
                        </AnimatePresence>
                    </div>
                </MotionConfig>
                {progress !== undefined && (
                    <div className="atlas-map-loading-progress">
                        <div
                            className="atlas-map-loading-progress-bar"
                            style={{ transform: `scaleX(${Math.min(100, Math.max(0, progress)) / 100})` }}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
