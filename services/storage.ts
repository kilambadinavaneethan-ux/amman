import * as FileSystem from "expo-file-system/legacy";
import NetInfo from "@react-native-community/netinfo";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  uploadString,
  getDownloadURL,
  deleteObject,
  StorageReference,
  UploadTaskSnapshot,
} from "firebase/storage";
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

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Decode a base64 string into Uint8Array without external dependencies.
 */
function base64ToUint8Array(base64: string): Uint8Array | null {
  try {
    const clean = base64.replace(/^data:[^;]+;base64,/, "").replace(/[\r\n\s]/g, "");
    if (!clean) return null;

    if (typeof globalThis.atob === "function") {
      const binary = globalThis.atob(clean);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }

    const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
    const outputLength = Math.floor((clean.length * 3) / 4) - padding;
    const bytes = new Uint8Array(outputLength);
    let byteIndex = 0;

    for (let i = 0; i < clean.length; i += 4) {
      const c1 = BASE64_CHARS.indexOf(clean[i]);
      const c2 = BASE64_CHARS.indexOf(clean[i + 1]);
      const c3 = clean[i + 2] === "=" ? 0 : BASE64_CHARS.indexOf(clean[i + 2]);
      const c4 = clean[i + 3] === "=" ? 0 : BASE64_CHARS.indexOf(clean[i + 3]);
      if (c1 < 0 || c2 < 0 || c3 < 0 || c4 < 0) return null;

      const triplet = (c1 << 18) | (c2 << 12) | (c3 << 6) | c4;
      if (byteIndex < outputLength) bytes[byteIndex++] = (triplet >> 16) & 0xff;
      if (clean[i + 2] !== "=" && byteIndex < outputLength) bytes[byteIndex++] = (triplet >> 8) & 0xff;
      if (clean[i + 3] !== "=" && byteIndex < outputLength) bytes[byteIndex++] = triplet & 0xff;
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Upload binary payload using uploadBytesResumable when supported so onProgress
 * reflects real transfer progress, falling back to uploadBytes otherwise.
 */
async function uploadWithResumableProgress(
  storageRef: StorageReference,
  data: Blob | Uint8Array | ArrayBuffer,
  contentType: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  if (typeof uploadBytesResumable !== "function") {
    await uploadBytes(storageRef, data, { contentType });
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, data, { contentType });
    const unsubscribe = uploadTask.on(
      "state_changed",
      (snapshot: UploadTaskSnapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          const pct = Math.min(
            99,
            Math.max(0, Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100))
          );
          onProgress(pct);
        }
      },
      (err) => {
        unsubscribe();
        reject(err);
      },
      () => {
        unsubscribe();
        resolve();
      }
    );
  });
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

    onProgress?.(0);

    // 1. Compress image
    let compressedUri = uri;
    let base64Data: string | undefined = undefined;

    if (!skipCompression) {
      const comp = await compressImageBeforeUpload(uri);
      compressedUri = comp.uri;
      base64Data = comp.base64;
    }

    // Prepare storage path
    const uniqueName = options.fileName || generateUniqueFileName(ext);
    const subPath = entityId ? `${entityId}/${uniqueName}` : uniqueName;
    const fullPath = `${folder}/${subPath}`;
    const storageRef = ref(storage, fullPath);
    const contentType = `image/${ext === "jpg" ? "jpeg" : ext}`;

    // 2. Upload to Firebase Storage using resumable transfer (or uploadString fallback)
    const binaryData = base64Data ? base64ToUint8Array(base64Data) : null;
    if (binaryData) {
      await uploadWithResumableProgress(storageRef, binaryData, contentType, onProgress);
    } else if (base64Data) {
      await uploadString(storageRef, base64Data, "base64", { contentType });
    } else {
      let blob: Blob | null = null;
      try {
        const response = await fetch(compressedUri);
        blob = await response.blob();
        await uploadWithResumableProgress(storageRef, blob, contentType, onProgress);
      } finally {
        if (typeof (blob as any)?.close === "function") {
          (blob as any).close();
        }
      }
    }

    // 3. Get Download URL
    const publicUrl = await getDownloadURL(storageRef);

    onProgress?.(100);

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
