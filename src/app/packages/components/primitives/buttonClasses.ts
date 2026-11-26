export type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"
  | "toolbar";

export type ButtonSize = "default" | "sm" | "lg" | "icon";

/** The classes of Atlas' button, shared by the React `Button` and buttons built with the DOM (`createAtlasButton`). */
export function buttonClasses(variant: ButtonVariant = "default", size: ButtonSize = "default"): string[] {
  return size === "default" ? ["btn", `btn--${variant}`] : ["btn", `btn--${variant}`, `btn--${size}`];
}
