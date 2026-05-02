import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Platform, Alert } from 'react-native';

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

/**
 * Download an image from a URL to the device's camera roll/gallery
 */
export async function downloadImageToGallery(
  imageUrl: string,
  filename?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Request permission to access media library
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      return {
        success: false,
        message: 'Permission to access photo library was denied',
      };
    }

    // Generate filename
    const name = filename ?? `TryOn_${Date.now()}.jpg`;
    const fileUri = FileSystem.cacheDirectory + name;

    // Download the image
    const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);
    
    if (downloadResult.status !== 200) {
      return {
        success: false,
        message: 'Failed to download image',
      };
    }

    // Save to camera roll
    const asset = await MediaLibrary.createAssetAsync(downloadResult.uri);
    
    // Try to add to a "TryOn" album
    try {
      const album = await MediaLibrary.getAlbumAsync('TryOn');
      if (album) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      } else {
        await MediaLibrary.createAlbumAsync('TryOn', asset, false);
      }
    } catch {
      // Album creation might fail on some devices, but the image is still saved
    }

    // Clean up cache file
    try {
      await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
    } catch {
      // Ignore cleanup errors
    }

    return {
      success: true,
      message: 'Image saved to gallery',
    };
  } catch (error) {
    console.error('Download error:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save image',
    };
  }
}

/**
 * Download multiple images to gallery
 */
export async function downloadMultipleImages(
  images: { url: string; label: string }[]
): Promise<{ success: boolean; message: string }> {
  try {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      return {
        success: false,
        message: 'Permission to access photo library was denied',
      };
    }

    let savedCount = 0;
    for (const image of images) {
      const result = await downloadImageToGallery(
        image.url,
        `TryOn_${image.label.replace(/\s/g, '')}_${Date.now()}.jpg`
      );
      if (result.success) savedCount++;
    }

    if (savedCount === images.length) {
      return {
        success: true,
        message: `${savedCount} image${savedCount > 1 ? 's' : ''} saved to gallery`,
      };
    } else if (savedCount > 0) {
      return {
        success: true,
        message: `${savedCount} of ${images.length} images saved`,
      };
    } else {
      return {
        success: false,
        message: 'Failed to save images',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to save images',
    };
  }
}

/**
 * Share an image using the native share sheet
 */
export async function shareImage(imageUrl: string): Promise<void> {
  try {
    const filename = `TryOn_${Date.now()}.jpg`;
    const fileUri = FileSystem.cacheDirectory + filename;

    // Download to cache first
    const downloadResult = await FileSystem.downloadAsync(imageUrl, fileUri);
    
    if (downloadResult.status !== 200) {
      Alert.alert('Error', 'Failed to prepare image for sharing');
      return;
    }

    // Share the image
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(downloadResult.uri, {
        mimeType: 'image/jpeg',
        dialogTitle: 'Share Try-On Result',
      });
    } else {
      Alert.alert('Error', 'Sharing is not available on this device');
    }

    // Clean up
    try {
      await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
    } catch {
      // Ignore cleanup errors
    }
  } catch (error) {
    console.error('Share error:', error);
    Alert.alert('Error', 'Failed to share image');
  }
}
