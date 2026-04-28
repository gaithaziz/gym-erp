import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from './tokenStorage';

const isBrowser = typeof window !== 'undefined';
const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const defaultApiUrl = isBrowser ? '/api/v1' : 'http://127.0.0.1:8000/api/v1';
const normalizedApiUrl = (configuredApiUrl || defaultApiUrl).replace(/\/+$/, '');
const API_URL = normalizedApiUrl.endsWith('/api/v1')
    ? normalizedApiUrl
    : `${normalizedApiUrl}/api/v1`;

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

let refreshPromise: Promise<string | null> | null = null;
const SKIP_AUTH_REDIRECT_HEADER = 'X-Skip-Auth-Redirect';

function getFallbackApiUrl(currentBaseUrl?: string): string | null {
    const current = (currentBaseUrl || API_URL).replace(/\/+$/, '');
    if (current.includes('://localhost')) {
        return current.replace('://localhost', '://127.0.0.1');
    }
    if (current.includes('://127.0.0.1')) {
        return current.replace('://127.0.0.1', '://localhost');
    }
    return null;
}

function extractErrorDetail(error: AxiosError): string {
    const data = error.response?.data as { detail?: unknown } | undefined;
    return typeof data?.detail === 'string' ? data.detail.toLowerCase() : '';
}

function extractErrorCode(error: AxiosError): string | null {
    const data = error.response?.data as { code?: unknown; detail?: unknown } | undefined;
    if (typeof data?.code === 'string') return data.code;
    if (typeof data?.detail === 'object' && data?.detail && 'code' in data.detail) {
        const code = (data.detail as { code?: unknown }).code;
        return typeof code === 'string' ? code : null;
    }
    return null;
}

function clearSessionAndRedirect() {
    if (!isBrowser) return;
    clearTokens();
    localStorage.removeItem('user');
    if (window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
}

function isGymAccessLock(error: AxiosError): boolean {
    const status = error.response?.status;
    if (status !== 403 && status !== 503) return false;

    const detail = extractErrorDetail(error);
    return (
        detail.includes('gym is suspended') ||
        detail.includes('undergoing maintenance') ||
        detail.includes('system is undergoing global maintenance')
    );
}

function clearSessionForGymLock(error: AxiosError) {
    if (!isBrowser) return;
    const detail = extractErrorDetail(error);
    const message = detail.includes('suspended')
        ? 'This gym is suspended.'
        : detail.includes('global maintenance')
            ? 'The system is currently in maintenance mode.'
            : 'This gym is currently in maintenance mode.';
    sessionStorage.setItem('pending_toast_message', message);
    sessionStorage.setItem('pending_toast_kind', 'error');
    clearSessionAndRedirect();
}

async function refreshAccessToken(): Promise<string | null> {
    if (!isBrowser) return null;
    const refreshToken = getRefreshToken();
    if (!refreshToken) return null;

    try {
        const response = await axios.post(
            `${API_URL}/auth/refresh`,
            {},
            { headers: { Authorization: `Bearer ${refreshToken}` } }
        );

        const newAccessToken = response.data?.data?.access_token as string | undefined;
        const newRefreshToken = response.data?.data?.refresh_token as string | undefined;

        if (!newAccessToken) return null;

        setAccessToken(newAccessToken);
        if (newRefreshToken) {
            setRefreshToken(newRefreshToken);
        }
        return newAccessToken;
    } catch {
        return null;
    }
}

// Add a request interceptor to include the JWT token
api.interceptors.request.use(
    (config) => {
        if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
            if (config.headers) {
                delete (config.headers as Record<string, unknown>)['Content-Type'];
                delete (config.headers as Record<string, unknown>)['content-type'];
            }
        }
        if (isBrowser) {
            const token = getAccessToken();
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// On 401, try a one-time silent refresh; logout only when refresh fails.
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const status = error.response?.status;
        const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
        const errorCode = extractErrorCode(error);

        if (!error.response && originalRequest && !originalRequest._retry) {
            const fallbackApiUrl = getFallbackApiUrl(originalRequest.baseURL);
            if (fallbackApiUrl) {
                originalRequest._retry = true;
                originalRequest.baseURL = fallbackApiUrl;
                return api.request(originalRequest);
            }
        }

        if (status === 403 && errorCode === 'SUBSCRIPTION_BLOCKED' && isBrowser) {
            if (window.location.pathname !== '/dashboard/subscription') {
                window.location.href = '/dashboard/subscription';
            }
            return Promise.reject(error);
        }

        if (isGymAccessLock(error)) {
            clearSessionForGymLock(error);
            return Promise.reject(error);
        }

        if (status === 401 && originalRequest) {
            const headers = originalRequest.headers as Record<string, unknown> | undefined;
            const skipAuthRedirectRequested =
                headers?.[SKIP_AUTH_REDIRECT_HEADER] === '1' ||
                headers?.[SKIP_AUTH_REDIRECT_HEADER.toLowerCase()] === '1';
            const isKioskAuthFailure = extractErrorDetail(error).includes('kiosk');
            const skipAuthRedirect = skipAuthRedirectRequested && isKioskAuthFailure;
            const url = originalRequest.url || '';
            const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/refresh');

            if (!originalRequest._retry && !isAuthRoute) {
                originalRequest._retry = true;

                if (!refreshPromise) {
                    refreshPromise = refreshAccessToken().finally(() => {
                        refreshPromise = null;
                    });
                }

                const newAccessToken = await refreshPromise;
                if (newAccessToken) {
                    (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${newAccessToken}`;
                    return api(originalRequest);
                }
            }

            if (!skipAuthRedirect) {
                clearSessionAndRedirect();
            }
        }

        return Promise.reject(error);
    }
);
