import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { formatBytes, generateUniqueFileName, getFileExtension } from "../../utils/fileHelpers";

export const LOCAL_IMAGE_CATEGORIES = [
  { id: "all", label: "All Images", icon: "collections" },
  { id: "products", label: "Products", icon: "shopping-bag" },
  { id: "customers", label: "Customers", icon: "person" },
  { id: "receipts", label: "Receipts", icon: "receipt" },
  { id: "avatars", label: "Avatars", icon: "account-circle" },
  { id: "general", label: "General", icon: "folder" },
] as const;

export type LocalImageCategory = "products" | "customers" | "receipts" | "avatars" | "general" | "all";

export interface LocalImageFile {
  uri: string;
  fileName: string;
  category: string;
  size: number;
  formattedSize: string;
  modificationTime: number;
  formattedDate: string;
  extension: string;
}

export interface LocalStorageStats {
  totalFiles: number;
  totalSizeBytes: number;
  formattedTotalSize: string;
  rootDirectoryUri: string;
  categoryCounts: Record<string, number>;
}

const ROOT_IMAGE_DIR = `${FileSystem.documentDirectory}app_images/`;

/**
 * Get category subfolder path
 */
function getCategoryDirPath(category: string): string {
  const cleanCat = category.toLowerCase().trim();
  const validCat = ["products", "customers", "receipts", "avatars", "general"].includes(cleanCat)
    ? cleanCat
    : "general";
  return `${ROOT_IMAGE_DIR}${validCat}/`;
}

/**
 * Ensure root local image folder and category subfolders exist on the phone storage
 */
export async function initLocalImageStorage(): Promise<boolean> {
  try {
    const rootInfo = await FileSystem.getInfoAsync(ROOT_IMAGE_DIR);
    if (!rootInfo.exists) {
      await FileSystem.makeDirectoryAsync(ROOT_IMAGE_DIR, { intermediates: true });
    }

    const categories = ["products", "customers", "receipts", "avatars", "general"];
    for (const cat of categories) {
      const catDir = getCategoryDirPath(cat);
      const catInfo = await FileSystem.getInfoAsync(catDir);
      if (!catInfo.exists) {
        await FileSystem.makeDirectoryAsync(catDir, { intermediates: true });
      }
    }
    return true;
  } catch (error) {
    console.error("Error initializing local image storage folders:", error);
    return false;
  }
}

/**
 * Save an image to phone's local storage folder
 */
export async function saveImageToLocalFolder(
  sourceUri: string,
  category: string = "general",
  customFileName?: string
): Promise<{ success: boolean; image?: LocalImageFile; error?: string }> {
  try {
    await initLocalImageStorage();

    if (!sourceUri) {
      return { success: false, error: "No image source URI provided." };
    }

    const ext = getFileExtension(sourceUri);
    const fileName = customFileName
      ? customFileName.endsWith(`.${ext}`) ? customFileName : `${customFileName}.${ext}`
      : generateUniqueFileName(ext);

    const targetCategoryDir = getCategoryDirPath(category);
    const targetUri = `${targetCategoryDir}${fileName}`;

    // Copy file to app's local storage folder
    await FileSystem.copyAsync({
      from: sourceUri,
      to: targetUri,
    });

    const fileInfo = (await FileSystem.getInfoAsync(targetUri)) as any;
    const modTime = fileInfo.modificationTime ? fileInfo.modificationTime * 1000 : Date.now();
    const size = fileInfo.size || 0;

    const savedImage: LocalImageFile = {
      uri: targetUri,
      fileName,
      category: category.toLowerCase(),
      size,
      formattedSize: formatBytes(size),
      modificationTime: modTime,
      formattedDate: new Date(modTime).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      extension: ext,
    };

    return { success: true, image: savedImage };
  } catch (error: any) {
    console.error("Error saving image to local folder:", error);
    return { success: false, error: error?.message || "Failed to save image locally." };
  }
}

/**
 * List stored images from local storage folder (optionally filtered by category)
 */
export async function listLocalImages(category: string = "all"): Promise<LocalImageFile[]> {
  try {
    await initLocalImageStorage();

    const result: LocalImageFile[] = [];
    const categoriesToScan = category === "all"
      ? ["products", "customers", "receipts", "avatars", "general"]
      : [category.toLowerCase()];

    for (const cat of categoriesToScan) {
      const catDir = getCategoryDirPath(cat);
      const catInfo = await FileSystem.getInfoAsync(catDir);
      if (!catInfo.exists) continue;

      const fileNames = await FileSystem.readDirectoryAsync(catDir);
      for (const fName of fileNames) {
        // Skip hidden files
        if (fName.startsWith(".")) continue;

        const fileUri = `${catDir}${fName}`;
        const info = (await FileSystem.getInfoAsync(fileUri)) as any;
        if (info.exists && !info.isDirectory) {
          const modTime = info.modificationTime ? info.modificationTime * 1000 : Date.now();
          const ext = getFileExtension(fName);
          const size = info.size || 0;

          result.push({
            uri: fileUri,
            fileName: fName,
            category: cat,
            size,
            formattedSize: formatBytes(size),
            modificationTime: modTime,
            formattedDate: new Date(modTime).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }),
            extension: ext,
          });
        }
      }
    }

    // Sort newest first
    return result.sort((a, b) => b.modificationTime - a.modificationTime);
  } catch (error) {
    console.error("Error listing local images:", error);
    return [];
  }
}

