import { captureRef } from 'react-native-view-shot';
import { ShareSettings } from '../../types/sharing';

export async function generateReceiptImage(
  viewRef: React.RefObject<any>,
  settings?: ShareSettings
): Promise<string> {
  if (!viewRef || !viewRef.current) {
    throw new Error('Receipt view reference is not available for image capture.');
  }

  const quality = settings?.highQualityImage !== false ? 1.0 : 0.8;

  try {
    const uri = await captureRef(viewRef, {
      format: 'png',
      quality,
      result: 'tmpfile',
    });
    return uri;
  } catch (error: any) {
    console.error('Failed to capture receipt image:', error);
    throw new Error(`Receipt image capture failed: ${error.message || error}`);
  }
}
