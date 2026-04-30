import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { uploadMultiple } from '../middleware/uploadMiddleware';
import { submitTryOn, getJobStatus, getTryOnHistory, updateJobPrivacy } from '../controllers/tryonController';

const router = Router();

router.use(requireAuth);

router.post('/', uploadMultiple, submitTryOn);
router.get('/history', getTryOnHistory);
router.get('/:jobId', getJobStatus);
router.patch('/:jobId/privacy', updateJobPrivacy);

export default router;
