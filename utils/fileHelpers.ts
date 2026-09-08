import { ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES } from "../constants/storageFolders";

/**
 * Generate a unique collision-safe filename using a pseudo-UUID & timestamp
 */
export function generateUniqueFileName(extension: string = "jpg"): string {
  const cleanExt = extension.toLowerCase().replace(".", "");
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 10);
  const uuidPart = `${timestamp}-${randomStr}`;
  return `${uuidPart}.${cleanExt}`;
}

/**
 * Extract extension from uri or filename
 */
export function getFileExtension(uriOrName: string): string {
  const parts = uriOrName.split(".");
  if (parts.length > 1) {
    const ext = parts.pop()?.toLowerCase()?.split("?")[0] || "jpg";
    return ext === "jpeg" ? "jpg" : ext;
  }
  return "jpg";
}

/**
 * Validate image extension
 */
export function isValidImageExtension(extension: string): boolean {
  const clean = extension.toLowerCase().replace(".", "");
  const normalized = clean === "jpeg" ? "jpg" : clean;
  return ALLOWED_EXTENSIONS.includes(normalized);
}

/**
 * Check if file size is within limits (default 5MB)
 */
export function isWithinFileSizeLimit(sizeInBytes?: number, maxBytes: number = MAX_FILE_SIZE_BYTES): boolean {
  if (!sizeInBytes || sizeInBytes <= 0) return true;
  return sizeInBytes <= maxBytes;
}

/**
 * Format bytes into human readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
