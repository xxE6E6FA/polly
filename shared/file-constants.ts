// File processing constants

export const FILE_LIMITS = {
  MAX_SIZE_BYTES: 20 * 1024 * 1024, // 20MB (default for images and text files)
  PDF_MAX_SIZE_BYTES: 50 * 1024 * 1024, // 50MB (larger limit for PDFs)
  MAX_DIMENSION: 1920,
  THUMBNAIL_SIZE: 200, // Increased from 80 to 200 for better quality
  IMAGE_QUALITY: 0.85,
} as const;

export const BATCH_PROCESSING = {
  SIZE: 20,
  TIMEOUT_MS: 75,
  CHECK_INTERVAL_MS: 500,
} as const;

export const SUPPORTED_MIME_TYPES = {
  PDF: "application/pdf",
  TEXT: "text/plain",
  IMAGE_JPEG: "image/jpeg",
  IMAGE_WEBP: "image/webp",
  DEFAULT: "application/octet-stream",
} as const;

export const FILE_EXTENSIONS = {
  TEXT: ["txt", "text", "md", "markdown", "mdx", "rtf", "log", "csv", "tsv"],
  CODE: [
    "js",
    "jsx",
    "ts",
    "tsx",
    "py",
    "java",
    "c",
    "cpp",
    "cs",
    "php",
    "rb",
    "go",
    "rs",
    "swift",
    "html",
    "css",
    "json",
    "xml",
    "yaml",
    "sql",
    "sh",
  ],
  IMAGE: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"],
  PDF: ["pdf"],
} as const;
