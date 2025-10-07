import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function dirname(path: string) {
  return path.match(/.*\//);
}

export function basename(path: string) {
  return path.replace(/.*\//, "");
}
