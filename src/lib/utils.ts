import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function makeId(prefix = "id") {
  const value = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${value}`;
}

export function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit" }).format(timestamp);
}
