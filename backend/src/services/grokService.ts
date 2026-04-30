import { env } from '../config/env';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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

async function fetchImageAsBase64(url: string, label: string): Promise<{ base64: string; mimeType: string }> {
  console.log(`[fetchImage] Fetching ${label}: ${url.substring(0, 100)}...`);
  
  const bucket = env.aws.s3Bucket;
  let buffer: Buffer;
  let contentType = '';
  
  // Check if this is an S3 URL - fetch directly via SDK for reliability
  if (url.includes(bucket) || url.includes('.s3.') || url.includes('s3.amazonaws.com')) {
    console.log(`[fetchImage] ${label}: Detected S3 URL, using SDK direct fetch`);
    try {
      // Extract key from URL
      const urlObj = new URL(url.split('?')[0]); // Remove query params (presigned)
      const key = urlObj.pathname.substring(1); // Remove leading /
      
      console.log(`[fetchImage] ${label}: S3 bucket=${bucket}, key=${key}`);
      
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      });
      
      const response = await s3.send(command);
      const bodyContents = await response.Body?.transformToByteArray();
      
      if (!bodyContents) {
        throw new Error('S3 returned empty body');
      }
      
      buffer = Buffer.from(bodyContents);
      contentType = response.ContentType || '';
      console.log(`[fetchImage] ${label}: S3 fetch success, ${buffer.length} bytes, type: ${contentType}`);
    } catch (s3Error: any) {
      console.error(`[fetchImage] ${label}: S3 SDK fetch failed:`, s3Error.message);
      throw new Error(`Failed to fetch ${label} from S3: ${s3Error.message}`);
    }
  } else {
    // Fallback to HTTP fetch for non-S3 URLs
    console.log(`[fetchImage] ${label}: Using HTTP fetch`);
    const res = await fetch(url);
    
    console.log(`[fetchImage] ${label} response status: ${res.status} ${res.statusText}`);
    console.log(`[fetchImage] ${label} content-type: ${res.headers.get('content-type')}`);
    console.log(`[fetchImage] ${label} content-length: ${res.headers.get('content-length')}`);
    
    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`[fetchImage] ${label} FAILED:`, errorBody.substring(0, 500));
      throw new Error(`Failed to fetch ${label}: ${res.status} - ${errorBody.substring(0, 200)}`);
    }
    
    contentType = res.headers.get('content-type') || '';
    buffer = Buffer.from(await res.arrayBuffer());
  }
  
  console.log(`[fetchImage] ${label} buffer size: ${buffer.length} bytes`);
  console.log(`[fetchImage] ${label} first 20 bytes (hex): ${buffer.slice(0, 20).toString('hex')}`);
  
  // Detect actual format from magic bytes
  const detectedFormat = detectImageFormat(buffer);
  console.log(`[fetchImage] ${label} detected format: ${detectedFormat || 'UNKNOWN'}`);
  
  if (!detectedFormat) {
    // Log what we actually got
    const preview = buffer.slice(0, 200).toString('utf8');
    console.error(`[fetchImage] ${label} NOT A VALID IMAGE! Preview:`, preview);
    throw new Error(`${label} is not a valid image (got ${contentType}, first bytes suggest non-image data)`);
  }
  
  const mimeType = `image/${detectedFormat}`;
  const base64 = buffer.toString('base64');
  
  console.log(`[fetchImage] ${label} SUCCESS: ${mimeType}, ${base64.length} base64 chars`);
  
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

  console.log('\n========== GROK TRY-ON SERVICE START ==========');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Perspective:', perspective);
  console.log('Body image URL:', userBodyImageUrl);
  console.log('Clothing image URLs:', clothingImageUrls);
  console.log('================================================\n');

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

  console.log('\n========== GROK API REQUEST ==========');
  console.log('Endpoint:', `${env.grok.apiUrl}/images/edits`);
  console.log('Model: grok-imagine-image');
  console.log('Prompt:', prompt);
  console.log('Images count:', images.length);
  console.log('Image objects (truncated):');
  images.forEach((img, i) => {
    console.log(`  [${i}] { url: "${img.url.substring(0, 50)}..." } (${img.url.length} chars)`);
  });
  console.log('=======================================\n');

  const requestBody = {
    model: 'grok-imagine-image',
    prompt,
    images,  // Array of { url: "data:..." } objects for multi-image editing
    n: 1,
    response_format: 'url',
  };

  console.log('[Grok] Sending request...');
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

    const elapsed = Date.now() - startTime;
    console.log(`[Grok] Response received in ${elapsed}ms`);
    console.log(`[Grok] Status: ${response.status} ${response.statusText}`);

    const responseBody = await response.text();

    if (!response.ok) {
      console.error('\n========== GROK API ERROR ==========');
      console.error('Status:', response.status);
      console.error('Headers:', Object.fromEntries(response.headers.entries()));
      console.error('Body:', responseBody);
      console.error('=====================================\n');
      throw new Error(`Grok API error ${response.status}: ${responseBody}`);
    }

    const data = JSON.parse(responseBody) as {
      data?: Array<{ url?: string; b64_json?: string }>;
    };

    console.log('\n========== GROK API SUCCESS ==========');
    console.log('Response:', JSON.stringify(data, null, 2));
    console.log('=======================================\n');

    const imageData = data.data?.[0];
    if (imageData?.url) {
      console.log('[Grok] Returning image URL:', imageData.url);
      return imageData.url;
    }
    if (imageData?.b64_json) {
      console.log('[Grok] Returning base64 image (length:', imageData.b64_json.length, ')');
      return `data:image/png;base64,${imageData.b64_json}`;
    }

    console.error('[Grok] No image in response!');
    throw new Error('Grok API returned no image content');
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if ((err as Error).name === 'AbortError') {
      throw new Error('Grok API request timed out after 2 minutes');
    }
    throw err;
  }
}