import { Tutorial } from '../../onboarding/Tutorial';
import { useHotkeyLabels } from '../../keyboard/useMapHotkeys';
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import {
  Search,
  ArrowUp,
  Hand,
  Cloud,
  Ruler,
  MapPin,
  FolderOpen,
  Dices,
  Eye,
  EyeOff,
  FlaskConical,
  Grid,
  Settings,
  Snowflake,
  MonitorUp,
  Move,
  Users,
  Palette,
  UserCheck,
  History,
} from 'lucide-react';
import { CoinIcon } from './CoinIcon';
import { Notice } from 'obsidian';
import { useStore } from 'zustand';
import { useAtlasStore, useViewStoreHook } from '../ViewStoreContext';
import { useAtlasUI } from '../root/AtlasUIContext';
import { PlayerWindowService } from '../../services/PlayerWindowService';
import { presentActiveTabInPlayerWindow } from '../../services/PlayerWindowPresenter';
import { playerWindowStore } from '../../stores/playerWindowStore';
import { debounce } from '../../../utils/debounce';
import { cn } from '../../../utils/cn';
import { isShortcutScopeActive } from '../../utils/activeLeafGuard';
import { EASE_OUT_CONTROL_POINTS as EASE_OUT } from '../../utils/motion';
import { Button } from '../../packages/components/primitives/button';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { CommandItem } from './command-palette/CommandItem';
import { SettingsPanelHeader } from './command-palette/SettingsPanelHeader';
import { GridSettingsPanel } from './command-palette/GridSettingsPanel';
import { TokenSettingsPanel } from './command-palette/TokenSettingsPanel';
import { WidgetSettingsPanel } from './command-palette/WidgetSettingsPanel';
import { LocalPlayerViewSettingsPanel } from './command-palette/LocalPlayerViewSettingsPanel';
import { DiceSettingsPanel } from './command-palette/DiceSettingsPanel';
import { ExperimentalFeaturesPanel } from './command-palette/ExperimentalFeaturesPanel';
import { SceneSnapshotsPanel } from './command-palette/SceneSnapshotsPanel';
import { placePalette, type PalettePosition } from './command-palette/palettePlacement';
import { customizeToolbarCommand } from './command-palette/customizeToolbarCommand';
import { isSettingsPanelId, type CommandOption, type SettingsPanelId } from './command-palette/types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  toolbarRef?: React.RefObject<HTMLDivElement | null>;
  /** Starts the toolbar editor; given only where the GM may customize the toolbar. Told whether the keyboard chose it. */
  onCustomizeToolbar?: (byKeyboard: boolean) => void;
}

const DEFAULT_PALETTE_WIDTH = 600;

// The palette opens by hotkey many times per session, so it rises out of the
// toolbar quickly and over a short distance, and leaves quicker still. Full
// transform strings keep the animation on the compositor thread.
const overlayVariants = {
  open: { pointerEvents: 'auto' as const },
  // Clicks go through to the map while the palette is leaving.
  closed: { pointerEvents: 'none' as const, transition: { when: 'afterChildren' as const } },
};

const paletteVariants = {
  closed: { opacity: 0, transform: 'translateY(6px) scale(0.97)', transition: { duration: 0.11, ease: EASE_OUT } },
  open: { opacity: 1, transform: 'translateY(0px) scale(1)', transition: { duration: 0.16, ease: EASE_OUT } },
};

const SETTINGS_PANEL_META: Record<SettingsPanelId, { title: string; icon: React.ReactNode }> = {
  'scene-snapshots': { title: 'Scene Snapshots', icon: <History /> },
  'grid-settings': { title: 'Grid Settings', icon: <Grid /> },
  'token-settings': { title: 'Token Settings', icon: <Users /> },
  'widget-settings': { title: 'Widget Settings', icon: <Palette /> },
  'local-player-view-settings': { title: 'Local Player View Settings', icon: <MonitorUp /> },
  'dice-settings': { title: 'Dice Settings', icon: <Dices /> },
  'experimental-features': { title: 'Experimental Features', icon: <FlaskConical /> },
};

