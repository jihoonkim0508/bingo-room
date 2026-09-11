import * as React from "react";
import { cn } from "../../lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20", className)} {...props} />
));
Input.displayName = "Input";
