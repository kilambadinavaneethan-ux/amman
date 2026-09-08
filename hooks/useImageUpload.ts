import { useState, useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { StorageFolder } from "../constants/storageFolders";
import {
  uploadImage as uploadStorageImage,
  deleteImage as deleteStorageImage,
  updateImage as updateStorageImage,
  StorageUploadResult,
  StorageUploadOptions,
} from "../services/storage";
import { isValidImageExtension, getFileExtension } from "../utils/fileHelpers";

export interface UseImageUploadReturn {
  isUploading: boolean;
  progress: number;
  error: string | null;
  selectedUri: string | null;
  uploadedUrl: string | null;
  storagePath: string | null;
  isOfflineQueued: boolean;
  pickFromGallery: () => Promise<string | null>;
  pickFromCamera: () => Promise<string | null>;
  uploadSelectedImage: (folder: StorageFolder, entityId?: string, userId?: string) => Promise<StorageUploadResult | null>;
  uploadDirectImage: (uri: string, folder: StorageFolder, entityId?: string, userId?: string) => Promise<StorageUploadResult>;
  deleteImage: (path: string) => Promise<boolean>;
  updateImage: (oldPath: string | null, newUri: string, folder: StorageFolder, entityId?: string, userId?: string) => Promise<StorageUploadResult>;
  retryUpload: (folder: StorageFolder, entityId?: string, userId?: string) => Promise<StorageUploadResult | null>;
  resetState: () => void;
  setSelectedUri: (uri: string | null) => void;
}

export function useImageUpload(): UseImageUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [isOfflineQueued, setIsOfflineQueued] = useState(false);
  const [lastUploadParams, setLastUploadParams] = useState<{ folder: StorageFolder; entityId?: string; userId?: string } | null>(null);

  const resetState = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
    setSelectedUri(null);
    setUploadedUrl(null);
    setStoragePath(null);
    setIsOfflineQueued(false);
  }, []);

  const validatePickedUri = (uri: string): boolean => {
    const ext = getFileExtension(uri);
    if (!isValidImageExtension(ext)) {
      const msg = `Unsupported file format (.${ext}). Only JPG, JPEG, PNG, and WEBP files are allowed.`;
      setError(msg);
      Alert.alert("Invalid Image Format", msg);
      return false;
    }
    setError(null);
    return true;
  };

  const pickFromGallery = useCallback(async (): Promise<string | null> => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        const msg = "Gallery permission is required to select photos.";
        setError(msg);
        Alert.alert("Permission Denied", msg);
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const pickedUri = result.assets[0].uri;
        if (validatePickedUri(pickedUri)) {
          setSelectedUri(pickedUri);
          return pickedUri;
        }
      }
      return null;
    } catch (err: any) {
      console.error("pickFromGallery error:", err);
      setError(err?.message || "Failed to pick image from gallery.");
      return null;
    }
  }, []);

  const pickFromCamera = useCallback(async (): Promise<string | null> => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        const msg = "Camera permission is required to capture photos.";
        setError(msg);
        Alert.alert("Permission Denied", msg);
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const capturedUri = result.assets[0].uri;
        if (validatePickedUri(capturedUri)) {
          setSelectedUri(capturedUri);
          return capturedUri;
        }
      }
      return null;
    } catch (err: any) {
      console.error("pickFromCamera error:", err);
      setError(err?.message || "Failed to capture image from camera.");
      return null;
    }
  }, []);

  const uploadDirectImage = useCallback(
    async (uri: string, folder: StorageFolder, entityId?: string, userId?: string): Promise<StorageUploadResult> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);
      setIsOfflineQueued(false);
      setLastUploadParams({ folder, entityId, userId });

      const res = await uploadStorageImage({
        uri,
        folder,
        entityId,
        userId,
        onProgress: (p) => setProgress(p),
      });

      setIsUploading(false);

      if (res.success) {
        setUploadedUrl(res.publicUrl);
        setStoragePath(res.storagePath);
        setError(null);
      } else {
        if (res.isOfflineQueued) {
          setIsOfflineQueued(true);
          setError("Saved to offline queue. Will upload automatically when internet returns.");
        } else {
          setError(res.error || "Upload failed.");
        }
      }

      return res;
    },
    []
  );

  const uploadSelectedImage = useCallback(
    async (folder: StorageFolder, entityId?: string, userId?: string): Promise<StorageUploadResult | null> => {
      if (!selectedUri) {
        setError("No image selected to upload.");
        return null;
      }
      return await uploadDirectImage(selectedUri, folder, entityId, userId);
    },
    [selectedUri, uploadDirectImage]
  );

  const retryUpload = useCallback(
    async (folder: StorageFolder, entityId?: string, userId?: string): Promise<StorageUploadResult | null> => {
      const targetFolder = folder || lastUploadParams?.folder || "profile";
      const targetEntityId = entityId || lastUploadParams?.entityId;
      const targetUserId = userId || lastUploadParams?.userId;

      if (!selectedUri) {
        setError("No image selected to retry.");
        return null;
      }
      return await uploadDirectImage(selectedUri, targetFolder, targetEntityId, targetUserId);
    },
    [selectedUri, lastUploadParams, uploadDirectImage]
  );

  const deleteImageHandler = useCallback(async (path: string): Promise<boolean> => {
    setIsUploading(true);
    const success = await deleteStorageImage(path);
    setIsUploading(false);
    if (success) {
      setUploadedUrl(null);
      setStoragePath(null);
      setSelectedUri(null);
    }
    return success;
  }, []);

  const updateImageHandler = useCallback(
    async (
      oldPath: string | null,
      newUri: string,
      folder: StorageFolder,
      entityId?: string,
      userId?: string
    ): Promise<StorageUploadResult> => {
      setIsUploading(true);
      const res = await updateStorageImage(oldPath, newUri, {
        uri: newUri,
        folder,
        entityId,
        userId,
        onProgress: (p) => setProgress(p),
      });
      setIsUploading(false);
      if (res.success) {
        setUploadedUrl(res.publicUrl);
        setStoragePath(res.storagePath);
        setSelectedUri(newUri);
      }
      return res;
    },
    []
  );

  return {
    isUploading,
    progress,
    error,
    selectedUri,
    uploadedUrl,
    storagePath,
    isOfflineQueued,
    pickFromGallery,
    pickFromCamera,
    uploadSelectedImage,
    uploadDirectImage,
    deleteImage: deleteImageHandler,
    updateImage: updateImageHandler,
    retryUpload,
    resetState,
    setSelectedUri,
  };
}
