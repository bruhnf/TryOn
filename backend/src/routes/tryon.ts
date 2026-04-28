import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { uploadMultiple } from '../middleware/uploadMiddleware';
import { submitTryOn, getJobStatus, getTryOnHistory } from '../controllers/tryonController';

const router = Router();

router.use(requireAuth);

router.post('/', uploadMultiple, submitTryOn);
router.get('/history', getTryOnHistory);
router.get('/:jobId', getJobStatus);

export default router;
