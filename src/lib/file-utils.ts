// Shared file processing utilities
import { FILE_LIMITS } from "@shared/file-constants";

/**
 * Check if a file is HEIC/HEIF format
 */
function isHeicFile(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

/**
 * Convert HEIC/HEIF to JPEG for browser compatibility
 * Dynamically imports heic2any to avoid bundling it in the main chunk
 */
async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import("heic2any")).default;

  const blob = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.92,
  });

  // heic2any can return an array for multi-image HEIC files
  const resultBlob = Array.isArray(blob) ? blob[0] : blob;

  if (!resultBlob) {
    throw new Error("Failed to convert HEIC image");
  }

  return new File(
    [resultBlob],
    file.name.replace(/\.heic$/i, ".jpg").replace(/\.heif$/i, ".jpg"),
    { type: "image/jpeg" }
  );
}

export async function convertImageToWebP(
  file: File,
  maxDimension = FILE_LIMITS.MAX_DIMENSION,
  quality = FILE_LIMITS.IMAGE_QUALITY
): Promise<{ base64: string; mimeType: string }> {
  // Convert HEIC/HEIF to JPEG first (browsers can't decode HEIC natively)
  let processedFile = file;
  if (isHeicFile(file)) {
    processedFile = await convertHeicToJpeg(file);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        // Calculate new dimensions while maintaining aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height * maxDimension) / width;
            width = maxDimension;
          } else {
            width = (width * maxDimension) / height;
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Use better image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to WebP
        canvas.toBlob(
          blob => {
            if (blob) {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(",")[1];
                if (!base64) {
                  reject(new Error("Failed to parse converted image"));
                  return;
                }
                resolve({ base64, mimeType: "image/webp" });
              };
              reader.onerror = () =>
                reject(new Error("Failed to read converted image"));
              reader.readAsDataURL(blob);
            } else {
              reject(new Error("Failed to convert image"));
            }
          },
          "image/webp",
          quality
        );
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(processedFile);
  });
}

type ThumbnailDeps = {
  createCanvas?: () => HTMLCanvasElement;
  createImage?: () => HTMLImageElement;
  createObjectURL?: (file: File) => string;
  revokeObjectURL?: (url: string) => void;
};

export function getCanvas2DContext(
  canvas: HTMLCanvasElement,
  objectUrl: string,
  revokeObjectURL: (url: string) => void
): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof ctx.drawImage !== "function") {
    revokeObjectURL(objectUrl);
    throw new Error("Failed to get canvas context");
  }
  return ctx;
}

export async function generateThumbnail(
  file: File,
  maxSize = FILE_LIMITS.THUMBNAIL_SIZE,
  deps: ThumbnailDeps = {}
): Promise<string> {
  // Convert HEIC/HEIF to JPEG first (browsers can't decode HEIC natively)
  let processedFile = file;
  if (isHeicFile(file)) {
    processedFile = await convertHeicToJpeg(file);
  }

  return new Promise((resolve, reject) => {
    const createCanvas =
      deps.createCanvas ?? (() => document.createElement("canvas"));
    const createImage = deps.createImage ?? (() => new Image());
    const toObjectURL =
      deps.createObjectURL ??
      ((fileToUrl: File) => URL.createObjectURL(fileToUrl));
    const revokeObjectURL =
      deps.revokeObjectURL ??
      ((url: string) => {
        if (typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(url);
        }
      });

    const canvas = createCanvas();
    const img = createImage();

    img.onload = () => {
      // Calculate thumbnail dimensions while maintaining aspect ratio
      let { width, height } = img;
      if (width > height && width > maxSize) {
        height = Math.round((height * maxSize) / width);
        width = maxSize;
      } else if (height > width && height > maxSize) {
        width = Math.round((width * maxSize) / height);
        height = maxSize;
      } else if (width > maxSize) {
        width = maxSize;
        height = maxSize;
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = getCanvas2DContext(canvas, objectUrl, revokeObjectURL);

      // Draw the image on canvas with new dimensions
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to base64 with better quality
      const thumbnail = canvas.toDataURL("image/jpeg", 0.9);
      revokeObjectURL(objectUrl);
      resolve(thumbnail);
    };

    img.onerror = error => {
      revokeObjectURL(objectUrl);
      reject(error);
    };
    const objectUrl = toObjectURL(processedFile);
    img.src = objectUrl;
  });
}

export function readFileAsText(file: File): Promise<string> {
  return file.text();
}

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Failed to parse file contents"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Map file extensions to programming languages for syntax highlighting
export const FILE_EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript/TypeScript
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mjs: "javascript",
  cjs: "javascript",

  // Web
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",

  // Languages
  py: "python",
  java: "java",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  go: "go",
  rs: "rust",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  r: "r",
  lua: "lua",
  perl: "perl",
  pl: "perl",

  // Shell/Config
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  ps1: "powershell",
  bat: "batch",
  cmd: "batch",

  // Data/Config
  json: "json",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",

  // Database
  sql: "sql",

  // Documentation
  md: "markdown",
  mdx: "markdown",
  rst: "restructuredtext",
  tex: "latex",

  // Other
  dockerfile: "dockerfile",
  makefile: "makefile",
  cmake: "cmake",
  gradle: "gradle",

  // Default
  txt: "text",
  log: "text",
};

export function getFileLanguage(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  return FILE_EXTENSION_TO_LANGUAGE[extension] || "text";
}

/**
 * Truncates a filename in the middle, preserving the extension.
 * Example: "very-long-filename.tsx" -> "very-l....tsx"
 */
export function truncateMiddle(filename: string, maxLength = 20): string {
  if (filename.length <= maxLength) {
    return filename;
  }

  const lastDotIndex = filename.lastIndexOf(".");
  const extension = lastDotIndex > -1 ? filename.slice(lastDotIndex) : "";
  const nameWithoutExt =
    lastDotIndex > -1 ? filename.slice(0, lastDotIndex) : filename;

  // Calculate how many characters we can show from the start
  const availableSpace = maxLength - extension.length - 3; // 3 for "..."
  const startChars = Math.max(availableSpace, 5); // Show at least 5 chars from start

  return `${nameWithoutExt.slice(0, startChars)}...${extension}`;
}
