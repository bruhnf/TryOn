import sharp from 'sharp';

// Target size for the long edge
const MAX_LONG_SIDE = 1024;

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * Resize image so the longest side is 1024px while maintaining aspect ratio.
 * Converts to JPEG for consistent output.
 */
export async function resizeImageForTryOn(inputBuffer: Buffer): Promise<ProcessedImage> {
  console.log(`[ImageProcessor] Input buffer size: ${inputBuffer.length} bytes`);
  
  try {
    // Get original image metadata
    const metadata = await sharp(inputBuffer).metadata();
    console.log(`[ImageProcessor] Original: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
    
    // Check for unsupported formats (Sharp may report heif but not support decoding it)
    const format = metadata.format as string;
    if (format === 'heif' || format === 'heic') {
      throw new Error('HEIF/HEIC format not supported. Please convert to JPEG before uploading.');
    }
    
    // Resize so the longest side is 1024px, aspect ratio preserved
    // Sharp will automatically calculate the other dimension
    const outputBuffer = await sharp(inputBuffer)
      .rotate() // Auto-rotate based on EXIF orientation first
      .resize(MAX_LONG_SIDE, MAX_LONG_SIDE, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    
    // Get final dimensions
    const outputMetadata = await sharp(outputBuffer).metadata();
    
    console.log(`[ImageProcessor] Output: ${outputMetadata.width}x${outputMetadata.height}, size: ${outputBuffer.length} bytes`);
    
    return {
      buffer: outputBuffer,
      mimeType: 'image/jpeg',
      width: outputMetadata.width || 0,
      height: outputMetadata.height || 0,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ImageProcessor] Error processing image: ${errorMsg}`);
    
    // Provide user-friendly error for common issues
    if (errorMsg.includes('heif') || errorMsg.includes('HEIF') || errorMsg.includes('compression format')) {
      throw new Error('Unsupported image format (HEIF/HEIC). Please use JPEG or PNG.');
    }
    
    throw error;
  }
}

/**
 * Resize image for avatar/profile display (square, smaller)
 */
export async function resizeImageForAvatar(inputBuffer: Buffer): Promise<ProcessedImage> {
  console.log(`[ImageProcessor] Avatar input: ${inputBuffer.length} bytes`);
  
  const outputBuffer = await sharp(inputBuffer)
    .resize({
      width: 512,
      height: 512,
      fit: 'cover',
      position: 'centre',
    })
    .rotate()
    .jpeg({ quality: 85 })
    .toBuffer();
  
  console.log(`[ImageProcessor] Avatar output: 512x512, size: ${outputBuffer.length} bytes`);
  
  return {
    buffer: outputBuffer,
    mimeType: 'image/jpeg',
    width: 512,
    height: 512,
  };
}
