import * as FileSystem from "expo-file-system/legacy";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ref, uploadBytes, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../src/config/firebase";
import { STORAGE_FOLDERS, StorageFolder } from "../constants/storageFolders";
import { generateUniqueFileName, getFileExtension, isValidImageExtension } from "../utils/fileHelpers";
import { compressImageBeforeUpload } from "../utils/imageCompression";

const OFFLINE_QUEUE_KEY = "@firebase_storage_offline_queue";

export interface StorageUploadOptions {
  uri: string;
  folder: StorageFolder;
  entityId?: string; // e.g., customerId, productId, etc.
  fileName?: string;
  userId?: string;
  onProgress?: (progress: number) => void;
  skipCompression?: boolean;
}

export interface StorageUploadResult {
  success: boolean;
  publicUrl: string | null;
  storagePath: string | null;
  fileName: string | null;
  folder: string;
  error?: string;
  isOfflineQueued?: boolean;
}

/**
 * Upload an image to Firebase Storage inside standard folder structure
 */
export async function uploadImage(options: StorageUploadOptions): Promise<StorageUploadResult> {
  const { uri, folder, entityId, onProgress, skipCompression = false } = options;

  try {
    // Check extension
    const ext = getFileExtension(uri);
    if (!isValidImageExtension(ext)) {
      return {
        success: false,
        publicUrl: null,
        storagePath: null,
        fileName: null,
        folder,
        error: `Unsupported image format (${ext}). Allowed: jpg, jpeg, png, webp`,
      };
    }

    // Check Network connection
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      await saveToOfflineQueue(options);
      return {
        success: false,
        publicUrl: null,
        storagePath: null,
        fileName: null,
        folder,
        error: "Internet is unavailable. Image upload saved locally to offline queue.",
        isOfflineQueued: true,
      };
    }

    if (onProgress) onProgress(10);

    // 1. Compress image
    let compressedUri = uri;
    let base64Data: string | undefined = undefined;

    if (!skipCompression) {
      const comp = await compressImageBeforeUpload(uri);
      compressedUri = comp.uri;
      base64Data = comp.base64;
    }

    if (onProgress) onProgress(40);

    // Prepare storage path
    const uniqueName = options.fileName || generateUniqueFileName(ext);
    const subPath = entityId ? `${entityId}/${uniqueName}` : uniqueName;
    const fullPath = `${folder}/${subPath}`;
    const storageRef = ref(storage, fullPath);
    const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;

    if (onProgress) onProgress(60);

    // 2. Upload to Firebase Storage using uploadString or fetch Blob
    if (base64Data) {
      await uploadString(storageRef, base64Data, "base64", { contentType });
    } else {
      const response = await fetch(compressedUri);
      const blob = await response.blob();
      await uploadBytes(storageRef, blob, { contentType });
      if (typeof (blob as any)?.close === "function") {
        (blob as any).close();
      }
    }

    if (onProgress) onProgress(90);

    // 3. Get Download URL
    const publicUrl = await getDownloadURL(storageRef);

    if (onProgress) onProgress(100);

    return {
      success: true,
      publicUrl,
      storagePath: fullPath,
      fileName: uniqueName,
      folder,
    };
  } catch (error: any) {
    console.error("uploadImage error:", error);
    return {
      success: false,
      publicUrl: null,
      storagePath: null,
      fileName: null,
      folder,
      error: error?.message || "An unexpected error occurred while uploading image.",
    };
  }
}

/**
 * Delete image from Firebase Storage
 */
export async function deleteImage(storagePath: string): Promise<boolean> {
  try {
    if (!storagePath) return false;

    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef);

    return true;
  } catch (err: any) {
    // If the file doesn't exist, treat as success
    if (err?.code === "storage/object-not-found") {
      return true;
    }
    console.error("deleteImage error:", err);
    return false;
  }
}

/**
 * Update an existing image (replaces old file)
 */
export async function updateImage(
  oldStoragePath: string | null,
  newUri: string,
  options: StorageUploadOptions
): Promise<StorageUploadResult> {
  if (oldStoragePath) {
    await deleteImage(oldStoragePath);
  }
  return await uploadImage(newUri ? { ...options, uri: newUri } : options);
}

/**
 * Get public URL for a stored image.
 * For Firebase Storage, previously fetched download URLs are permanent tokens.
 * If a full URL is passed, return it as-is.
 * Otherwise, fetch a fresh download URL.
 */
export async function getPublicUrl(storagePath: string): Promise<string> {
  if (!storagePath) return "";
  if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
    return storagePath;
  }
  try {
    const storageRef = ref(storage, storagePath);
    return await getDownloadURL(storageRef);
  } catch (err) {
    console.error("getPublicUrl error:", err);
    return "";
  }
}

/**
 * Download an image from Firebase Storage to local file system
 */
export async function downloadImage(storagePath: string, localDestinationUri?: string): Promise<string> {
  try {
    // Get the download URL and use FileSystem to download
    const url = await getPublicUrl(storagePath);
    if (!url) throw new Error("Failed to get download URL.");

    const filename = storagePath.split("/").pop() || "downloaded.jpg";
    const cacheDir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory || "";
    const destPath = localDestinationUri || `${cacheDir}${filename}`;

    const downloadResult = await FileSystem.downloadAsync(url, destPath);
    return downloadResult.uri;
  } catch (err) {
    console.error("downloadImage error:", err);
    // Fallback: return the download URL so the caller can use it directly
    try {
      return await getPublicUrl(storagePath);
    } catch {
      return "";
    }
  }
}

/**
 * Offline Queueing Mechanisms
 */
async function saveToOfflineQueue(options: StorageUploadOptions): Promise<void> {
  try {
    const existingStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    const queue = existingStr ? JSON.parse(existingStr) : [];
    queue.push({
      options,
      timestamp: Date.now(),
    });
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error("Failed to save upload request to offline queue:", err);
  }
}

/**
 * Automatically process offline queue when internet returns
 */
export async function processOfflineQueue(): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;

  try {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) return { processed: 0, failed: 0 };

    const existingStr = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!existingStr) return { processed: 0, failed: 0 };

    const queue: Array<{ options: StorageUploadOptions; timestamp: number }> = JSON.parse(existingStr);
    if (queue.length === 0) return { processed: 0, failed: 0 };

    const remainingQueue = [];

    for (const item of queue) {
      const res = await uploadImage(item.options);
      if (res.success) {
        processed++;
      } else {
        failed++;
        remainingQueue.push(item);
      }
    }

    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
  } catch (err) {
    console.error("processOfflineQueue error:", err);
  }

  return { processed, failed };
}

// Auto listener for network recovery to automatically retry offline uploads
NetInfo.addEventListener((state) => {
  if (state.isConnected) {
    processOfflineQueue().then((res) => {
      if (res.processed > 0) {
        console.log(`Successfully synced ${res.processed} offline image uploads to Firebase Storage.`);
      }
    });
  }
});
