import { APIRequestContext, expect, Page } from "@playwright/test";

type AuthSession = {
  accessToken: string;
  refreshToken: string;
  me: unknown;
};

const authSessionCache = new Map<string, Promise<AuthSession>>();

function authCacheKey(apiV1: string, email: string, password: string) {
  return `${apiV1}::${email}::${password}`;
}

export async function getCachedAuthSession(
  request: APIRequestContext,
  apiV1: string,
  email: string,
  password: string,
): Promise<AuthSession> {
  const key = authCacheKey(apiV1, email, password);
  const cached = authSessionCache.get(key);
  if (cached) {
    return cached;
  }

  // Reuse auth per account so visual coverage does not trip the backend login limiter.
  const sessionPromise = (async () => {
    const login = await request.post(`${apiV1}/auth/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const body = await login.json();
    const accessToken = body?.data?.access_token as string;
    const refreshToken = body?.data?.refresh_token as string;

    const me = await request.get(`${apiV1}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(me.ok()).toBeTruthy();
    const meBody = await me.json();

    return {
      accessToken,
      refreshToken,
      me: meBody?.data,
    };
  })();

  authSessionCache.set(key, sessionPromise);
  return sessionPromise;
}

export async function persistAuthSession(page: Page, auth: AuthSession, locale: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ accessToken, refreshToken, user, nextLocale }) => {
      window.sessionStorage.setItem("token", accessToken);
      if (refreshToken) {
        window.sessionStorage.setItem("refresh_token", refreshToken);
      }
      window.localStorage.setItem("user", JSON.stringify(user));
      window.localStorage.setItem("gym_locale", nextLocale);
    },
    {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.me,
      nextLocale: locale,
    },
  );
}
