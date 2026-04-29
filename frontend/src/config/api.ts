import axios from 'axios';
import { storage } from '../utils/storage';

const STAGING_URL = 'http://localhost:3000/api';
const DEV_URL = 'https://alden-unconcludable-camilo.ngrok-free.dev/api';
const PROD_URL = 'https://api.evofaceflow.com/api';

export const BASE_URL = __DEV__ ? DEV_URL : PROD_URL;

const api = axios.create({ baseURL: BASE_URL, timeout: 30000 });

// Mutex for token refresh to prevent race conditions
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

api.interceptors.request.use(async (config) => {
  const token = await storage.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Skip ngrok browser warning for API calls
  config.headers['ngrok-skip-browser-warning'] = 'true';
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        // Another request is already refreshing - wait for it
        return new Promise((resolve) => {
          subscribeTokenRefresh((token: string) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await storage.getRefreshToken();
        if (!refreshToken) throw new Error('No refresh token');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        await storage.setTokens(data.accessToken, refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        onTokenRefreshed(data.accessToken);
        return api(original);
      } catch {
        await storage.clearTokens();
        refreshSubscribers = [];
        // useUserStore.getState().logout() — handled via navigation listener
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

export default api;
