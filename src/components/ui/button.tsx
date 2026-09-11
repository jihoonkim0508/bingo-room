import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default: "bg-violet-500 text-white shadow-lg shadow-violet-500/20 hover:bg-violet-400",
        secondary: "bg-white/10 text-white hover:bg-white/15",
        outline: "border border-white/15 bg-white/[0.03] text-slate-200 hover:bg-white/10",
        ghost: "text-slate-300 hover:bg-white/10 hover:text-white",
        destructive: "bg-rose-500/15 text-rose-200 hover:bg-rose-500/25",
      },
      size: { default: "h-11 px-4", sm: "h-9 rounded-lg px-3 text-xs", lg: "h-13 px-6 text-base", icon: "h-10 w-10" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
));
Button.displayName = "Button";
