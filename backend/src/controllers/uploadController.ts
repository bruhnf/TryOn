import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import { uploadToS3, deleteFromS3, keyFromUrl } from '../services/s3Service';
import { safeFilename } from '../middleware/uploadMiddleware';
import { resizeImageForTryOn, resizeImageForAvatar } from '../utils/imageProcessor';

type BodyPhotoField = 'avatarUrl' | 'fullBodyUrl' | 'mediumBodyUrl';

async function handleBodyPhotoUpload(
  req: Request,
  res: Response,
  field: BodyPhotoField,
): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const { userId } = req.user;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  // Delete old photo from S3 if it exists
  const oldUrl = user[field];
  if (oldUrl) {
    deleteFromS3(keyFromUrl(oldUrl)).catch(console.error);
  }

  // Resize image before upload
  // Avatar gets square crop, body photos get 576x1024 portrait resize
  let processedBuffer: Buffer;
  let mimeType: string;
  
  try {
    if (field === 'avatarUrl') {
      const processed = await resizeImageForAvatar(req.file.buffer);
      processedBuffer = processed.buffer;
      mimeType = processed.mimeType;
    } else {
      const processed = await resizeImageForTryOn(req.file.buffer);
      processedBuffer = processed.buffer;
      mimeType = processed.mimeType;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Image processing failed';
    console.error(`[Upload] Image processing error: ${errorMsg}`);
    res.status(400).json({ 
      error: 'Image processing failed',
      message: errorMsg.includes('HEIF') || errorMsg.includes('format') 
        ? 'Unsupported image format. Please use JPEG or PNG.' 
        : 'Could not process image. Please try a different photo.',
    });
    return;
  }

  // Always use .jpg extension since we convert to JPEG
  const baseFilename = safeFilename(req.file.originalname).replace(/\.[^/.]+$/, '');
  const filename = `${uuidv4()}-${baseFilename}.jpg`;
  const key = await uploadToS3('body-photos', userId, filename, processedBuffer, mimeType);
  const url = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { [field]: url },
    select: { avatarUrl: true, fullBodyUrl: true, mediumBodyUrl: true },
  });

  res.json({ url, photos: updated });
}

async function handleBodyPhotoDelete(
  req: Request,
  res: Response,
  field: BodyPhotoField,
): Promise<void> {
  if (!req.user) { res.status(401).json({ error: 'Unauthorized' }); return; }
  const { userId } = req.user;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const url = user[field];
  if (url) {
    deleteFromS3(keyFromUrl(url)).catch(console.error);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { [field]: null },
    select: { avatarUrl: true, fullBodyUrl: true, mediumBodyUrl: true },
  });

  res.json({ photos: updated });
}

export const uploadAvatar = (req: Request, res: Response) =>
  handleBodyPhotoUpload(req, res, 'avatarUrl');

export const uploadFullBody = (req: Request, res: Response) =>
  handleBodyPhotoUpload(req, res, 'fullBodyUrl');

export const uploadMediumBody = (req: Request, res: Response) =>
  handleBodyPhotoUpload(req, res, 'mediumBodyUrl');

export const deleteAvatar = (req: Request, res: Response) =>
  handleBodyPhotoDelete(req, res, 'avatarUrl');

export const deleteFullBody = (req: Request, res: Response) =>
  handleBodyPhotoDelete(req, res, 'fullBodyUrl');

export const deleteMediumBody = (req: Request, res: Response) =>
  handleBodyPhotoDelete(req, res, 'mediumBodyUrl');
