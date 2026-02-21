const ACCESS_TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refresh_token';

function isBrowser() {
    return typeof window !== 'undefined';
}

function migrateLegacyTokenToSessionStorage(key: string): string | null {
    if (!isBrowser()) return null;
    const legacyValue = localStorage.getItem(key);
    if (!legacyValue) return null;

    sessionStorage.setItem(key, legacyValue);
    localStorage.removeItem(key);
    return legacyValue;
}

export function getAccessToken(): string | null {
    if (!isBrowser()) return null;
    return sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? migrateLegacyTokenToSessionStorage(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
    if (!isBrowser()) return null;
    return sessionStorage.getItem(REFRESH_TOKEN_KEY) ?? migrateLegacyTokenToSessionStorage(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
    if (!isBrowser()) return;
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function setAccessToken(accessToken: string) {
    if (!isBrowser()) return;
    sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function setRefreshToken(refreshToken: string) {
    if (!isBrowser()) return;
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearTokens() {
    if (!isBrowser()) return;
    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}
