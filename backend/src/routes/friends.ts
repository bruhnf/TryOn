import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { follow, unfollow, getFollowing, getFollowers, searchUsers } from '../controllers/friendsController';

const router = Router();

router.use(requireAuth);

router.post('/follow/:userId', follow);
router.delete('/unfollow/:userId', unfollow);
router.get('/following', getFollowing);
router.get('/followers', getFollowers);
router.get('/search', searchUsers);

export default router;
