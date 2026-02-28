import { APIRequestContext, expect, Page, test } from "@playwright/test";

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const apiV1 = apiBase.endsWith("/api/v1") ? apiBase : `${apiBase}/api/v1`;

const adminEmail = process.env.E2E_ADMIN_EMAIL || "admin@gym-erp.com";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "password123";

type Locale = "en" | "ar";
type Direction = "ltr" | "rtl";

type RouteOverride = {
  pattern: string | RegExp;
  handler: Parameters<Page["route"]>[1];
};

type AdminStateScenario = {
  path: string;
  state: string;
  waitUntil?: "domcontentloaded" | "networkidle";
  overrides?: RouteOverride[];
  act?: (page: Page, locale: Locale) => Promise<void>;
  ready?: (page: Page, locale: Locale) => Promise<void>;
};

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const login = await request.post(`${apiV1}/auth/login`, { data: { email, password } });
  expect(login.ok()).toBeTruthy();
  const body = await login.json();
  return {
    accessToken: body?.data?.access_token as string,
    refreshToken: body?.data?.refresh_token as string,
  };
}

async function fetchMe(request: APIRequestContext, accessToken: string) {
  const me = await request.get(`${apiV1}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(me.ok()).toBeTruthy();
  const body = await me.json();
  return body?.data;
}

async function applyAdminAuthAndLocale(page: Page, request: APIRequestContext, locale: Locale) {
  const dir: Direction = locale === "ar" ? "rtl" : "ltr";
  const auth = await apiLogin(request, adminEmail, adminPassword);
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

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("html")).toHaveAttribute("data-locale", locale);
  return dir;
}

function toSlug(path: string) {
  return path === "/" ? "home" : path.replace(/^\//, "").replace(/[\/[\]]+/g, "-");
}

const fakeStaff = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "E2E Staff",
  email: "staff@example.com",
  role: "COACH",
  profile_picture_url: null,
  contract: {
    type: "FULL_TIME",
    base_salary: 600,
    commission_rate: 0,
    start_date: "2026-01-01",
    end_date: null,
    standard_hours: 160,
  },
};

const adminStateScenarios: AdminStateScenario[] = [
  {
    path: "/dashboard/admin/audit",
    state: "empty",
    overrides: [
      {
        pattern: "**/audit/logs?*",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "لا توجد سجلات تدقيق." : "No audit logs found.")).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/audit",
    state: "loading",
    waitUntil: "domcontentloaded",
    overrides: [
      {
        pattern: "**/audit/logs?*",
        handler: async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.locator(".animate-spin").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/entrance-qr",
    state: "form-validation",
    act: async (page) => {
      await page.locator('input.input-dark').first().fill("!");
      await page.locator("button.btn-primary").first().click();
    },
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "يجب أن تحتوي معرفات الكيوسك" : "Kiosk IDs may only use letters")).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/inventory",
    state: "empty",
    overrides: [
      {
        pattern: "**/inventory/products?*",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "لا توجد منتجات" : "No products found")).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/inventory",
    state: "modal-open",
    act: async (page) => {
      await page.locator("button.btn-primary").first().click();
    },
    ready: async (page, locale) => {
      await expect(page.getByRole("heading", { name: locale === "ar" ? "إضافة منتج" : "Add Product" })).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/inventory",
    state: "form-validation",
    act: async (page) => {
      await page.locator("button.btn-primary").first().click();
    },
    ready: async (page, locale) => {
      const button = page.getByRole("button", { name: locale === "ar" ? "إنشاء المنتج" : "Create Product" });
      await expect(button).toBeDisabled();
    },
  },
  {
    path: "/dashboard/admin/leaves",
    state: "empty",
    overrides: [
      {
        pattern: "**/hr/leaves**",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "لا توجد طلبات إجازة" : "No leave requests found")).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/leaves",
    state: "loading",
    waitUntil: "domcontentloaded",
    overrides: [
      {
        pattern: "**/hr/leaves**",
        handler: async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.locator(".animate-spin").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/leaves",
    state: "error",
    overrides: [
      {
        pattern: "**/hr/leaves**",
        handler: async (route) => {
          await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Server error" }) });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.getByText("Server error")).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/notifications",
    state: "empty",
    overrides: [
      {
        pattern: "**/admin/notifications/automation-rules",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
      {
        pattern: "**/admin/notifications/whatsapp-logs?*",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "لا توجد سجلات تسليم بعد." : "No delivery logs yet.")).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/finance",
    state: "modal-open",
    act: async (page, locale) => {
      await page.getByRole("button", { name: locale === "ar" ? "تسجيل معاملة" : "Log Transaction" }).click();
    },
    ready: async (page, locale) => {
      await expect(page.getByRole("heading", { name: locale === "ar" ? "تسجيل معاملة" : "Log Transaction" })).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/support",
    state: "empty",
    overrides: [
      {
        pattern: "**/support/tickets?*",
        handler: async (route) => {
          await route.fulfill({ status: 200, headers: { "x-total-count": "0" }, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "لا توجد تذاكر في هذا الطابور." : "No tickets found in this queue.")).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/support",
    state: "loading",
    waitUntil: "domcontentloaded",
    overrides: [
      {
        pattern: "**/support/tickets?*",
        handler: async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          await route.fulfill({ status: 200, headers: { "x-total-count": "0" }, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "جاري تحميل التذاكر..." : "Loading tickets...")).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/support",
    state: "error",
    overrides: [
      {
        pattern: "**/support/tickets?*",
        handler: async (route) => {
          await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ detail: "Server error" }) });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.getByText("Server error")).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/staff",
    state: "empty",
    overrides: [
      {
        pattern: "**/hr/staff",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "لا يوجد موظفون بعد" : "No staff members yet").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/staff",
    state: "add-modal",
    act: async (page) => {
      await page.locator("button.btn-primary").first().click();
    },
    ready: async (page, locale) => {
      await expect(page.getByRole("heading", { name: locale === "ar" ? "إضافة موظف جديد" : "Add New Staff Member" })).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/staff",
    state: "edit-modal",
    overrides: [
      {
        pattern: "**/hr/staff",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [fakeStaff] }) });
        },
      },
    ],
    act: async (page, locale) => {
      await page.getByRole("button", { name: locale === "ar" ? "تعديل" : "Edit" }).first().click();
    },
    ready: async (page, locale) => {
      await expect(page.getByRole("heading", { name: locale === "ar" ? "تعديل العقد - E2E Staff" : "Edit Contract - E2E Staff" })).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/staff",
    state: "payroll-modal",
    overrides: [
      {
        pattern: "**/hr/staff",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [fakeStaff] }) });
        },
      },
    ],
    act: async (page, locale) => {
      await page.getByRole("button", { name: locale === "ar" ? "الرواتب" : "Payroll" }).first().click();
    },
    ready: async (page, locale) => {
      await expect(page.getByRole("heading", { name: locale === "ar" ? /إنشاء مسير الرواتب/ : /Generate Payroll/ })).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/staff/attendance",
    state: "empty",
    overrides: [
      {
        pattern: "**/hr/attendance?*",
        handler: async (route) => {
          await route.fulfill({ status: 200, headers: { "x-total-count": "0" }, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "لا توجد سجلات حضور" : "No attendance records")).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/staff/attendance",
    state: "loading",
    waitUntil: "domcontentloaded",
    overrides: [
      {
        pattern: "**/hr/attendance?*",
        handler: async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          await route.fulfill({ status: 200, headers: { "x-total-count": "0" }, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.locator(".animate-spin").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/staff/11111111-1111-1111-1111-111111111111",
    state: "empty",
    overrides: [
      {
        pattern: /.*\/hr\/staff\/11111111-1111-1111-1111-111111111111\/summary.*/,
        handler: async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: {
                employee: {
                  id: fakeStaff.id,
                  full_name: fakeStaff.full_name,
                  email: fakeStaff.email,
                  role: fakeStaff.role,
                  contract_type: fakeStaff.contract.type,
                  base_salary: fakeStaff.contract.base_salary,
                },
                range: { start_date: "2026-01-01", end_date: "2026-01-31" },
                attendance_summary: {
                  days_present: 0,
                  total_hours: 0,
                  avg_hours_per_day: 0,
                  records: [],
                },
                leave_summary: {
                  total_requests: 0,
                  approved_days: 0,
                  pending_count: 0,
                  records: [],
                },
              },
            }),
          });
        },
      },
    ],
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "لا توجد سجلات حضور" : "No attendance records")).toBeVisible();
      await expect(page.getByText(locale === "ar" ? "لا توجد سجلات إجازات" : "No leave records")).toBeVisible();
    },
  },
  {
    path: "/dashboard/admin/staff/00000000-0000-0000-0000-000000000000",
    state: "error",
    overrides: [
      {
        pattern: /.*\/hr\/staff\/00000000-0000-0000-0000-000000000000\/summary.*/,
        handler: async (route) => {
          await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Staff user not found" }) });
        },
      },
    ],
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "تعذر تحميل ملخص الموظف" : "Could not load staff summary")).toBeVisible();
    },
  },
];

test.describe("admin state visual coverage", () => {
  test.setTimeout(1_200_000);

  test("captures admin non-default states in EN/AR", async ({ page, request }) => {
    const context = page.context();

    for (const scenario of adminStateScenarios) {
      for (const locale of ["en", "ar"] as const) {
        const statePage = await context.newPage();
        try {
          for (const override of scenario.overrides || []) {
            await statePage.route(override.pattern, override.handler);
          }

          const dir = await applyAdminAuthAndLocale(statePage, request, locale);
          await statePage.goto(scenario.path, { waitUntil: scenario.waitUntil || "networkidle" });
          await expect(statePage.locator("html")).toHaveAttribute("dir", dir);

          if (scenario.act) {
            await scenario.act(statePage, locale);
          }
          if (scenario.ready) {
            await scenario.ready(statePage, locale);
          }

          const snapshotName = `admin__${toSlug(scenario.path)}__${scenario.state}__${dir}.png`;
          await expect(statePage).toHaveScreenshot(snapshotName, {
            animations: "disabled",
            maxDiffPixelRatio: 0.002,
          });
        } finally {
          await statePage.close();
        }
      }
    }
  });
});
