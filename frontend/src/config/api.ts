import axios from 'axios';
import { storage } from '../utils/storage';

const STAGING_URL = 'http://localhost:3000/api';
const DEV_URL = 'https://alden-unconcludable-camilo.ngrok-free.dev/api';
const PROD_URL = 'https://api.evofaceflow.com/api';

export const BASE_URL = __DEV__ ? DEV_URL : PROD_URL;

const api = axios.create({ baseURL: BASE_URL, timeout: 30000 });

api.interceptors.request.use(async (config) => {
  const token = await storage.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const refreshToken = await storage.getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        await storage.setTokens(data.accessToken, refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        await storage.clearTokens();
        // useUserStore.getState().logout() — handled via navigation listener
      }
    }
    return Promise.reject(error);
  },
);

export default api;
