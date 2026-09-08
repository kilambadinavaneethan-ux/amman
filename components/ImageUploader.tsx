import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Modal,
  Alert,
  StyleProp,
  ViewStyle,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import ImagePreview from "./ImagePreview";
import { StorageFolder } from "../constants/storageFolders";
import { useImageUpload } from "../hooks/useImageUpload";
import { StorageUploadResult } from "../services/storage";

export interface ImageUploaderProps {
  folder: StorageFolder;
  entityId?: string;
  userId?: string;
  initialImageUrl?: string | null;
  initialStoragePath?: string | null;
  onUploadSuccess?: (result: StorageUploadResult) => void;
  onDeleteSuccess?: () => void;
  label?: string;
  aspectRatio?: number;
  height?: number;
  containerStyle?: StyleProp<ViewStyle>;
  readOnly?: boolean;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  folder,
  entityId,
  userId,
  initialImageUrl,
  initialStoragePath,
  onUploadSuccess,
  onDeleteSuccess,
  label = "Upload Image",
  aspectRatio = 16 / 9,
  height = 180,
  containerStyle,
  readOnly = false,
}) => {
  const {
    isUploading,
    progress,
    error,
    selectedUri,
    uploadedUrl,
    storagePath,
    isOfflineQueued,
    pickFromCamera,
    pickFromGallery,
    uploadDirectImage,
    deleteImage,
    retryUpload,
  } = useImageUpload();

  const [pickerModalVisible, setPickerModalVisible] = useState(false);

  const displayUri = uploadedUrl || selectedUri || initialImageUrl;
  const currentPath = storagePath || initialStoragePath;

  const handlePickSource = async (source: "camera" | "gallery") => {
    setPickerModalVisible(false);
    let uri: string | null = null;
    if (source === "camera") {
      uri = await pickFromCamera();
    } else {
      uri = await pickFromGallery();
    }

    if (uri) {
      const res = await uploadDirectImage(uri, folder, entityId, userId);
      if (res.success && onUploadSuccess) {
        onUploadSuccess(res);
      }
    }
  };

  const handleRemoveImage = () => {
    Alert.alert("Delete Image", "Are you sure you want to remove this image?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (currentPath) {
            await deleteImage(currentPath);
          }
          if (onDeleteSuccess) {
            onDeleteSuccess();
          }
        },
      },
    ]);
  };

  const handleRetry = async () => {
    const res = await retryUpload(folder, entityId, userId);
    if (res?.success && onUploadSuccess) {
      onUploadSuccess(res);
    }
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.uploadBox, { height, aspectRatio: displayUri ? undefined : aspectRatio }]}>
        {displayUri ? (
          <View style={styles.previewContainer}>
            <ImagePreview uri={displayUri} style={styles.previewImage} />

            {!readOnly && !isUploading && (
              <View style={styles.actionOverlay}>
                <Pressable
                  style={[styles.overlayBtn, styles.replaceBtn]}
                  onPress={() => setPickerModalVisible(true)}
                >
                  <MaterialIcons name="photo-camera" size={16} color="#FFFFFF" />
                  <Text style={styles.overlayBtnText}>Replace</Text>
                </Pressable>

                <Pressable
                  style={[styles.overlayBtn, styles.deleteBtn]}
                  onPress={handleRemoveImage}
                >
                  <MaterialIcons name="delete" size={16} color="#FFFFFF" />
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.emptyStateBtn, pressed && styles.pressed, readOnly && { opacity: 0.5 }]}
            onPress={() => !readOnly && setPickerModalVisible(true)}
            disabled={readOnly || isUploading}
          >
            <View style={styles.emptyIconCircle}>
              <MaterialIcons name="cloud-upload" size={28} color="#6366f1" />
            </View>
            <Text style={styles.emptyTitle}>Tap to Upload</Text>
            <Text style={styles.emptySub}>JPG, PNG, WEBP up to 5MB</Text>
          </Pressable>
        )}

        {/* Upload Progress Overlay */}
        {isUploading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Uploading... {progress}%</Text>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
            </View>
          </View>
        )}
      </View>

      {/* Offline Badge */}
      {isOfflineQueued && (
        <View style={styles.offlineBadge}>
          <MaterialIcons name="wifi-off" size={14} color="#d97706" />
          <Text style={styles.offlineBadgeText}>Saved to offline queue. Will auto-upload when online.</Text>
        </View>
      )}

      {/* Error Message & Retry Button */}
      {error && !isOfflineQueued && (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={16} color="#ef4444" />
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
          <Pressable style={styles.retryBtn} onPress={handleRetry}>
            <MaterialIcons name="refresh" size={14} color="#6366f1" />
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Source Selector Modal */}
      <Modal
        visible={pickerModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPickerModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerModalVisible(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose Image Source</Text>

            <View style={styles.modalOptionsRow}>
              <Pressable style={styles.modalOptionBtn} onPress={() => handlePickSource("camera")}>
                <View style={[styles.optionIconCircle, { backgroundColor: "#e0e7ff" }]}>
                  <MaterialIcons name="photo-camera" size={26} color="#4f46e5" />
                </View>
                <Text style={styles.optionText}>Take Photo</Text>
              </Pressable>

              <Pressable style={styles.modalOptionBtn} onPress={() => handlePickSource("gallery")}>
                <View style={[styles.optionIconCircle, { backgroundColor: "#f0fdf4" }]}>
                  <MaterialIcons name="photo-library" size={26} color="#16a34a" />
                </View>
                <Text style={styles.optionText}>Choose Gallery</Text>
              </Pressable>
            </View>

            <Pressable style={styles.modalCancelBtn} onPress={() => setPickerModalVisible(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 6,
  },
  uploadBox: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    borderStyle: "dashed",
    backgroundColor: "#f8fafc",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  previewContainer: {
    width: "100%",
    height: "100%",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  actionOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
    flexDirection: "row",
    gap: 8,
  },
  overlayBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  replaceBtn: {
    backgroundColor: "#4f46e5",
  },
  deleteBtn: {
    backgroundColor: "#ef4444",
  },
  overlayBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyStateBtn: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#e0e7ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e293b",
  },
  emptySub: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 2,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#4f46e5",
    marginTop: 8,
  },
  progressBarTrack: {
    width: "80%",
    height: 6,
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    overflow: "hidden",
    marginTop: 8,
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#6366f1",
    borderRadius: 3,
  },
  offlineBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 6,
  },
  offlineBadgeText: {
    fontSize: 11,
    color: "#d97706",
    fontWeight: "600",
    flex: 1,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 6,
  },
  errorText: {
    fontSize: 11,
    color: "#ef4444",
    fontWeight: "600",
    flex: 1,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: "#e0e7ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  retryBtnText: {
    fontSize: 11,
    color: "#4f46e5",
    fontWeight: "700",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1e293b",
    marginBottom: 20,
  },
  modalOptionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginBottom: 16,
  },
  modalOptionBtn: {
    alignItems: "center",
    gap: 8,
  },
  optionIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  optionText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
  },
});
export default ImageUploader;
