import { APIRequestContext, expect, Page, test } from "@playwright/test";

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const apiV1 = apiBase.endsWith("/api/v1") ? apiBase : `${apiBase}/api/v1`;

const adminEmail = process.env.E2E_ADMIN_EMAIL || "admin@gym-erp.com";
const adminPassword = process.env.E2E_ADMIN_PASSWORD || "password123";
const rolePassword = process.env.E2E_ROLE_PASSWORD || "Temp#12345";

type Locale = "en" | "ar";
type Direction = "ltr" | "rtl";

type RouteOverride = {
  pattern: string | RegExp;
  handler: Parameters<Page["route"]>[1];
};

type CustomerStateScenario = {
  path: string;
  state: string;
  waitUntil?: "domcontentloaded" | "networkidle";
  overrides?: RouteOverride[];
  beforeAuth?: (request: APIRequestContext, customerId: string, accessToken: string) => Promise<void>;
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

async function ensureCustomerUser(request: APIRequestContext) {
  const admin = await apiLogin(request, adminEmail, adminPassword);
  const email = `e2e.customer.${Date.now()}@example.com`;
  const register = await request.post(`${apiV1}/auth/register`, {
    headers: { Authorization: `Bearer ${admin.accessToken}` },
    data: {
      full_name: "E2E Customer",
      email,
      password: rolePassword,
      role: "CUSTOMER",
    },
  });
  expect(register.ok()).toBeTruthy();
  const body = await register.json();
  return {
    id: body?.data?.id as string,
    email,
    password: rolePassword,
  };
}

async function applyCustomerAuthAndLocale(page: Page, request: APIRequestContext, email: string, password: string, locale: Locale) {
  const dir: Direction = locale === "ar" ? "rtl" : "ltr";
  const auth = await apiLogin(request, email, password);
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
  const html = page.locator("html");
  const currentLocale = await html.getAttribute("data-locale");
  if (currentLocale !== locale) {
    const localeToggle = page.locator(`[data-testid="${locale === "ar" ? "locale-ar" : "locale-en"}"]:visible`).first();
    const canClickToggle = await localeToggle.isVisible().catch(() => false);
    if (canClickToggle) {
      await localeToggle.click();
    } else {
      await page.evaluate((nextLocale) => {
        window.localStorage.setItem("gym_locale", nextLocale);
      }, locale);
      await page.reload({ waitUntil: "domcontentloaded" });
    }
  }
  await expect(html).toHaveAttribute("data-locale", locale);
  return { dir, accessToken: auth.accessToken, me };
}

function toSlug(path: string) {
  return path === "/" ? "home" : path.replace(/^\//, "").replace(/[\/[\]]+/g, "-");
}

const customerStateScenarios: CustomerStateScenario[] = [
  {
    path: "/dashboard/profile",
    state: "default",
    ready: async (page) => {
      await expect(page.locator("h1").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/blocked",
    state: "locked-actions",
    act: async (page) => {
      await page.evaluate(() => {
        const user = JSON.parse(window.localStorage.getItem("user") || "{}");
        window.localStorage.setItem(`blocked_request_lock_${user.id || "anon"}`, String(Date.now() + 48 * 60 * 60 * 1000));
      });
      await page.reload({ waitUntil: "networkidle" });
    },
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "الطلبات مقفلة مؤقتاً لمدة" : "Requests are temporarily locked for")).toBeVisible();
    },
  },
  {
    path: "/dashboard/subscription",
    state: "locked-actions",
    act: async (page) => {
      await page.evaluate(() => {
        const user = JSON.parse(window.localStorage.getItem("user") || "{}");
        window.localStorage.setItem(`blocked_request_lock_${user.id || "anon"}`, String(Date.now() + 48 * 60 * 60 * 1000));
      });
      await page.reload({ waitUntil: "networkidle" });
    },
    ready: async (page, locale) => {
      await expect(page.getByText(locale === "ar" ? "الطلبات مقفلة مؤقتًا لمدة" : "Requests are temporarily locked for")).toBeVisible();
    },
  },
  {
    path: "/dashboard/chat",
    state: "default",
    overrides: [
      {
        pattern: "**/chat/threads?*",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
      {
        pattern: "**/chat/contacts",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.locator("h1").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/qr",
    state: "default",
    ready: async (page) => {
      await expect(page.locator("h1").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/support",
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
      await expect(page.getByText(locale === "ar" ? "لا توجد جلسات دعم نشطة." : "No active support sessions found.")).toBeVisible();
    },
  },
  {
    path: "/dashboard/support",
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
      await expect(page.getByText(locale === "ar" ? "جاري تحميل تذاكر الدعم..." : "Loading support tickets...")).toBeVisible();
    },
  },
  {
    path: "/dashboard/support",
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
    path: "/dashboard/support",
    state: "modal-open",
    act: async (page, locale) => {
      await page.getByRole("button", { name: locale === "ar" ? "فتح جلسة جديدة" : "Open New Session" }).click();
    },
    ready: async (page, locale) => {
      await expect(page.getByRole("heading", { name: locale === "ar" ? "فتح جلسة دعم" : "Open Support Session" })).toBeVisible();
    },
  },
  {
    path: "/dashboard/support",
    state: "prefilled-subscription-modal",
    act: async (page) => {
      await page.goto("/dashboard/support?type=renewal", { waitUntil: "networkidle" });
    },
    ready: async (page, locale) => {
      await expect(page.getByRole("heading", { name: locale === "ar" ? "فتح جلسة دعم" : "Open Support Session" })).toBeVisible();
      await expect(page.locator('input.input-dark').first()).not.toHaveValue("");
    },
  },
  {
    path: "/dashboard/member/achievements",
    state: "empty",
    overrides: [
      {
        pattern: "**/gamification/stats",
        handler: async (route) => {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              data: {
                total_visits: 0,
                streak: { current_streak: 0, best_streak: 0, last_visit_date: null },
                badges: [],
              },
            }),
          });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.locator("h1").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/member/diets",
    state: "empty",
    overrides: [
      {
        pattern: "**/fitness/diets",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.locator("h1").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/member/feedback",
    state: "default",
    overrides: [
      {
        pattern: "**/fitness/diets",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.locator("h1").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/member/history",
    state: "empty",
    overrides: [
      {
        pattern: "**/access/my-history",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
      {
        pattern: "**/finance/my-transactions",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.locator("h1").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/member/plans",
    state: "empty",
    overrides: [
      {
        pattern: "**/fitness/plans?*",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.locator("h1").first()).toBeVisible();
    },
  },
  {
    path: "/dashboard/member/progress",
    state: "empty",
    overrides: [
      {
        pattern: "**/fitness/stats",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
      {
        pattern: "**/fitness/biometrics",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
      {
        pattern: "**/fitness/session-logs/me",
        handler: async (route) => {
          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
        },
      },
    ],
    ready: async (page) => {
      await expect(page.locator("h1").first()).toBeVisible();
    },
  },
];

test.describe("customer state visual coverage", () => {
  test.setTimeout(900_000);

  test("captures customer non-default states in EN/AR", async ({ page, request }) => {
    const customer = await ensureCustomerUser(request);
    const context = page.context();

    for (const scenario of customerStateScenarios) {
      for (const locale of ["en", "ar"] as const) {
        const statePage = await context.newPage();
        try {
          for (const override of scenario.overrides || []) {
            await statePage.route(override.pattern, override.handler);
          }

          const { dir, accessToken } = await applyCustomerAuthAndLocale(statePage, request, customer.email, customer.password, locale);
          if (scenario.beforeAuth) {
            await scenario.beforeAuth(request, customer.id, accessToken);
          }

          await statePage.goto(scenario.path, { waitUntil: scenario.waitUntil || "networkidle" });
          await expect(statePage.locator("html")).toHaveAttribute("dir", dir);

          if (scenario.act) {
            await scenario.act(statePage, locale);
          }
          if (scenario.ready) {
            await scenario.ready(statePage, locale);
          }

          const snapshotName = `customer__${toSlug(scenario.path)}__${scenario.state}__${dir}.png`;
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
