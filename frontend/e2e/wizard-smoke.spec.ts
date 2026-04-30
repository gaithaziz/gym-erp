import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const apiV1 = apiBase.endsWith('/api/v1') ? apiBase : `${apiBase}/api/v1`;

const adminUser = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'wizard.admin@gym.com',
    full_name: 'Wizard Admin',
    role: 'ADMIN',
    gym_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    home_branch_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    is_active: true,
    session_version: 1,
    subscription_status: 'ACTIVE',
};

const branches = [
    {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        name: 'Central Branch',
        display_name: 'Central Branch',
        gym_name: 'Gym ERP',
    },
    {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        name: 'North Branch',
        display_name: 'North Branch',
        gym_name: 'Gym ERP',
    },
];

const staffRows = [
    {
        id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        full_name: 'Nadia Coach',
        email: 'nadia.coach@example.com',
        role: 'COACH',
        profile_picture_url: null,
        contract: {
            type: 'FULL_TIME',
            base_salary: 2200,
            commission_rate: 0,
            start_date: '2026-01-01',
            end_date: null,
            standard_hours: 160,
        },
    },
];

const members = [
    {
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        full_name: 'Mina Member',
        email: 'mina.member@example.com',
        role: 'CUSTOMER',
        home_branch_id: branches[0].id,
        subscription: {
            status: 'ACTIVE',
            end_date: '2026-05-30',
        },
    },
];

const payrollResult = {
    id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    user_id: staffRows[0].id,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    base_pay: 2200,
    overtime_pay: 0,
    leave_deductions: 75,
    manual_deductions: 25,
    deductions: 100,
    total_pay: 2100,
    status: 'DRAFT',
};

async function loginViaUi(page: Page) {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.fill('#email-address', 'admin@gym-erp.com');
    await page.fill('#password', 'GymPass123!');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/dashboard/);
}

async function setupRoutes(page: Page) {
    await page.route('**/auth/me', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: adminUser }),
        });
    });

    await page.route('**/hr/branches', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: branches }),
        });
    });

    await page.route('**/hr/staff**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: staffRows }),
        });
    });

    await page.route('**/hr/members**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: members }),
        });
    });

    await page.route('**/fitness/plan-summaries**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [] }),
        });
    });

    await page.route('**/fitness/diet-summaries**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ data: [] }),
        });
    });

    await page.route('**/hr/payroll/generate', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                message: 'Payroll generated',
                data: payrollResult,
            }),
        });
    });
}

test('staff payroll wizard keeps the summary compact', async ({ page }) => {
    await setupRoutes(page);
    await loginViaUi(page);

    await page.goto('/dashboard/admin/staff', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /payroll/i }).first()).toBeVisible();

    await page.getByRole('button', { name: /payroll/i }).first().click();
    const payrollDialog = page.getByRole('dialog', { name: /generate payroll/i });
    await expect(payrollDialog).toBeVisible();
    await expect(payrollDialog.getByText(/month/i)).toBeVisible();
    await expect(payrollDialog.getByText(/year/i)).toBeVisible();

    await payrollDialog.getByRole('button', { name: /generate|إنشاء/i }).click();

    await expect(page.getByText(/payroll generated successfully/i)).toBeVisible();
    await expect(page.getByText(/deductions/i).first()).toBeVisible();
    await expect(page.getByText(/net pay/i).first()).toBeVisible();
    await expect(page.getByText('2100.00 JOD').first()).toBeVisible();

    const outputDir = join(process.cwd(), 'test-results', 'wizard-smoke');
    await mkdir(outputDir, { recursive: true });
    await page.screenshot({ path: join(outputDir, 'staff-payroll.png'), fullPage: true });
});

test('member wizard stays branch-first and reveals the password cleanly', async ({ page }) => {
    await setupRoutes(page);
    await loginViaUi(page);

    await page.goto('/dashboard/admin/members', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /add.*member|register new member/i })).toBeVisible();

    await page.getByRole('button', { name: /add.*member|register new member/i }).click();
    const memberDialog = page.getByRole('dialog', { name: /register new member/i });
    await expect(memberDialog).toBeVisible();
    await expect(memberDialog.getByText(/you must choose a branch before registering the member/i)).toBeVisible();

    await memberDialog.getByRole('button', { name: /next/i }).click();
    await expect(memberDialog.getByText(/go back if you need to change the branch before saving/i)).toBeVisible();

    const passwordField = page.locator('input[type="password"]').first();
    await expect(passwordField).toBeVisible();
    await page.getByLabel(/show password/i).click();
    await expect(page.locator('input[type="text"]').first()).toBeVisible();

    const outputDir = join(process.cwd(), 'test-results', 'wizard-smoke');
    await mkdir(outputDir, { recursive: true });
    await page.screenshot({ path: join(outputDir, 'member-wizard.png'), fullPage: true });
});
