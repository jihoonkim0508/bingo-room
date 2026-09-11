import * as React from "react";
import { cn } from "../../lib/utils";

interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function Switch({ checked, onCheckedChange, className, ...props }: SwitchProps) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)} className={cn("relative h-6 w-11 rounded-full bg-white/15 transition-colors", checked && "bg-violet-500", className)} {...props}>
      <span className={cn("absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform", checked && "translate-x-5")} />
    </button>
  );
}
