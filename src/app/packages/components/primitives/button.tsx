import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "../../../../utils/cn";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./buttonClasses";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      asChild = false,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const composedClassName = cn(...buttonClasses(variant, size), className);

    return <Comp className={composedClassName} ref={ref} {...props} />;
  }
);

Button.displayName = "Button";

export { Button };
