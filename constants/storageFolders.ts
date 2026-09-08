/**
 * Standard Storage Folder Constants
 */

export const STORAGE_FOLDERS = {
  CUSTOMERS: "customers",
  PRODUCTS: "products",
  BILLS: "bills",
  DELIVERY: "delivery",
  PROFILE: "profile",
  BACKUP: "backup",
} as const;

export type StorageFolder = (typeof STORAGE_FOLDERS)[keyof typeof STORAGE_FOLDERS];

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
export const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
