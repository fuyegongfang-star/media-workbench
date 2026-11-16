/**
 * 认证与用户管理 API（T6.4）。
 * - token 统一存 localStorage：wb_token(access) / wb_refresh_token / wb_user。
 * - 所有请求走同源 /api 前缀（由 nginx 反代到后端），凭据仅在 Authorization 头传递。
 * - 401 时由调用方（路由守卫 / 登录页）决定跳转，不在此处强制，避免循环依赖。
 */

const TOKEN_KEY = 'wb_token';
const REFRESH_KEY = 'wb_refresh_token';
const USER_KEY = 'wb_user';

export interface AuthUser {
  id: string;
  username: string;
  role: 'owner' | 'admin' | 'editor';
  createdAt?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

function prefix(): string {
  return import.meta.env.VITE_API_PREFIX ?? 'api';
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return Boolean(getToken());
}

export function saveTokens(tokens: AuthTokens): void {
  localStorage.setItem(TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(tokens.user));
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/${prefix()}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...authHeader(), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      const m = body?.message;
      if (typeof m === 'string') message = m;
      else if (Array.isArray(m) && m.length) message = m.join('；');
    } catch {
      /* 保留默认错误 */
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function login(username: string, password: string): Promise<AuthTokens> {
  return request<AuthTokens>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export function register(username: string, password: string): Promise<AuthTokens> {
  return request<AuthTokens>('/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
}

export function fetchRegistrationStatus(): Promise<{ enabled: boolean }> {
  return request<{ enabled: boolean }>('/auth/registration-status');
}

export function changePassword(oldPassword: string, newPassword: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
}

export function fetchMe(): Promise<AuthUser> {
  return request<AuthUser>('/auth/me');
}

// ---------- 用户管理（仅 owner/admin）----------

export interface UserView {
  id: string;
  username: string;
  role: 'owner' | 'admin' | 'editor';
  status: 'active' | 'disabled';
  lastLoginAt: string | null;
  createdAt: string;
}

export function listUsers(): Promise<{ items: UserView[] }> {
  return request<{ items: UserView[] }>('/users');
}

export function createUser(input: {
  username: string;
  password: string;
  role?: 'owner' | 'admin' | 'editor';
}): Promise<UserView> {
  return request<UserView>('/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateUserRole(id: string, role: UserView['role']): Promise<UserView> {
  return request<UserView>(`/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export function updateUserStatus(id: string, status: UserView['status']): Promise<UserView> {
  return request<UserView>(`/users/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function resetUserPassword(id: string, password: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/users/${encodeURIComponent(id)}/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export function deleteUser(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
