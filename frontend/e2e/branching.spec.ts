import { APIRequestContext, expect, Page, test } from "@playwright/test";

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const apiV1 = apiBase.endsWith("/api/v1") ? apiBase : `${apiBase}/api/v1`;

const adminEmail = process.env.E2E_ADMIN_EMAIL || "admin@gym-erp.com";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "GymPass123!";
const superAdminEmail = process.env.E2E_SUPER_ADMIN_EMAIL || adminEmail;
const superAdminPassword = process.env.E2E_SUPER_ADMIN_PASSWORD || adminPassword;

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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

async function seedBrowserSession(
  page: Page,
  auth: { accessToken: string; refreshToken: string },
  user: { id: string }
) {
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
    { accessToken: auth.accessToken, refreshToken: auth.refreshToken, user }
  );
}

async function openBranchSelector(page: Page) {
  await page.getByRole("button", { name: /all branches|جميع الفروع/i }).click();
}

async function chooseBranchInSelector(page: Page, branchName: string) {
  await openBranchSelector(page);
  await page.getByRole("option", { name: new RegExp(escapeRegex(branchName), "i") }).first().click();
}

function filterSelect(page: Page, label: RegExp) {
  return page.locator("label", { hasText: label }).locator("xpath=..").locator("select");
}

test("branch selection persists across branch-scoped admin pages on desktop", async ({ page, request }) => {
  const auth = await apiLogin(request, adminEmail, adminPassword);
  const me = await fetchMe(request, auth.accessToken);

  const branchesRes = await request.get(`${apiV1}/hr/branches`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  expect(branchesRes.ok()).toBeTruthy();
  const branchesBody = await branchesRes.json();
  const firstBranch = branchesBody?.data?.[0];
  test.skip(!firstBranch?.id || !(firstBranch?.display_name || firstBranch?.name), "No accessible branch available for branch selector test");

  await seedBrowserSession(page, auth, me);

  const staffRequestUrls: string[] = [];
  const inventoryRequestUrls: string[] = [];

  await page.route("**/api/v1/hr/staff**", async (route) => {
    staffRequestUrls.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });

  await page.route("**/api/v1/inventory/products**", async (route) => {
    inventoryRequestUrls.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });

  await page.goto("/dashboard/admin/staff", { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: /staff management|إدارة الموظفين/i })).toBeVisible();

  await expect.poll(() => staffRequestUrls.length).toBeGreaterThan(0);
  expect(new URL(staffRequestUrls[0]).searchParams.get("branch_id")).toBeNull();

  const branchLabel = String(firstBranch.display_name || firstBranch.name);
  await chooseBranchInSelector(page, branchLabel);

  await expect
    .poll(() =>
      staffRequestUrls.some((url) => new URL(url).searchParams.get("branch_id") === String(firstBranch.id))
    )
    .toBeTruthy();

  await page.goto("/dashboard/admin/inventory", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: new RegExp(escapeRegex(branchLabel), "i") })).toBeVisible();
  await expect
    .poll(() =>
      inventoryRequestUrls.some((url) => new URL(url).searchParams.get("branch_id") === String(firstBranch.id))
    )
    .toBeTruthy();
});

test("branch selection persists across branch-scoped admin pages on mobile", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const auth = await apiLogin(request, adminEmail, adminPassword);
  const me = await fetchMe(request, auth.accessToken);

  const branchesRes = await request.get(`${apiV1}/hr/branches`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  expect(branchesRes.ok()).toBeTruthy();
  const branchesBody = await branchesRes.json();
  const firstBranch = branchesBody?.data?.[0];
  test.skip(!firstBranch?.id || !(firstBranch?.display_name || firstBranch?.name), "No accessible branch available for mobile branch selector test");

  await seedBrowserSession(page, auth, me);

  const inventoryRequestUrls: string[] = [];
  await page.route("**/api/v1/inventory/products**", async (route) => {
    inventoryRequestUrls.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
  });

  const branchLabel = String(firstBranch.display_name || firstBranch.name);

  await page.goto("/dashboard/admin/staff", { waitUntil: "networkidle" });
  await chooseBranchInSelector(page, branchLabel);
  await expect(page.getByRole("button", { name: new RegExp(escapeRegex(branchLabel), "i") })).toBeVisible();

  await page.goto("/dashboard/admin/inventory", { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: new RegExp(escapeRegex(branchLabel), "i") })).toBeVisible();
  await expect
    .poll(() =>
      inventoryRequestUrls.some((url) => new URL(url).searchParams.get("branch_id") === String(firstBranch.id))
    )
    .toBeTruthy();
});

