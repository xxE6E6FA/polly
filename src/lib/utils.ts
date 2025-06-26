import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | number): string {
  const d = typeof date === "number" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 7) {
    return `${days} days ago`;
  }
  return d.toLocaleDateString();
}

export function resizeGoogleImageUrl(url: string, size: number): string {
  if (!url || typeof url !== "string") {
    return url;
  }

  // Check if it's a Google image URL
  if (!url.includes("googleusercontent.com") && !url.includes("ggpht.com")) {
    return url;
  }

  // Replace existing size parameter or add one if it doesn't exist
  if (url.includes("=s")) {
    // Replace existing size parameter (e.g., =s300-c or =s96-c)
    return url.replace(/=s\d+(-c)?$/, `=s${size}-c`);
  }
  if (url.includes("=")) {
    // If there's an equals sign but no size parameter, replace everything after the last =
    return url.replace(/=[^=]*$/, `=s${size}-c`);
  }
  // If no equals sign, append the size parameter
  return `${url}=s${size}-c`;
}
