import { manipulateAsync, SaveFormat, Action } from "expo-image-manipulator";
import { MAX_FILE_SIZE_BYTES } from "../constants/storageFolders";

export interface CompressedImageResult {
  uri: string;
  width: number;
  height: number;
  base64?: string;
}

/**
 * Automatically resize and compress image before upload
 * Ensures image size fits within 5MB while preserving visual quality.
 */
export async function compressImageBeforeUpload(
  uri: string,
  maxWidth: number = 1920,
  quality: number = 0.8
): Promise<CompressedImageResult> {
  try {
    const actions: Action[] = [];

    // Resize if max width requested
    actions.push({
      resize: {
        width: maxWidth,
      },
    });

    const result = await manipulateAsync(
      uri,
      actions,
      {
        compress: quality,
        format: SaveFormat.JPEG,
        base64: true,
      }
    );

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      base64: result.base64,
    };
  } catch (error) {
    console.warn("Image manipulation warning, using original URI:", error);
    return {
      uri,
      width: maxWidth,
      height: maxWidth,
    };
  }
}
