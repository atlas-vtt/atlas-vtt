export type ButtonVariant =
  | "default"
  | "destructive"
  | "outline"
  | "secondary"
  | "ghost"
  | "link"
  | "toolbar";

export type ButtonSize = "default" | "sm" | "lg" | "icon";

/** The classes of Atlas' button (`btn btn--<variant> btn--<size>`), shared by `Button` and its DOM twin `createButton`. */
export function buttonClasses(variant: ButtonVariant = "default", size: ButtonSize = "default"): string[] {
  return size === "default" ? ["btn", `btn--${variant}`] : ["btn", `btn--${variant}`, `btn--${size}`];
}