test("shared branch scope reaches super-admin users and audit pages", async ({ page, request }) => {
  const auth = await apiLogin(request, superAdminEmail, superAdminPassword);
  const me = await fetchMe(request, auth.accessToken);
  test.skip(me?.role !== "SUPER_ADMIN", "Super admin credentials are required for system branch coverage");

  const branchesRes = await request.get(`${apiV1}/system/branches`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  expect(branchesRes.ok()).toBeTruthy();
  const branchList = await branchesRes.json();
  const firstBranch = branchList?.[0];
  test.skip(!firstBranch?.id || !(firstBranch?.display_name || firstBranch?.name), "No system branch available for super-admin branch scope test");

  await seedBrowserSession(page, auth, me);

  const usersRequestUrls: string[] = [];
  const auditRequestUrls: string[] = [];

  await page.route("**/api/v1/system/users/search**", async (route) => {
    usersRequestUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [], total: 0, page: 1, limit: 20 } }),
    });
  });

  await page.route("**/api/v1/system/audit-logs**", async (route) => {
    auditRequestUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [], total: 0, page: 1, limit: 20 } }),
    });
  });

  await page.route("**/api/v1/audit/security**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: null }),
    });
  });

  await page.goto("/dashboard/system/users", { waitUntil: "networkidle" });
  await filterSelect(page, /branch|الفرع/i).selectOption(String(firstBranch.id));

  await expect
    .poll(() =>
      usersRequestUrls.some((url) => new URL(url).searchParams.get("branch_id") === String(firstBranch.id))
    )
    .toBeTruthy();

  await page.goto("/dashboard/system/audit", { waitUntil: "networkidle" });
  await expect(filterSelect(page, /branch|الفرع/i)).toHaveValue(String(firstBranch.id));
  await expect
    .poll(() =>
      auditRequestUrls.some((url) => new URL(url).searchParams.get("branch_id") === String(firstBranch.id))
    )
    .toBeTruthy();
  await expect(page).toHaveURL(new RegExp(`branch=${escapeRegex(String(firstBranch.id))}`));
});

test("changing gym clears incompatible system branch selection", async ({ page, request }) => {
  const auth = await apiLogin(request, superAdminEmail, superAdminPassword);
  const me = await fetchMe(request, auth.accessToken);
  test.skip(me?.role !== "SUPER_ADMIN", "Super admin credentials are required for system branch coverage");

  const [gymsRes, branchesRes] = await Promise.all([
    request.get(`${apiV1}/system/gyms`, { headers: { Authorization: `Bearer ${auth.accessToken}` } }),
    request.get(`${apiV1}/system/branches`, { headers: { Authorization: `Bearer ${auth.accessToken}` } }),
  ]);
  expect(gymsRes.ok()).toBeTruthy();
  expect(branchesRes.ok()).toBeTruthy();

  const gymsBody = await gymsRes.json();
  const branchesBody = await branchesRes.json();
  const gyms = Array.isArray(gymsBody) ? gymsBody : gymsBody?.data || [];
  const branches = Array.isArray(branchesBody) ? branchesBody : [];
  const selectedBranch = branches.find((branch: { id?: string; gym_id?: string }) => branch?.id && branch?.gym_id);
  const incompatibleGym = gyms.find((gym: { id?: string }) => gym?.id && gym.id !== selectedBranch?.gym_id);

  test.skip(!selectedBranch?.id || !selectedBranch?.gym_id || !incompatibleGym?.id, "Need at least two gyms with branch data for incompatible gym reset coverage");

  await seedBrowserSession(page, auth, me);

  const usersRequestUrls: string[] = [];
  await page.route("**/api/v1/system/users/search**", async (route) => {
    usersRequestUrls.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { items: [], total: 0, page: 1, limit: 20 } }),
    });
  });

  await page.goto("/dashboard/system/users", { waitUntil: "networkidle" });
  await filterSelect(page, /branch|الفرع/i).selectOption(String(selectedBranch.id));

  await expect
    .poll(() =>
      usersRequestUrls.some((url) => new URL(url).searchParams.get("branch_id") === String(selectedBranch.id))
    )
    .toBeTruthy();

  await filterSelect(page, /gym|النادي/i).selectOption(String(incompatibleGym.id));

  await expect(filterSelect(page, /branch|الفرع/i)).toHaveValue("");
  await expect
    .poll(() =>
      usersRequestUrls.some((url) => {
        const parsed = new URL(url);
        return parsed.searchParams.get("gym_id") === String(incompatibleGym.id) && !parsed.searchParams.get("branch_id");
      })
    )
    .toBeTruthy();
  await expect(page).not.toHaveURL(/branch=/);
});
