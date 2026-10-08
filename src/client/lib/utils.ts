import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
// The type scale's --text-* names from styles.css; unknown names would be merged away as text colours.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["caption", "small", "body", "heading", "display"] } } });
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
