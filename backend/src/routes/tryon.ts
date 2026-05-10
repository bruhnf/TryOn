import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { uploadMultiple } from '../middleware/uploadMiddleware';
import {
  submitTryOn,
  getJobStatus,
  getTryOnHistory,
  updateJobPrivacy,
  bulkDeleteJobs,
} from '../controllers/tryonController';

const router = Router();

router.use(requireAuth);

router.post('/', uploadMultiple, submitTryOn);
router.get('/history', getTryOnHistory);
// Mounted before `/:jobId` so the literal segment matches first.
router.post('/bulk-delete', bulkDeleteJobs);
router.get('/:jobId', getJobStatus);
router.patch('/:jobId/privacy', updateJobPrivacy);

export default router;
