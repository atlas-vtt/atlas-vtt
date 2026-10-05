import React, { useEffect, useRef } from "react"
import { Button } from "./button"
import { ChevronDown } from "lucide-react"
import { cn } from "../../../../utils/cn"
import { useKeepInView } from "./useKeepInView"

// Extend HTMLAttributes for the root div element to allow standard HTML props like onClick, className etc.
interface DropdownMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Whether the dropdown is open */
  isOpen: boolean
  /** Toggle function for opening/closing the dropdown. Not used if showTrigger is false. */
  onToggle: () => void
  /** Accessible label for the dropdown trigger. Not used if showTrigger is false. */
  label: string
  /** Ref forwarded to the trigger button */
  triggerRef?: React.Ref<HTMLButtonElement>
  /** Additional class names for the trigger button */
  chevronClassName?: string
  /** Inline styles for the trigger button */
  chevronStyle?: React.CSSProperties
  /** Class names for the dropdown menu content div */
  menuClassName?: string
  /** Inline styles for the dropdown menu content div */
  menuStyle?: React.CSSProperties
  // children is inherited from React.HTMLAttributes<HTMLDivElement> which includes React.ReactNode
  // children: React.ReactNode; 
  /** Position of the dropdown menu - 'top' or 'bottom'. Relevant if showTrigger is true. */
  position?: 'top' | 'bottom'
  /** Horizontal alignment - 'left', 'center', or 'right'. Relevant if showTrigger is true. */
  align?: 'left' | 'center' | 'right'
  /** If false, the default trigger button is not rendered. Defaults to true. */
  showTrigger?: boolean
  /** Optional custom trigger element. Rendered instead of the default chevron button. */
  triggerButton?: React.ReactNode
  /** Styles for the outermost container div. Useful when showTrigger is false for positioning. Renamed from containerStyle for clarity with HTML style prop. */
  menuContainerStyle?: React.CSSProperties // Changed from containerStyle to avoid conflict with HTMLAttributes.style
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  isOpen,
  onToggle, // Should ideally be optional if showTrigger can be false
  label,    // Should ideally be optional if showTrigger can be false
  triggerRef,
  chevronClassName = "",
  chevronStyle,
  menuClassName = "",
  menuStyle,
  children,
  position = 'bottom',
  align = 'left',
  showTrigger = true,
  triggerButton,
  menuContainerStyle,
  className, // from HTMLAttributes
  style,     // from HTMLAttributes, merged with menuContainerStyle if needed or prefer menuContainerStyle
  ...rest    // other HTMLAttributes like onClick
}): React.ReactElement => {
  // If menuContainerStyle is provided, it takes precedence for the main container.
  // The 'style' prop from HTMLAttributes could also be used or merged.
  const containerCombinedStyle = menuContainerStyle || style;
  
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownContentRef = useRef<HTMLDivElement>(null);
  const keepInView = useKeepInView(dropdownContentRef, isOpen, position);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent): void => {
      const target = event.target as Node | null;
      if (!target) return;
      if (containerRef.current?.contains(target)) return;
      onToggle();
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onToggle();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onToggle]);

  return (
    <div
      ref={containerRef}
      className={`atlas-dropdown-menu ${className || ''}`.trim()}
      style={containerCombinedStyle}
      {...rest} // Spread onClick and other HTML attributes here
    >
      {showTrigger && (
        triggerButton ? (
          <span onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}>
            {triggerButton}
          </span>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            ref={triggerRef}
            className={`atlas-dropdown-trigger btn--toolbar ${isOpen ? 'atlas-is-active' : ''} ${chevronClassName}`}
            style={chevronStyle}
            onClick={onToggle} // This onToggle is from props, for the trigger
          >
            <ChevronDown style={{ height: '1rem', width: '1rem' }} />
            <span className="sr-only">{label}</span>
          </Button>
        )
      )}

      {isOpen && (
        <div
          ref={dropdownContentRef}
          className={cn(
            "atlas-dropdown-content",
            `atlas-dropdown-content--${position}`,
            `atlas-dropdown-content--${align}`,
            keepInView.capped && "atlas-keep-in-view--capped",
            menuClassName,
          )}
          style={{ ...keepInView.style, ...menuStyle }}
        >
          {children}
        </div>
      )}
    </div>
  );
} 
