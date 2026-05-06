import { Router } from 'express';
import { requireAuth, optionalAuth } from '../middleware/auth';
import { getProfile, updateProfile, getMyProfile, deleteAccount } from '../controllers/profileController';

const router = Router();

router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateProfile);
router.delete('/me', requireAuth, deleteAccount);
router.get('/:username', optionalAuth, getProfile);

export default router;
