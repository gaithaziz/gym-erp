import { expect, test } from "@playwright/test";

const apiBase = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const apiV1 = apiBase.endsWith("/api/v1") ? apiBase : `${apiBase}/api/v1`;

test("starting a workout session uses the selected plan's current section", async ({ page }) => {
  const user = {
    id: "11111111-1111-1111-1111-111111111111",
    full_name: "E2E Member",
    email: "e2e.member@example.com",
    role: "CUSTOMER",
    is_subscription_blocked: false,
    subscription_status: "ACTIVE",
  };

  const planA = {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    name: "Plan A",
    description: "First plan",
    exercises: [
      { id: "ex-a-1", section_name: "Alpha", sets: 3, reps: 10 },
      { id: "ex-a-2", section_name: "Beta", sets: 3, reps: 12 },
    ],
  };
  const planB = {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "Plan B",
    description: "Second plan",
    exercises: [
      { id: "ex-b-1", section_name: "Gamma", sets: 4, reps: 8 },
    ],
  };

  await page.route(`${apiV1}/auth/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: user }),
    });
  });

  await page.route(`${apiV1}/fitness/plans`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [planA, planB] }),
    });
  });

  await page.route(`${apiV1}/fitness/session-logs/me`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.route(`${apiV1}/chat/threads**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.route(`${apiV1}/support/tickets**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.route(`${apiV1}/lost-found/items**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: [] }),
    });
  });

  await page.route(`${apiV1}/fitness/workout-sessions/active**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: null }),
    });
  });

  let startPayload: { plan_id?: string; section_name?: string | null } | null = null;
  await page.route(`${apiV1}/fitness/workout-sessions/start`, async (route) => {
    startPayload = route.request().postDataJSON() as { plan_id?: string; section_name?: string | null };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          id: "draft-1",
          member_id: user.id,
          plan_id: startPayload?.plan_id || planA.id,
          section_name: startPayload?.section_name || null,
          current_exercise_index: 0,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          notes: null,
          entries: [
            {
              id: "entry-1",
              exercise_name: "Example Exercise",
              section_name: startPayload?.section_name || null,
              target_sets: 3,
              target_reps: 10,
              sets_completed: 0,
              reps_completed: 0,
              weight_kg: null,
              notes: null,
              is_pr: false,
              pr_type: null,
              pr_value: null,
              pr_notes: null,
              skipped: false,
              set_details: [],
              completed_at: null,
              order: 0,
            },
          ],
        },
      }),
    });
  });

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.evaluate((nextUser) => {
    window.sessionStorage.setItem("token", "e2e-access-token");
    window.sessionStorage.setItem("refresh_token", "e2e-refresh-token");
    window.localStorage.setItem("user", JSON.stringify(nextUser));
  }, user);

  await page.goto("/dashboard/member/plans", { waitUntil: "networkidle" });

  await expect(page.getByRole("button", { name: "Plan A" })).toBeVisible();
  await page.getByRole("button", { name: "Beta" }).click();
  await page.getByRole("button", { name: "Plan B" }).click();
  await page.getByRole("button", { name: "Start session" }).click();

  await expect.poll(() => startPayload).toEqual({
    plan_id: planB.id,
    section_name: "Gamma",
  });
});
