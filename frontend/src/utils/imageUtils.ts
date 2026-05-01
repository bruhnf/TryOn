import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Process an image for upload:
 * - Converts HEIF/HEIC to JPEG (iOS default format not supported by all backends)
 * - Resizes large images to reasonable dimensions
 * - Compresses to reduce upload size
 */
export async function processImageForUpload(
  uri: string,
  options?: {
    maxWidth?: number;
    maxHeight?: number;
    compress?: number;
  }
): Promise<{ uri: string; type: string; name: string }> {
  const { maxWidth = 2048, maxHeight = 2048, compress = 0.85 } = options ?? {};

  // Use ImageManipulator to convert to JPEG and resize if needed
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [
      {
        resize: {
          width: maxWidth,
          height: maxHeight,
        },
      },
    ],
    {
      compress,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return {
    uri: result.uri,
    type: 'image/jpeg',
    name: `photo_${Date.now()}.jpg`,
  };
}