/**
 * Delete an image from local storage
 */
export async function deleteLocalImage(fileUri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
    return true;
  } catch (error) {
    console.error("Error deleting local image:", error);
    return false;
  }
}

/**
 * Get storage stats for the local folder
 */
export async function getLocalStorageStats(): Promise<LocalStorageStats> {
  try {
    await initLocalImageStorage();

    const allImages = await listLocalImages("all");
    let totalBytes = 0;
    const categoryCounts: Record<string, number> = {
      products: 0,
      customers: 0,
      receipts: 0,
      avatars: 0,
      general: 0,
    };

    for (const img of allImages) {
      totalBytes += img.size;
      if (categoryCounts[img.category] !== undefined) {
        categoryCounts[img.category]++;
      } else {
        categoryCounts[img.category] = 1;
      }
    }

    return {
      totalFiles: allImages.length,
      totalSizeBytes: totalBytes,
      formattedTotalSize: formatBytes(totalBytes),
      rootDirectoryUri: ROOT_IMAGE_DIR,
      categoryCounts,
    };
  } catch (error) {
    console.error("Error getting local storage stats:", error);
    return {
      totalFiles: 0,
      totalSizeBytes: 0,
      formattedTotalSize: "0 Bytes",
      rootDirectoryUri: ROOT_IMAGE_DIR,
      categoryCounts: {},
    };
  }
}

/**
 * Save / Export local image from app folder to phone's public Media Library / Photo Gallery
 */
export async function exportToPhoneGallery(
  fileUri: string,
  albumName: string = "Business App Storage"
): Promise<{ success: boolean; error?: string }> {
  try {
    // Lazy-load expo-media-library only when needed to avoid Android permission warning on app startup
    const MediaLibrary = await import("expo-media-library");

    // Attempt saveToLibraryAsync first (works without full album permissions on modern Android)
    if (MediaLibrary.saveToLibraryAsync) {
      try {
        await MediaLibrary.saveToLibraryAsync(fileUri);
        return { success: true };
      } catch (saveErr) {
        // Fall back to album creation if saveToLibraryAsync fails
      }
    }

    const permission = await MediaLibrary.requestPermissionsAsync();
    if (!permission.granted) {
      // Fall back to system share sheet if permissions blocked in Expo Go
      const shared = await shareLocalImage(fileUri);
      if (shared) {
        return { success: true };
      }
      return {
        success: false,
        error: "Media library permission restricted in Expo Go. Use Share option or create a development build for full album access.",
      };
    }

    const asset = await MediaLibrary.createAssetAsync(fileUri);
    if (!asset) {
      return { success: false, error: "Failed to create photo asset." };
    }

    let album = await MediaLibrary.getAlbumAsync(albumName);
    if (!album) {
      await MediaLibrary.createAlbumAsync(albumName, asset, false);
    } else {
      await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error exporting image to phone gallery:", error);
    // Ultimate fallback: open system share sheet
    const shared = await shareLocalImage(fileUri);
    if (shared) {
      return { success: true };
    }
    return { success: false, error: error?.message || "Failed to export image to photo gallery." };
  }
}

/**
 * Pick image from phone gallery and copy to local folder
 */
export async function pickAndImportImage(
  category: string = "general"
): Promise<{ success: boolean; image?: LocalImageFile; error?: string }> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return { success: false, error: "Permission to access gallery was denied." };
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, error: "Image selection cancelled." };
    }

    const pickedUri = result.assets[0].uri;
    return await saveImageToLocalFolder(pickedUri, category);
  } catch (error: any) {
    console.error("Error picking and importing image:", error);
    return { success: false, error: error?.message || "Failed to import image." };
  }
}

/**
 * Take photo using phone camera and copy to local folder
 */
export async function captureAndImportImage(
  category: string = "general"
): Promise<{ success: boolean; image?: LocalImageFile; error?: string }> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return { success: false, error: "Camera permission was denied." };
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.9,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return { success: false, error: "Camera capture cancelled." };
    }

    const capturedUri = result.assets[0].uri;
    return await saveImageToLocalFolder(capturedUri, category);
  } catch (error: any) {
    console.error("Error capturing image:", error);
    return { success: false, error: error?.message || "Failed to capture photo." };
  }
}

/**
 * Share local image via phone system share sheet
 */
export async function shareLocalImage(fileUri: string): Promise<boolean> {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return false;
    }
    await Sharing.shareAsync(fileUri);
    return true;
  } catch (error) {
    console.error("Error sharing local image:", error);
    return false;
  }
}
