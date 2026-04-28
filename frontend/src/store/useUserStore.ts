import { create } from 'zustand';
import { User } from '../types';
import { storage } from '../utils/storage';
import api from '../config/api';

interface UserStore {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  setUser: (user: User, accessToken: string, refreshToken: string) => Promise<void>;
  updateUser: (partial: Partial<User>) => void;
  logout: () => Promise<void>;
}

export const useUserStore = create<UserStore>((set) => ({
  user: null,
  accessToken: null,
  isLoading: false,
  isInitialized: false,

  initialize: async () => {
    set({ isLoading: true });
    try {
      const token = await storage.getAccessToken();
      if (token) {
        const { data } = await api.get<User>('/profile/me');
        set({ user: data, accessToken: token });
      }
    } catch {
      await storage.clearTokens();
    } finally {
      set({ isLoading: false, isInitialized: true });
    }
  },

  setUser: async (user, accessToken, refreshToken) => {
    await storage.setTokens(accessToken, refreshToken);
    set({ user, accessToken });
  },

  updateUser: (partial) =>
    set((state) => ({ user: state.user ? { ...state.user, ...partial } : null })),

  logout: async () => {
    const refreshToken = await storage.getRefreshToken();
    if (refreshToken) {
      api.post('/auth/logout', { refreshToken }).catch(() => {});
    }
    await storage.clearTokens();
    set({ user: null, accessToken: null });
  },
}));
