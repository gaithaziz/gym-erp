import { APIRequestContext, expect, Page, test } from "@playwright/test";

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const apiV1 = apiBase.endsWith("/api/v1") ? apiBase : `${apiBase}/api/v1`;

const adminEmail = process.env.E2E_ADMIN_EMAIL || "admin@gym-erp.com";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "password123";
const rolePassword = process.env.E2E_ROLE_PASSWORD || "Temp#12345";

type AppRole = "ADMIN" | "COACH" | "CUSTOMER" | "EMPLOYEE" | "CASHIER" | "RECEPTION" | "FRONT_DESK";
type Locale = "en" | "ar";
type Direction = "ltr" | "rtl";

type RoleContext = {
  role: AppRole;
  email: string;
  password: string;
};

type RouteSpec = {
  path: string;
  roles: AppRole[];
  state: "default";
};

const fullRouteMatrix: RouteSpec[] = [
  { path: "/", roles: ["ADMIN", "COACH", "CUSTOMER", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"], state: "default" },
  { path: "/login", roles: ["ADMIN"], state: "default" },
  { path: "/members", roles: ["ADMIN", "COACH", "RECEPTION", "FRONT_DESK"], state: "default" },
  { path: "/dashboard", roles: ["ADMIN", "COACH", "CUSTOMER", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"], state: "default" },
  { path: "/dashboard/blocked", roles: ["CUSTOMER"], state: "default" },
  { path: "/dashboard/chat", roles: ["ADMIN", "COACH", "CUSTOMER"], state: "default" },
  { path: "/dashboard/leaves", roles: ["ADMIN", "COACH", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"], state: "default" },
  { path: "/dashboard/lost-found", roles: ["ADMIN", "COACH", "CUSTOMER", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"], state: "default" },
  { path: "/dashboard/profile", roles: ["ADMIN", "COACH", "CUSTOMER", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"], state: "default" },
  { path: "/dashboard/qr", roles: ["ADMIN", "COACH", "CUSTOMER", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"], state: "default" },
  { path: "/dashboard/subscription", roles: ["CUSTOMER"], state: "default" },
  { path: "/dashboard/support", roles: ["CUSTOMER"], state: "default" },
  { path: "/dashboard/admin/audit", roles: ["ADMIN"], state: "default" },
  { path: "/dashboard/admin/entrance-qr", roles: ["ADMIN"], state: "default" },
  { path: "/dashboard/admin/finance", roles: ["ADMIN"], state: "default" },
  { path: "/dashboard/admin/inventory", roles: ["ADMIN"], state: "default" },
  { path: "/dashboard/admin/leaves", roles: ["ADMIN"], state: "default" },
  { path: "/dashboard/admin/members", roles: ["ADMIN", "COACH", "RECEPTION", "FRONT_DESK"], state: "default" },
  { path: "/dashboard/admin/notifications", roles: ["ADMIN", "RECEPTION", "FRONT_DESK"], state: "default" },
  { path: "/dashboard/admin/pos", roles: ["ADMIN", "CASHIER", "EMPLOYEE"], state: "default" },
  { path: "/dashboard/admin/staff", roles: ["ADMIN"], state: "default" },
  { path: "/dashboard/admin/staff/attendance", roles: ["ADMIN"], state: "default" },
  { path: "/dashboard/admin/staff/[id]", roles: ["ADMIN"], state: "default" },
  { path: "/dashboard/admin/support", roles: ["ADMIN", "RECEPTION"], state: "default" },
  { path: "/dashboard/coach/diets", roles: ["ADMIN", "COACH"], state: "default" },
  { path: "/dashboard/coach/feedback", roles: ["ADMIN", "COACH"], state: "default" },
  { path: "/dashboard/coach/library", roles: ["ADMIN", "COACH"], state: "default" },
  { path: "/dashboard/coach/plans", roles: ["ADMIN", "COACH"], state: "default" },
  { path: "/dashboard/member/achievements", roles: ["CUSTOMER"], state: "default" },
  { path: "/dashboard/member/diets", roles: ["CUSTOMER"], state: "default" },
  { path: "/dashboard/member/feedback", roles: ["CUSTOMER"], state: "default" },
  { path: "/dashboard/member/history", roles: ["CUSTOMER"], state: "default" },
  { path: "/dashboard/member/plans", roles: ["CUSTOMER"], state: "default" },
  { path: "/dashboard/member/progress", roles: ["CUSTOMER"], state: "default" },
];

const fastRoles: AppRole[] = ["ADMIN", "CUSTOMER"];
const fastRouteMatrix: RouteSpec[] = [
  { path: "/", roles: ["ADMIN", "CUSTOMER"], state: "default" },
  { path: "/login", roles: ["ADMIN"], state: "default" },
  { path: "/dashboard", roles: ["ADMIN", "CUSTOMER"], state: "default" },
  { path: "/dashboard/profile", roles: ["ADMIN", "CUSTOMER"], state: "default" },
  { path: "/dashboard/qr", roles: ["ADMIN", "CUSTOMER"], state: "default" },
  { path: "/dashboard/blocked", roles: ["CUSTOMER"], state: "default" },
  { path: "/dashboard/subscription", roles: ["CUSTOMER"], state: "default" },
  { path: "/dashboard/admin/members", roles: ["ADMIN"], state: "default" },
  { path: "/dashboard/member/progress", roles: ["CUSTOMER"], state: "default" },
];

const fullRoles: AppRole[] = ["ADMIN", "COACH", "CUSTOMER", "EMPLOYEE", "CASHIER", "RECEPTION", "FRONT_DESK"];

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const login = await request.post(`${apiV1}/auth/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  const accessToken = body?.data?.access_token as string;
  const refreshToken = body?.data?.refresh_token as string;
  return { accessToken, refreshToken };
}

async function fetchMe(request: APIRequestContext, accessToken: string) {
  const me = await request.get(`${apiV1}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  expect(me.ok()).toBeTruthy();
  const body = await me.json();
  return body?.data;
}

async function ensureRoleUser(request: APIRequestContext, role: AppRole): Promise<RoleContext> {
  if (role === "ADMIN") {
    return { role, email: adminEmail, password: adminPassword };
  }

  const admin = await apiLogin(request, adminEmail, adminPassword);
  const email = `e2e.${role.toLowerCase()}.${Date.now()}@example.com`;

  const register = await request.post(`${apiV1}/auth/register`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      full_name: `E2E ${role}`,
      email,
      password: rolePassword,
      role,
    },
  });

  expect(register.ok()).toBeTruthy();
  return { role, email, password: rolePassword };
}

async function applyAuthAndLocale(page: Page, request: APIRequestContext, roleCtx: RoleContext, locale: Locale) {
  const dir: Direction = locale === "ar" ? "rtl" : "ltr";
  const auth = await apiLogin(request, roleCtx.email, roleCtx.password);
  const me = await fetchMe(request, auth.accessToken);

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
    { accessToken: auth.accessToken, refreshToken: auth.refreshToken, user: me, nextLocale: locale }
  );

  // Reload after persisting locale so LocaleProvider resolves the intended direction on init.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(`[data-testid="${locale === "ar" ? "locale-ar" : "locale-en"}"]:visible`).first().click();
  await expect(page.locator("html")).toHaveAttribute("data-locale", locale);

  return dir;
}

function toSlug(path: string) {
  return path === "/" ? "home" : path.replace(/^\//, "").replace(/[\/[\]]+/g, "-");
}

test.describe("route walkthrough visual coverage", () => {
  async function runCoverage(
    page: Page,
    request: APIRequestContext,
    roles: AppRole[],
    routeMatrix: RouteSpec[]
  ) {
    const roleUsers = new Map<AppRole, RoleContext>();

    for (const role of roles) {
      roleUsers.set(role, await ensureRoleUser(request, role));
    }

    // Resolve dynamic route once per run.
    const adminCtx = roleUsers.get("ADMIN");
    if (!adminCtx) throw new Error("Missing ADMIN context");
    const adminAuth = await apiLogin(request, adminCtx.email, adminCtx.password);
    const staffList = await request.get(`${apiV1}/hr/staff?limit=1`, {
      headers: { Authorization: `Bearer ${adminAuth.accessToken}` },
    });
    let staffDetailPath = "/dashboard/admin/staff";
    if (staffList.ok()) {
      const staffBody = await staffList.json();
      const firstStaffId = staffBody?.data?.[0]?.id;
      if (firstStaffId) {
        staffDetailPath = `/dashboard/admin/staff/${firstStaffId}`;
      }
    }

    const resolvedRoutes = routeMatrix.map((r) =>
      r.path === "/dashboard/admin/staff/[id]" ? { ...r, path: staffDetailPath } : r
    );

    for (const role of roles) {
      const roleCtx = roleUsers.get(role);
      if (!roleCtx) continue;

      for (const route of resolvedRoutes.filter((r) => r.roles.includes(role))) {
        for (const locale of ["en", "ar"] as const) {
          await page.context().clearCookies();
          await page.goto("about:blank");
          const dir = await applyAuthAndLocale(page, request, roleCtx, locale);

          await page.goto(route.path, { waitUntil: "networkidle" });
          await expect(page.locator("html")).toHaveAttribute("dir", dir);
          const currentPath = new URL(page.url()).pathname;
          const expectedPath = new RegExp(route.path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
          if (!expectedPath.test(currentPath)) {
            // Guarded routes can redirect based on role/subscription state.
            expect(
              currentPath === "/" || currentPath === "/login" || currentPath.startsWith("/dashboard")
            ).toBeTruthy();
          }

          const snapshotName = `${role.toLowerCase()}__${toSlug(route.path)}__${route.state}__${dir}.png`;
          await expect(page).toHaveScreenshot(snapshotName, {
            animations: "disabled",
            maxDiffPixelRatio: 0.002,
          });
        }
      }
    }
  }

  test.setTimeout(240_000);
  test("captures EN/AR snapshots across critical routes @fast", async ({ page, request }) => {
    await runCoverage(page, request, fastRoles, fastRouteMatrix);
  });

  test.setTimeout(900_000);
  test("captures EN/AR snapshots across all role routes @full", async ({ page, request }) => {
    await runCoverage(page, request, fullRoles, fullRouteMatrix);
  });
});
