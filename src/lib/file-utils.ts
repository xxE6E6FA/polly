// Shared file processing utilities
import { FILE_LIMITS } from "@shared/file-constants";

/**
 * Decode a base64 string into a Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) {
    view[i] = raw.charCodeAt(i);
  }
  return view;
}

/**
 * Check if a file is HEIC/HEIF format
 */
export function isHeicFile(file: File): boolean {
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

/**
 * Scale dimensions to fit within a max size while preserving aspect ratio.
 */
function scaleDimensions(
  width: number,
  height: number,
  maxSize: number
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }
  if (width > height) {
    return { width: maxSize, height: Math.round((height * maxSize) / width) };
  }
  return { width: Math.round((width * maxSize) / height), height: maxSize };
}

export async function compressImage(
  file: File,
  maxDimension = FILE_LIMITS.MAX_DIMENSION,
  quality = FILE_LIMITS.IMAGE_QUALITY,
  format: "image/webp" | "image/jpeg" = "image/webp"
): Promise<{
  base64: string;
  mimeType: string;
  width: number;
  height: number;
}> {
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
        const scaled = scaleDimensions(img.width, img.height, maxDimension);

        canvas.width = scaled.width;
        canvas.height = scaled.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Use better image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, scaled.width, scaled.height);

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
                resolve({
                  base64,
                  mimeType: format,
                  width: scaled.width,
                  height: scaled.height,
                });
              };
              reader.onerror = () =>
                reject(new Error("Failed to read converted image"));
              reader.readAsDataURL(blob);
            } else {
              reject(new Error("Failed to convert image"));
            }
          },
          format,
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

function resolveObjectURLDeps(deps: ThumbnailDeps) {
  return {
    toObjectURL: deps.createObjectURL ?? ((f: File) => URL.createObjectURL(f)),
    revokeObjectURL:
      deps.revokeObjectURL ??
      ((url: string) => {
        if (typeof URL.revokeObjectURL === "function") {
          URL.revokeObjectURL(url);
        }
      }),
  };
}

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
): Promise<{ thumbnail: string; width: number; height: number }> {
  // Convert HEIC/HEIF to JPEG first (browsers can't decode HEIC natively)
  let processedFile = file;
  if (isHeicFile(file)) {
    processedFile = await convertHeicToJpeg(file);
  }

  return new Promise((resolve, reject) => {
    const createCanvas =
      deps.createCanvas ?? (() => document.createElement("canvas"));
    const createImage = deps.createImage ?? (() => new Image());
    const { toObjectURL, revokeObjectURL } = resolveObjectURLDeps(deps);

    const canvas = createCanvas();
    const img = createImage();

    img.onload = () => {
      const scaled = scaleDimensions(img.width, img.height, maxSize);

      canvas.width = scaled.width;
      canvas.height = scaled.height;

      const ctx = getCanvas2DContext(canvas, objectUrl, revokeObjectURL);

      ctx.drawImage(img, 0, 0, scaled.width, scaled.height);

      // Convert to base64 with better quality
      const thumbnail = canvas.toDataURL("image/jpeg", 0.9);
      revokeObjectURL(objectUrl);
      resolve({ thumbnail, width: img.width, height: img.height });
    };

    img.onerror = error => {
      revokeObjectURL(objectUrl);
      reject(error);
    };
    const objectUrl = toObjectURL(processedFile);
    img.src = objectUrl;
  });
}

const VIDEO_THUMBNAIL_TIMEOUT_MS = 10_000;

export function generateVideoThumbnail(
  file: File,
  maxSize = FILE_LIMITS.THUMBNAIL_SIZE,
  deps: ThumbnailDeps = {}
): Promise<{ thumbnail: string; width: number; height: number }> {
  const createCanvas =
    deps.createCanvas ?? (() => document.createElement("canvas"));
  const { toObjectURL, revokeObjectURL } = resolveObjectURLDeps(deps);

  const objectUrl = toObjectURL(file);

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    // Timeout to ensure the Promise always settles
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Video thumbnail generation timed out"));
    }, VIDEO_THUMBNAIL_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      revokeObjectURL(objectUrl);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
    }

    video.onloadedmetadata = () => {
      // Seek to 0.1s for a representative frame
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      try {
        const scaled = scaleDimensions(
          video.videoWidth,
          video.videoHeight,
          maxSize
        );

        const canvas = createCanvas();
        canvas.width = scaled.width;
        canvas.height = scaled.height;

        const ctx = getCanvas2DContext(canvas, objectUrl, revokeObjectURL);
        ctx.drawImage(video, 0, 0, scaled.width, scaled.height);

        const thumbnail = canvas.toDataURL("image/jpeg", 0.9);
        cleanup();
        resolve({
          thumbnail,
          width: video.videoWidth,
          height: video.videoHeight,
        });
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to load video for thumbnail generation"));
    };

    video.src = objectUrl;
    video.load();
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
