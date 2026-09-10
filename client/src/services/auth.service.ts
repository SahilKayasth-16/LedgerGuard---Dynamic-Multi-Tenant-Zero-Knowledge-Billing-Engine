import api from './api';

export interface User {
  userId: string;
  tenantId: string;
  role: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
  message?: string;
}

export interface UserResponse {
  success: boolean;
  user: User;
  message?: string;
}

export const authService = {
  login: async (email: string, password?: string): Promise<AuthResponse> => {
    const response = await api.post<AuthResponse>('/auth/login', { email, password });
    if (response.data.success && response.data.token) {
      localStorage.setItem('token', response.data.token);
    }
    return response.data;
  },

  getMe: async (): Promise<User> => {
    const response = await api.get<UserResponse>('/auth/me');
    if (!response.data.success || !response.data.user) {
      throw new Error(response.data.message || 'Failed to fetch authenticated user');
    }
    return response.data.user;
  },

  logout: (): void => {
    localStorage.removeItem('token');
  },

  getToken: (): string | null => {
    return localStorage.getItem('token');
  },
};

