import { APIRequestContext, expect, test } from "@playwright/test";

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const apiV1 = apiBase.endsWith("/api/v1") ? apiBase : `${apiBase}/api/v1`;

const adminEmail = process.env.E2E_ADMIN_EMAIL || "admin@gym-erp.com";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "password123";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryDelayMs(detail: unknown): number {
  if (typeof detail !== "string") {
    return 1500;
  }
  const secondsMatch = detail.match(/retry in\s+(\d+)\s+seconds?/i);
  if (secondsMatch) {
    return (Number(secondsMatch[1]) + 1) * 1000;
  }
  return 1500;
}

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  let lastStatus = 0;
  let lastDetail: unknown = null;
  let body: { data?: { access_token?: string; refresh_token?: string }; detail?: unknown } = {};
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const login = await request.post(`${apiV1}/auth/login`, { data: { email, password } });
    body = await login.json().catch(() => ({}));
    if (login.ok()) {
      return {
        accessToken: body?.data?.access_token as string,
        refreshToken: body?.data?.refresh_token as string,
      };
    }
    lastStatus = login.status();
    lastDetail = body?.detail;
    if (login.status() !== 429 || attempt === 3) {
      break;
    }
    await sleep(parseRetryDelayMs(body?.detail));
  }
  throw new Error(`Login failed for ${email} (status=${lastStatus}, detail=${String(lastDetail)})`);
}

async function fetchMe(request: APIRequestContext, accessToken: string) {
  const me = await request.get(`${apiV1}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(me.ok()).toBeTruthy();
  const body = await me.json();
  return body?.data;
}

test("branch selection updates API query params on staff page", async ({ page, request }) => {
  const auth = await apiLogin(request, adminEmail, adminPassword);
  const me = await fetchMe(request, auth.accessToken);

  const branchesRes = await request.get(`${apiV1}/hr/branches`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  expect(branchesRes.ok()).toBeTruthy();
  const branchesBody = await branchesRes.json();
  const firstBranch = branchesBody?.data?.[0];
  test.skip(!firstBranch?.id || !firstBranch?.name, "No accessible branch available for branch selector test");

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ accessToken, refreshToken, user }) => {
      window.sessionStorage.setItem("token", accessToken);
      if (refreshToken) {
        window.sessionStorage.setItem("refresh_token", refreshToken);
      }
      window.localStorage.setItem("user", JSON.stringify(user));
      window.localStorage.removeItem(`selected_branch_${user.id}`);
    },
    { accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: me }
  );

  const staffRequestUrls: string[] = [];
  await page.route("**/api/v1/hr/staff**", async (route) => {
    staffRequestUrls.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });

  await page.goto("/dashboard/admin/staff", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /staff management|إدارة الموظفين/i })).toBeVisible();

  await expect.poll(() => staffRequestUrls.length).toBeGreaterThan(0);
  const initial = new URL(staffRequestUrls[0]);
  expect(initial.searchParams.get("branch_id")).toBeNull();

  await page.getByRole("button", { name: /all branches|جميع الفروع/i }).click();
  await page.getByRole("option", { name: String(firstBranch.name) }).click();

  await expect
    .poll(() =>
      staffRequestUrls.some((url) => {
        const parsed = new URL(url);
        return parsed.searchParams.get("branch_id") === String(firstBranch.id);
      })
    )
    .toBeTruthy();
});
