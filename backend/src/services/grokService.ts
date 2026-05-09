import { env } from '../config/env';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createChildLogger, logExternalCall } from './logger';

const log = createChildLogger('GrokService');

const s3 = new S3Client({
  region: env.aws.region,
  credentials: env.aws.accessKeyId
    ? { accessKeyId: env.aws.accessKeyId, secretAccessKey: env.aws.secretAccessKey }
    : undefined,
});

export type TryOnPerspective = 'full_body' | 'medium';

export interface TryOnInput {
  userBodyImageUrl: string;
  perspective: TryOnPerspective;
  clothingImageUrls: string[];
}

export interface TryOnOutput {
  perspective: TryOnPerspective;
  resultImageUrl: string;
}

// Magic bytes for image format detection
const IMAGE_SIGNATURES = {
  jpeg: [0xFF, 0xD8, 0xFF],
  png: [0x89, 0x50, 0x4E, 0x47],
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF header (WebP starts with RIFF)
};

function detectImageFormat(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'jpeg';
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'png';
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    // Check for WEBP signature at offset 8
    if (buffer.length >= 12 && buffer.toString('ascii', 8, 12) === 'WEBP') {
      return 'webp';
    }
  }
  return null;
}

/**
 * Resolves the input — which may be an S3 key (e.g. "body-photos/<uid>/<file>.jpg"),
 * a legacy public URL, or a fully-qualified non-S3 URL — into an S3 key, or null
 * if it's a non-S3 HTTP URL that should be fetched via plain HTTP.
 */
