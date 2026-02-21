import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { clearTokens, getAccessToken, getRefreshToken, setAccessToken, setRefreshToken } from './tokenStorage';

const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:8000';
const normalizedApiUrl = configuredApiUrl.replace(/\/+$/, '');
const API_URL = normalizedApiUrl.endsWith('/api/v1')
    ? normalizedApiUrl
    : `${normalizedApiUrl}/api/v1`;
const isBrowser = typeof window !== 'undefined';

export const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

let refreshPromise: Promise<string | null> | null = null;
const SKIP_AUTH_REDIRECT_HEADER = 'X-Skip-Auth-Redirect';

function extractErrorDetail(error: AxiosError): string {
    const data = error.response?.data as { detail?: unknown } | undefined;
    return typeof data?.detail === 'string' ? data.detail.toLowerCase() : '';
}

function clearSessionAndRedirect() {
    if (!isBrowser) return;
    clearTokens();
    localStorage.removeItem('user');
    if (window.location.pathname !== '/login') {
        window.location.href = '/login';
    }
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
