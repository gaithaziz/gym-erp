import { expect, test } from "@playwright/test";

test("login page exposes the password recovery entry point", async ({ page }) => {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /forgot password/i })).toBeVisible();

  await page.getByRole("link", { name: /forgot password/i }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: /reset your password/i })).toBeVisible();
});

test("password reset request and confirm pages work with mocked API responses", async ({ page }) => {
  const requestBodies: Array<{ email?: string }> = [];
  const confirmBodies: Array<{ token?: string; new_password?: string }> = [];

  await page.route("**/api/v1/auth/password-reset/request", async (route) => {
    const body = route.request().postDataJSON() as { email?: string };
    requestBodies.push(body);
    const found = body.email === "reset@example.com";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { account_found: found },
        message: found
          ? "An account was found for that email. A password reset link has been sent."
          : "No account was found for that email.",
      }),
    });
  });

  await page.route("**/api/v1/auth/password-reset/confirm", async (route) => {
    const body = route.request().postDataJSON() as { token?: string; new_password?: string };
    confirmBodies.push(body);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "Password reset successfully. Please sign in again." }),
    });
  });

  await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).fill("reset@example.com");
  await page.getByRole("button", { name: /send reset link/i }).click();

  await expect(page.getByText(/account found/i)).toBeVisible();
  await expect(page.getByText(/check your inbox and spam folder/i)).toBeVisible();
  expect(requestBodies).toEqual([{ email: "reset@example.com" }]);

  await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).fill("missing@example.com");
  await page.getByRole("button", { name: /send reset link/i }).click();

  await expect(page.getByText(/no account found/i)).toBeVisible();
  await expect(page.getByText(/check the address and try again/i)).toBeVisible();

  await page.goto("/reset-password?token=test-token-123", { waitUntil: "domcontentloaded" });
  await page.getByLabel(/new password/i).fill("NewPass#456");
  await page.getByLabel(/confirm password/i).fill("NewPass#456");
  await page.getByRole("button", { name: /reset password/i }).click();

  await expect(page.getByText(/password reset successfully/i)).toBeVisible();
  expect(confirmBodies).toEqual([{ token: "test-token-123", new_password: "NewPass#456" }]);
});