function resolveS3Key(ref: string, bucket: string): string | null {
  if (!ref.startsWith('http://') && !ref.startsWith('https://')) {
    // Bare key — what new rows store after the lockdown.
    return ref.replace(/^\//, '');
  }
  // Legacy URL — extract key if it points at our bucket.
  if (ref.includes(bucket) || ref.includes('.s3.') || ref.includes('s3.amazonaws.com')) {
    try {
      const urlObj = new URL(ref.split('?')[0]);
      return urlObj.pathname.replace(/^\//, '');
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchImageAsBase64(ref: string, label: string): Promise<{ base64: string; mimeType: string }> {
  log.debug('Fetching image', { label, ref: ref.substring(0, 100) });

  const bucket = env.aws.s3Bucket;
  let buffer: Buffer;
  let contentType = '';

  const s3Key = resolveS3Key(ref, bucket);

  if (s3Key) {
    log.debug('Resolved as S3 key, using SDK direct fetch', { label, key: s3Key });
    try {
      const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
      const response = await s3.send(command);
      const bodyContents = await response.Body?.transformToByteArray();

      if (!bodyContents) {
        throw new Error('S3 returned empty body');
      }

      buffer = Buffer.from(bodyContents);
      contentType = response.ContentType || '';
      log.debug('S3 fetch success', { label, bytes: buffer.length, contentType });
    } catch (s3Error: any) {
      log.error('S3 SDK fetch failed', { label, error: s3Error.message });
      throw new Error(`Failed to fetch ${label} from S3: ${s3Error.message}`);
    }
  } else {
    // Fallback to HTTP fetch for non-S3 URLs
    log.debug('Using HTTP fetch', { label });
    const res = await fetch(ref);
    
    log.debug('HTTP response received', { 
      label, 
      status: res.status, 
      statusText: res.statusText,
      contentType: res.headers.get('content-type'),
      contentLength: res.headers.get('content-length'),
    });
    
    if (!res.ok) {
      const errorBody = await res.text();
      log.error('HTTP fetch failed', { label, status: res.status, errorBody: errorBody.substring(0, 200) });
      throw new Error(`Failed to fetch ${label}: ${res.status} - ${errorBody.substring(0, 200)}`);
    }
    
    contentType = res.headers.get('content-type') || '';
    buffer = Buffer.from(await res.arrayBuffer());
  }
  
  log.debug('Image buffer details', { 
    label, 
    bufferSize: buffer.length, 
    firstBytes: buffer.slice(0, 20).toString('hex'),
  });
  
  // Detect actual format from magic bytes
  const detectedFormat = detectImageFormat(buffer);
  log.debug('Image format detected', { label, format: detectedFormat || 'UNKNOWN' });
  
  if (!detectedFormat) {
    // Log what we actually got
    const preview = buffer.slice(0, 200).toString('utf8');
    log.error('Invalid image data', { label, contentType, preview: preview.substring(0, 100) });
    throw new Error(`${label} is not a valid image (got ${contentType}, first bytes suggest non-image data)`);
  }
  
  const mimeType = `image/${detectedFormat}`;
  const base64 = buffer.toString('base64');
  
  log.debug('Image fetch complete', { label, mimeType, base64Length: base64.length });
  
  return { base64, mimeType };
}

function buildPrompt(perspective: TryOnPerspective): string {
  const viewDesc = perspective === 'full_body' ? 'full body, head to toe' : 'waist-up, medium shot';

  // IMAGE_0 = body photo, IMAGE_1 = clothing item
  return (
    `Generate a photorealistic ${viewDesc} image of the person in <IMAGE_0> wearing the clothing from <IMAGE_1>. ` +
    `Maintain the person's exact face from <IMAGE_0>, skin tone, hair, body shape, and pose. ` +
    `Make the clothing fit naturally and realistically with proper fabric drape, wrinkles, and texture. ` +
    `Keep the original lighting, background, and high detail. Photorealistic, natural shadows.`
  );
}

export async function generateTryOnImage(input: TryOnInput): Promise<string> {
  const { userBodyImageUrl, perspective, clothingImageUrls } = input;

  log.info('Try-on generation started', {
    perspective,
    bodyImageUrl: userBodyImageUrl.substring(0, 80),
    clothingCount: clothingImageUrls.length,
  });

  // Fetch and validate body image
  const bodyImage = await fetchImageAsBase64(userBodyImageUrl, 'body-image');
  
  // Fetch and validate clothing imag
  const clothingImages = await Promise.all(
    clothingImageUrls.map((url, i) => fetchImageAsBase64(url, `clothing-image-${i + 1}`))
  );

  // Build images array as objects with url field (xAI /images/edits format)
  // Reference: https://docs.x.ai/developers/rest-api-reference/inference/images
  const images = [
    { url: `data:${bodyImage.mimeType};base64,${bodyImage.base64}` },
    ...clothingImages.map(img => ({ url: `data:${img.mimeType};base64,${img.base64}` })),
  ];

  const prompt = buildPrompt(perspective);

  log.debug('Grok API request prepared', {
    endpoint: `${env.grok.apiUrl}/images/edits`,
    model: 'grok-imagine-image',
    imageCount: images.length,
    promptLength: prompt.length,
  });

  const requestBody = {
    model: 'grok-imagine-image',
    prompt,
    images,  // Array of { url: "data:..." } objects for multi-image editing
    n: 1,
    response_format: 'url',
  };

  const startTime = Date.now();

  // Set timeout for API call (2 minutes max for image generation)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${env.grok.apiUrl}/images/edits`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.grok.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    const durationMs = Date.now() - startTime;

    const responseBody = await response.text();

    if (!response.ok) {
      logExternalCall('Grok', 'generateImage', {
        method: 'POST',
        url: `${env.grok.apiUrl}/images/edits`,
        statusCode: response.status,
        durationMs,
        success: false,
        error: responseBody.substring(0, 500),
        perspective,
      });
      throw new Error(`Grok API error ${response.status}: ${responseBody}`);
    }

    const data = JSON.parse(responseBody) as {
      data?: Array<{ url?: string; b64_json?: string }>;
    };

    const imageData = data.data?.[0];
    
    if (imageData?.url) {
      logExternalCall('Grok', 'generateImage', {
        method: 'POST',
        url: `${env.grok.apiUrl}/images/edits`,
        statusCode: response.status,
        durationMs,
        success: true,
        perspective,
        resultType: 'url',
      });
      log.info('Try-on generation completed', { perspective, durationMs, resultType: 'url' });
      return imageData.url;
    }
    
    if (imageData?.b64_json) {
      logExternalCall('Grok', 'generateImage', {
        method: 'POST',
        url: `${env.grok.apiUrl}/images/edits`,
        statusCode: response.status,
        durationMs,
        success: true,
        perspective,
        resultType: 'base64',
        resultLength: imageData.b64_json.length,
      });
      log.info('Try-on generation completed', { perspective, durationMs, resultType: 'base64' });
      return `data:image/png;base64,${imageData.b64_json}`;
    }

    logExternalCall('Grok', 'generateImage', {
      method: 'POST',
      url: `${env.grok.apiUrl}/images/edits`,
      statusCode: response.status,
      durationMs,
      success: false,
      error: 'No image content in response',
      perspective,
    });
    throw new Error('Grok API returned no image content');
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;
    
    if ((err as Error).name === 'AbortError') {
      logExternalCall('Grok', 'generateImage', {
        method: 'POST',
        url: `${env.grok.apiUrl}/images/edits`,
        durationMs,
        success: false,
        error: 'Request timed out after 2 minutes',
        perspective,
      });
      throw new Error('Grok API request timed out after 2 minutes');
    }
    throw err;
  }
}