export function CommandPalette({ isOpen, onClose, toolbarRef, onCustomizeToolbar }: CommandPaletteProps): React.ReactElement | null {
  const hotkeyLabel = useHotkeyLabels();
  const store = useViewStoreHook();
  const setActiveTool = useAtlasStore(state => state.setActiveTool);
  const { app, view } = useAtlasUI();
  const isPlayerWindowFrozen = useStore(playerWindowStore, (s) => s.isFrozen);
  const isPlayerMode = view?.isInPlayerMode?.() ?? false;
  const setPlayerMode = (mode: boolean): void => view?.setPlayerMode?.(mode);

  const widgetSettings = useAtlasStore(state => state.widgetSettings);
  const setWidgetSettings = useAtlasStore(state => state.setWidgetSettings);
  const updateWidget = useAtlasStore(state => state.updateWidget);
  const addWidget = useAtlasStore(state => state.addWidget);
  const removeWidget = useAtlasStore(state => state.removeWidget);
  const initiative = useAtlasStore(state => state.initiative);
  const setInitiativeConfig = useAtlasStore(state => state.setInitiativeConfig);
  const initiativeTrackerOpen = useAtlasStore(state => state.initiativeTrackerOpen);
  const setInitiativeTrackerOpen = useAtlasStore(state => state.setInitiativeTrackerOpen);
  const setDiceLogOpen = useAtlasStore(state => state.setDiceLogOpen);
  const setLootRollerOpen = useAtlasStore(state => state.setLootRollerOpen);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [focusedOptionIndex, setFocusedOptionIndex] = useState<number>(-1);
  const [lastInteractionType, setLastInteractionType] = useState<'mouse' | 'keyboard'>('keyboard');
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [submenuOptions, setSubmenuOptions] = useState<CommandOption[]>([]);
  const [isTemporarilyHidden, setIsTemporarilyHidden] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const optionsContainerRef = useRef<HTMLDivElement>(null);
  // Set while Enter runs the focused option, so an action knows the keyboard chose it.
  const choosingByKeyboard = useRef(false);

  // Grid settings local state
  const gridState = view?.atlasStore?.getState()?.grid;
  const [localOpacity, setLocalOpacity] = useState(gridState?.opacity ?? 0.5);
  const [localLineWidth, setLocalLineWidth] = useState(gridState?.lineWidth ?? 1);
  const [localGridVisible, setLocalGridVisible] = useState(gridState?.visible ?? true);
  const [localSnapToGrid, setLocalSnapToGrid] = useState(gridState?.snapToGrid ?? true);

  // Sync local state with grid state
  useEffect(() => {
    if (gridState?.opacity !== undefined) {
      setLocalOpacity(gridState.opacity);
    }
  }, [gridState?.opacity]);

  useEffect(() => {
    if (gridState?.lineWidth !== undefined) {
      setLocalLineWidth(gridState.lineWidth);
    }
  }, [gridState?.lineWidth]);

  useEffect(() => {
    if (gridState?.visible !== undefined) {
      setLocalGridVisible(gridState.visible);
    }
  }, [gridState?.visible]);

  useEffect(() => {
    if (gridState?.snapToGrid !== undefined) {
      setLocalSnapToGrid(gridState.snapToGrid);
    }
  }, [gridState?.snapToGrid]);

  // Create debounced update functions
  const debouncedOpacityUpdate = useMemo(
    () => debounce((opacity: number) => {
      if (view?.atlasStore) {
        const currentGrid = view.atlasStore.getState().grid;
        if (!currentGrid) return;
        view.atlasStore.getState().setGrid({
          ...currentGrid,
          opacity
        });
      }
    }, 100),
    [view?.atlasStore]
  );

  const debouncedLineWidthUpdate = useMemo(
    () => debounce((lineWidth: number) => {
      if (view?.atlasStore) {
        const currentGrid = view.atlasStore.getState().grid;
        if (!currentGrid) return;
        view.atlasStore.getState().setGrid({
          ...currentGrid,
          lineWidth
        });
      }
    }, 100),
    [view?.atlasStore]
  );

  // Position starts as null so the first paint already sits at the measured spot
  const [position, setPosition] = useState<PalettePosition | null>(null);
  const [hasCalculatedInitialPosition, setHasCalculatedInitialPosition] = useState(false);

  // Get sorted widgets for individual widget controls - memoized to prevent unnecessary re-renders
  const sortedWidgets = useMemo(() => {
    return widgetSettings?.widgets
      ? Object.values(widgetSettings.widgets).sort((a, b) => a.order - b.order)
      : [];
  }, [widgetSettings?.widgets]);

  // Command options for Atlas VTT
  const commandOptions: CommandOption[] = [
    // Tool commands
    {
      id: "move-tool",
      icon: <Hand />,
      label: "Move Tool",
      shortcut: hotkeyLabel('move'),
      section: "tools",
      action: () => {
        setActiveTool("move");
        onClose();
      },
    },
    {
      id: "fog-tool",
      icon: <Cloud />,
      label: "Fog Tool",
      shortcut: hotkeyLabel('fog'),
      section: "tools",
      action: () => {
        setActiveTool("fog");
        onClose();
      },
    },
    {
      id: "measure-tool",
      icon: <Ruler />,
      label: "Measure Tool",
      shortcut: hotkeyLabel('measure'),
      section: "tools",
      action: () => {
        setActiveTool("measure");
        onClose();
      },
    },
    {
      id: "note-pin-tool",
      icon: <MapPin />,
      label: "Note Pin Tool",
      shortcut: hotkeyLabel('pin'),
      section: "tools",
      action: () => {
        setActiveTool("note-pin");
        onClose();
      },
    },
    {
      id: "open-scene-browser",
      icon: <FolderOpen />,
      label: "Open scene browser",
      keywords: ["asset manager", "maps", "toggle"],
      section: "tools",
      action: () => {
        onClose();
        view?.openSceneBrowser();
      },
    },
    {
      id: "scene-snapshots",
      icon: <History />,
      label: "Scene snapshots",
      keywords: ["save", "restore", "reset", "encounter", "state"],
      section: "tools",
      hasSubmenu: true,
      submenu: [],
    },
    {
      id: "open-dice-log",
      icon: <Dices />,
      label: "Open dice log",
      keywords: ["roll history", "toggle"],
      shortcut: hotkeyLabel('diceLog'),
      section: "tools",
      action: () => {
        setDiceLogOpen(true);
        onClose();
      },
    },
    {
      id: "open-loot-roller",
      icon: <CoinIcon />,
      label: "Open loot roller",
      keywords: ["loot", "treasure", "items", "roll", "base", "toggle"],
      shortcut: hotkeyLabel('lootRoller'),
      section: "tools",
      action: () => {
        setLootRollerOpen(true);
        onClose();
      },
    },
    // Mode commands
    {
      id: "toggle-player-mode",
      icon: isPlayerMode ? <EyeOff /> : <Eye />,
      label: isPlayerMode ? "Exit Player Mode" : "Enter Player Mode",
      section: "mode",
      action: () => {
        setPlayerMode(!isPlayerMode);
        onClose();
      },
      isToggle: true,
      isActive: isPlayerMode,
    },
    {
      id: "freeze-player-camera",
      icon: <Snowflake />,
      label: "Freeze Player Camera",
      section: "mode",
      action: () => {
        const service = PlayerWindowService.getInstance();
        if (service?.isWindowOpen()) {
          service.toggleCameraFreeze();
        } else {
          new Notice("No player window is open");
        }
      },
      isToggle: true,
      isActive: isPlayerWindowFrozen,
    },
    {
      id: "transfer-player-view",
      icon: <MonitorUp />,
      label: "Send Current Map to Player View",
      section: "mode",
      action: () => {
        void presentActiveTabInPlayerWindow(app);
        onClose();
      },
    },
    // Settings
    {
      id: "grid-settings",
      icon: <Settings />,
      label: "Grid settings",
      section: "settings",
      hasSubmenu: true,
      submenu: [
        {
          id: "grid-all-settings",
          icon: null,
          label: "Grid appearance",
          section: "grid",
          hasSubmenu: false,
        },
      ],
    },
    {
      id: "token-settings",
      icon: <Settings />,
      label: "Token settings",
      section: "settings",
      hasSubmenu: true,
      submenu: [
        {
          id: "token-all-settings",
          icon: null,
          label: "Token appearance",
          section: "tokens",
          hasSubmenu: false,
        },
      ],
    },
    {
      id: "widget-settings",
      icon: <Settings />,
      label: "Widget settings",
      section: "settings",
      hasSubmenu: true,
      submenu: [
      ],
    },
    {
      id: "local-player-view-settings",
      icon: <UserCheck />,
      label: "Local player view settings",
      section: "settings",
      hasSubmenu: true,
      submenu: [
        {
          id: "local-player-view-all-settings",
          icon: null,
          label: "Player dashboard configuration",
          section: "local-player-view",
          hasSubmenu: false,
        },
      ],
    },
    {
      id: "dice-settings",
      icon: <Dices />,
      label: "Dice settings",
      keywords: ["roll", "3d", "speed", "fast", "result card", "toast"],
      section: "settings",
      hasSubmenu: true,
      submenu: [
        {
          id: "dice-all-settings",
          icon: null,
          label: "Roll display",
          section: "dice",
          hasSubmenu: false,
        },
      ],
    },
    {
      id: "experimental-features",
      icon: <FlaskConical />,
      label: "Experimental features",
      keywords: ["beta", "feature", "dynamic lighting", "walls", "lights", "vision"],
      section: "settings",
      hasSubmenu: true,
      submenu: [
        {
          id: "experimental-all-features",
          icon: null,
          label: "Dynamic lighting",
          section: "experimental",
          hasSubmenu: false,
        },
      ],
    },
    ...(onCustomizeToolbar ? [customizeToolbarCommand(() => onCustomizeToolbar(choosingByKeyboard.current), onClose)] : []),
  ];

  // Derive rows from current state so open-menu toggles stay in sync.
  const showingSubmenu = !!activeSubmenu && submenuOptions.length > 0;
  const filteredOptions = (showingSubmenu ? submenuOptions : commandOptions).filter((option) =>
    [option.label, ...(option.keywords ?? [])].some(text => text.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (showingSubmenu || activeTab === "all" || option.section === activeTab)
  );

  // Tab order for forward and backward keyboard cycling
  const tabs = [
    { id: "all", label: "All" },
    { id: "tools", label: "Tools" },
    { id: "mode", label: "Mode" },
    { id: "settings", label: "Settings" },
  ];

  // Obsidian sets `contain: strict` on `.workspace-leaf`, which makes the leaf the
  // containing block of our fixed overlay. Viewport coordinates from the toolbar are
  // therefore converted into the overlay's frame before being applied.
  const updatePosition = useCallback((isInitial: boolean = false): void => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const frame = overlay.getBoundingClientRect();
    const toolbar = toolbarRef?.current;

    if (toolbar) {
      setPosition(placePalette(toolbar.getBoundingClientRect(), frame));
    } else {
      setPosition({
        width: DEFAULT_PALETTE_WIDTH,
        left: (frame.width - DEFAULT_PALETTE_WIDTH) / 2,
        bottom: 100,
      });
    }

    if (isInitial) {
      // Small delay to ensure the position is set before enabling transitions
      window.setTimeout(() => {
        setHasCalculatedInitialPosition(true);
      }, 50); // Allow one frame for position to be applied
    }
  }, [toolbarRef]);

  // Measure before the first paint so the palette never flashes at a stale spot
  // The position is kept after closing so the palette leaves from where it was.
  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition(true);
    } else {
      setHasCalculatedInitialPosition(false);
    }
  }, [isOpen, updatePosition]);

  // Reset search and tab when opening
  useEffect(() => {
    if (!isOpen) return;
    setSearchQuery("");
    setActiveTab("all");
    setActiveSubmenu(null);
    setSubmenuOptions([]);
    setIsTemporarilyHidden(false);
    if (filteredOptions.length > 0) {
      setFocusedOptionIndex(0);
    }
  }, [isOpen]);

  // React to grid alignment open/close via store
  const isGridAlignmentOpen = useAtlasStore(s => s.isGridAlignmentOpen);
  useEffect(() => {
    if (isGridAlignmentOpen && isOpen && activeSubmenu === 'grid-settings') {
      setIsTemporarilyHidden(true);
    } else if (!isGridAlignmentOpen) {
      setIsTemporarilyHidden(false);
    }
  }, [isGridAlignmentOpen, isOpen, activeSubmenu]);

  // Track previous values to detect what changed
  const prevActiveTabRef = useRef(activeTab);

  // Preserve keyboard focus when a toggle changes; reset it when filtering.
  useEffect(() => {
    const tabChanged = prevActiveTabRef.current !== activeTab;
    prevActiveTabRef.current = activeTab;

    if (filteredOptions.length === 0 || searchQuery || (!showingSubmenu && tabChanged)) {
      setFocusedOptionIndex(filteredOptions.length > 0 ? 0 : -1);
    }
  }, [searchQuery, activeTab, activeSubmenu, submenuOptions, showingSubmenu, filteredOptions.length]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isTemporarilyHidden) {
      const focusInput = (): void => {
        if (inputRef.current) {
          inputRef.current.focus();
          // Retry focus if it didn't take (e.g. animation timing)
          window.setTimeout(() => {
            if (document.activeElement !== inputRef.current && inputRef.current) {
              inputRef.current.focus();
            }
          }, 10);
        }
      };

      // Try multiple approaches to ensure focus
      // Immediate attempt
      focusInput();

      // RAF attempt
      window.requestAnimationFrame(() => {
        focusInput();
      });

      // Delayed attempt as backup
      const timeoutId = window.setTimeout(() => {
        focusInput();
      }, 50);

      return () => {
        window.clearTimeout(timeoutId);
      };
    }
  }, [isOpen, isTemporarilyHidden]);

  const clearSearch = (): void => {
    setSearchQuery("");
    setActiveTab("all");
    inputRef.current?.focus();
  };

  // Handle entering submenu
  const enterSubmenu = (option: CommandOption): void => {
    if (option.hasSubmenu && option.submenu) {
      setActiveSubmenu(option.id);
      setSubmenuOptions(option.submenu);
      setSearchQuery("");
      setFocusedOptionIndex(0);
    }
  };

  // Handle exiting submenu
  const exitSubmenu = (): void => {
    setActiveSubmenu(null);
    setSubmenuOptions([]);
    setSearchQuery("");
    setFocusedOptionIndex(0);
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!isOpen || document.querySelector('.atlas-onboarding-overlay')) return;
      // Keys pressed in a dialog or context menu opened from a page belong to it.
      if ((e.target as Element | null)?.closest?.('.atlas-text-dialog-backdrop, .atlas-ctx-menu')) return;
      if (!isShortcutScopeActive(containerRef.current, view?.viewId)) return;

      // In settings modes, only handle Escape and Cmd+K for closing
      if (isSettingsPanelId(activeSubmenu)) {
        if (e.key === "Escape" || (e.metaKey && e.key === "k")) {
          e.preventDefault();
          exitSubmenu();
        }
        return; // No other keyboard navigation in settings modes
      }

      // Handle Cmd+K to close the command palette
      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        onClose();
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          if (activeSubmenu) {
            exitSubmenu();
          } else if (searchQuery) {
            clearSearch();
          } else {
            onClose();
          }
          break;
        case "ArrowLeft":
          if (activeSubmenu) {
            e.preventDefault();
            exitSubmenu();
          }
          break;
        case "ArrowRight":
          if (focusedOptionIndex >= 0 && focusedOptionIndex < filteredOptions.length) {
            const option = filteredOptions[focusedOptionIndex]!;
            if (option.hasSubmenu) {
              e.preventDefault();
              enterSubmenu(option);
            }
          }
          break;
        case "Tab":
          e.preventDefault();
          setLastInteractionType('keyboard');
          setActiveTab((prev) => {
            const index = tabs.findIndex(tab => tab.id === prev);
            const direction = e.shiftKey ? -1 : 1;
            return tabs[(index + direction + tabs.length) % tabs.length]!.id;
          });
          break;
        case "ArrowDown":
          e.preventDefault();
          setLastInteractionType('keyboard');
          setFocusedOptionIndex((prev) =>
            prev >= filteredOptions.length - 1 ? 0 : prev + 1
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setLastInteractionType('keyboard');
          setFocusedOptionIndex((prev) =>
            prev <= 0 ? filteredOptions.length - 1 : prev - 1
          );
          break;
        case "Enter":
          if (focusedOptionIndex >= 0 && focusedOptionIndex < filteredOptions.length) {
            const option = filteredOptions[focusedOptionIndex]!;
            if (option.hasSubmenu) {
              enterSubmenu(option);
            } else if (option.action) {
              choosingByKeyboard.current = true;
              try {
                option.action();
              } finally {
                choosingByKeyboard.current = false;
              }
            }
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, filteredOptions, focusedOptionIndex, searchQuery, tabs]);

  // Scroll focused option into view
  useEffect(() => {
    if (focusedOptionIndex >= 0 && optionsContainerRef.current) {
      const options = optionsContainerRef.current.querySelectorAll(".atlas-command-item");
      if (options[focusedOptionIndex]) {
        options[focusedOptionIndex].scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
    }
  }, [focusedOptionIndex]);

  // Close on click outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent): void => {
      // Don't handle outside clicks when temporarily hidden
      if (isTemporarilyHidden) {
        return;
      }

      // Add a small delay to allow dropdown menus to properly handle their events first
      window.setTimeout(() => {
        const target = e.target as Element;
        if (target?.closest?.('.atlas-onboarding-overlay')) return;
        // Dialogs opened from a page (naming or deleting a snapshot) sit outside the palette.
        if (target?.closest?.('.atlas-text-dialog-backdrop')) return;

        // Don't close if clicking on Obsidian menu elements
        if (target?.closest?.('.menu') ||
            target?.closest?.('.obsidian-menu') ||
            target?.closest?.('[class*="menu"]') ||
            target?.classList?.contains('menu-item') ||
            target?.classList?.contains('clickable-icon') ||
            // Check if target is within any dropdown that might be open
            target?.closest?.('.atlas-obsidian-menu-dropdown')) {
          return;
        }

        // Also don't close if we're in grid settings and clicking on grid setting controls
        if (activeSubmenu === 'grid-settings') {
          // Allow interaction with grid settings without closing
          if (target?.closest?.('.atlas-command-palette-grid-settings') ||
              target?.closest?.('[role="slider"]') ||
              target?.closest?.('.atlas-command-palette-custom-content')) {
            return;
          }
        }

        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          if (toolbarRef?.current && !toolbarRef.current.contains(e.target as Node)) {
            onClose();
          }
        }
      }, 10); // Small delay to allow menu events to complete
    };

    if (isOpen && !isTemporarilyHidden) {
      document.addEventListener("mousedown", handleMouseDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isOpen, isTemporarilyHidden, onClose, toolbarRef, activeSubmenu]);

  // Update position on resize
  useEffect(() => {
    if (!isOpen || isTemporarilyHidden) return;

    const handleResize = (): void => updatePosition();
    const handleScroll = (): void => updatePosition();

    // Only call updatePosition if we haven't calculated initial position yet
    if (!hasCalculatedInitialPosition) {
      updatePosition();
    }

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll);

    const positionInterval = window.setInterval(updatePosition, 200);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll);
      window.clearInterval(positionInterval);
    };
  }, [isOpen, isTemporarilyHidden, toolbarRef, hasCalculatedInitialPosition, updatePosition]);

  // Add mouse move handler to detect when user switches to mouse
  const handleMouseMove = useCallback((): void => {
    if (lastInteractionType !== 'mouse') {
      setLastInteractionType('mouse');
    }
  }, [lastInteractionType]);

  const activePanel: SettingsPanelId | null = isSettingsPanelId(activeSubmenu) ? activeSubmenu : null;

  const sections = [
    { id: 'tools', title: 'Tools' },
    { id: 'mode', title: 'Mode' },
    { id: 'settings', title: 'Settings' },
  ].map((section) => ({
    ...section,
    options: filteredOptions.filter((option) => option.section === section.id),
  }));

  // Render command item wrapper that handles submenu clicks
  const renderCommandItem = (option: CommandOption): React.ReactElement => {
    // Find the actual index of this option in filteredOptions
    const globalIndex = filteredOptions.findIndex(opt => opt.id === option.id);
    return (
      <div
        key={option.id}
        onClick={() => option.hasSubmenu && enterSubmenu(option)}
      >
        <CommandItem
          option={option}
          isFocused={focusedOptionIndex === globalIndex}
          onMouseEnter={() => setFocusedOptionIndex(globalIndex)}
        />
      </div>
    );
  };

  const renderSettingsPanel = (panel: SettingsPanelId): React.ReactElement => {
    switch (panel) {
      case 'scene-snapshots':
        return <SceneSnapshotsPanel onRestore={onClose} />;
      case 'grid-settings':
        return (
          <GridSettingsPanel
            view={view}
            localOpacity={localOpacity}
            setLocalOpacity={setLocalOpacity}
            localLineWidth={localLineWidth}
            setLocalLineWidth={setLocalLineWidth}
            localGridVisible={localGridVisible}
            setLocalGridVisible={setLocalGridVisible}
            localSnapToGrid={localSnapToGrid}
            setLocalSnapToGrid={setLocalSnapToGrid}
            debouncedOpacityUpdate={debouncedOpacityUpdate}
            debouncedLineWidthUpdate={debouncedLineWidthUpdate}
          />
        );
      case 'token-settings':
        return <TokenSettingsPanel view={view} />;
      case 'widget-settings':
        return (
          <WidgetSettingsPanel
            widgetSettings={widgetSettings}
            setWidgetSettings={setWidgetSettings}
            updateWidget={updateWidget}
            addWidget={addWidget}
            removeWidget={removeWidget}
            sortedWidgets={sortedWidgets}
            initiative={initiative}
            setInitiativeConfig={setInitiativeConfig}
            initiativeTrackerOpen={initiativeTrackerOpen}
            setInitiativeTrackerOpen={setInitiativeTrackerOpen}
          />
        );
      case 'local-player-view-settings':
        return <LocalPlayerViewSettingsPanel />;
      case 'dice-settings':
        return <DiceSettingsPanel />;
      case 'experimental-features':
        return <ExperimentalFeaturesPanel />;
    }
  };

  // The anchor places the palette and slides between list and panel; the
  // window inside carries the open / close animation, and the container sizes it.
  const anchorStyle: React.CSSProperties = !position
    ? {}
    : activePanel
      ? { left: '50%', transform: 'translateX(-50%)', bottom: `${position.bottom}px`, '--atlas-palette-bottom': `${position.bottom}px` } as React.CSSProperties
      : { left: `${position.left}px`, transform: 'none', bottom: `${position.bottom}px`, '--atlas-palette-bottom': `${position.bottom}px` } as React.CSSProperties;
  const containerStyle = position && !activePanel ? { width: `${position.width}px` } : {};

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="command-palette"
            ref={overlayRef}
            className="atlas-vtt-plugin atlas-vtt-root atlas-command-palette-overlay"
            variants={overlayVariants}
            initial="closed"
            animate="open"
            exit="closed"
          >
            {!isTemporarilyHidden && position && <Tutorial id="palette" steps={[
              { title: 'Find a command', body: 'Search for a tool or setting here. Use the tabs to narrow the list, then arrow keys and Enter to choose.', selector: '.atlas-command-palette-search' },
              { title: 'Make the map your own', body: `Adjust your grid, tokens, and widgets from Settings. Back on the map, press ${hotkeyLabel('help')} to see shortcuts. Change them in Obsidian Settings → Atlas VTT → Map hotkeys.`, selector: '.atlas-command-palette-tabs' },
            ]} />}
            <div className="atlas-command-palette-backdrop" onClick={onClose} />

            <div
              className={cn(
                'atlas-command-palette-anchor',
                !hasCalculatedInitialPosition && 'atlas-no-transition',
                (isTemporarilyHidden || !position) && 'atlas-command-palette-anchor--hidden',
              )}
              style={anchorStyle}
            >
              <motion.div className="atlas-command-palette-window" variants={paletteVariants}>
                <div
                  ref={containerRef}
                  className={cn(
                    'atlas-command-palette-container',
                    activePanel && 'atlas-command-palette-container--expanded',
                    activePanel && `atlas-command-palette-container--${activePanel}`,
                  )}
                  style={containerStyle}
                >
                  {activePanel ? (
                    <SettingsPanelHeader
                      icon={SETTINGS_PANEL_META[activePanel].icon}
                      title={SETTINGS_PANEL_META[activePanel].title}
                      onBack={exitSubmenu}
                      actions={
                        activePanel === 'grid-settings' ? (
                          <Button variant="secondary" size="sm" onClick={() => store.getState().setGridAlignmentOpen(true)}>
                            <Move />
                            Enter Alignment Mode
                          </Button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <>
                      <div className="atlas-command-palette-search">
                        <div className="atlas-command-palette-search-inner">
                          <Search className="atlas-command-palette-search-icon" />
                          <input
                            ref={inputRef}
                            type="text"
                            placeholder="Search commands..."
                            className="atlas-command-palette-input"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                            tabIndex={0}
                            autoComplete="off"
                            spellCheck={false}
                          />
                          {searchQuery && (
                            <CloseButton placement="inline" onClick={clearSearch} aria-label="Clear search" />
                          )}
                        </div>
                      </div>

                      <div className="atlas-command-palette-tabs">
                        {tabs.map((tab) => (
                          <Button
                            key={tab.id}
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'atlas-command-palette-tab',
                              activeTab === tab.id && 'atlas-active',
                            )}
                            onClick={() => setActiveTab(tab.id)}
                          >
                            <span className="atlas-command-palette-tab-label">{tab.label}</span>
                          </Button>
                        ))}
                      </div>
                    </>
                  )}

                  <div
                    ref={optionsContainerRef}
                    className="atlas-command-palette-options"
                    onMouseMove={handleMouseMove}
                  >
                    {activePanel ? (
                      renderSettingsPanel(activePanel)
                    ) : (
                      <div className="atlas-command-palette-options-inner">
                        {sections.map((section) =>
                          section.options.length > 0 ? (
                            <div key={section.id} className="atlas-command-palette-section">
                              <div className="atlas-command-palette-section-header">{section.title}</div>
                              {section.options.map((option) => renderCommandItem(option))}
                            </div>
                          ) : null,
                        )}

                        {filteredOptions.length === 0 && (
                          <div className="atlas-command-palette-empty">
                            <div className="atlas-command-palette-empty-text">No results found</div>
                            <div className="atlas-command-palette-empty-hint">Try a different search term</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {!activePanel && (
                    <div className="atlas-command-palette-footer">
                      <div className="atlas-command-palette-footer-left">
                        <div className="atlas-command-palette-footer-item">
                          <kbd className="atlas-command-palette-kbd">Tab / Shift+Tab</kbd>
                          <span>to switch tabs</span>
                        </div>
                        <div className="atlas-command-palette-footer-item">
                          <span className="atlas-command-palette-footer-arrows">
                            <ArrowUp className="atlas-command-palette-arrow" />
                            <ArrowUp className="atlas-command-palette-arrow atlas-down" />
                          </span>
                          <span>to navigate</span>
                        </div>
                        <div className="atlas-command-palette-footer-item">
                          <kbd className="atlas-command-palette-kbd">↵</kbd>
                          <span>to select</span>
                        </div>
                      </div>
                      <div className="atlas-command-palette-footer-right">
                        <kbd className="atlas-command-palette-kbd">Esc</kbd>
                        <span>{searchQuery ? "to clear" : "to close"}</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
