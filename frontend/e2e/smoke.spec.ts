import { APIRequestContext, expect, test } from '@playwright/test';

const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const apiV1 = apiBase.endsWith('/api/v1') ? apiBase : `${apiBase}/api/v1`;

const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@gym-erp.com';
const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'password123';

async function loginToken(request: APIRequestContext, email: string, password: string): Promise<string> {
    const login = await request.post(`${apiV1}/auth/login`, { data: { email, password } });
    expect(login.ok()).toBeTruthy();
    const body = await login.json();
    return body?.data?.access_token as string;
}

test('login page allows sign in', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email-address', adminEmail);
    await page.fill('#password', adminPassword);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/dashboard/);
});

test('language toggle switches document direction', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.locator('[data-testid="locale-ar"]:visible').first().click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('member create flow (API smoke)', async ({ request }) => {
    const token = await loginToken(request, adminEmail, adminPassword);
    const email = `smoke.member.${Date.now()}@example.com`;
    const res = await request.post(`${apiV1}/auth/register`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { full_name: 'Smoke Member', email, password: 'Temp#12345', role: 'CUSTOMER' },
    });
    expect(res.ok()).toBeTruthy();
});

test('ticket create + admin reply flow (API smoke)', async ({ request }) => {
    const adminToken = await loginToken(request, adminEmail, adminPassword);
    const email = `smoke.ticket.${Date.now()}@example.com`;

    const createCustomer = await request.post(`${apiV1}/auth/register`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { full_name: 'Smoke Ticket Member', email, password: 'Temp#12345', role: 'CUSTOMER' },
    });
    expect(createCustomer.ok()).toBeTruthy();

    const customerToken = await loginToken(request, email, 'Temp#12345');
    const createTicket = await request.post(`${apiV1}/support/tickets`, {
        headers: { Authorization: `Bearer ${customerToken}` },
        data: { subject: 'Smoke ticket', category: 'GENERAL', message: 'Initial message' },
    });
    expect(createTicket.ok()).toBeTruthy();
    const ticketBody = await createTicket.json();
    const ticketId = ticketBody?.data?.id;

    const reply = await request.post(`${apiV1}/support/tickets/${ticketId}/messages`, {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { message: 'Admin reply from smoke test' },
    });
    expect(reply.ok()).toBeTruthy();
});

test('payroll payment flow (API smoke)', async ({ request }) => {
    const token = await loginToken(request, adminEmail, adminPassword);
    const pending = await request.get(`${apiV1}/hr/payrolls/pending?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    expect(pending.ok()).toBeTruthy();
    const pendingBody = await pending.json();
    const item = pendingBody?.data?.[0];

    test.skip(!item || Number(item.pending_amount || 0) <= 0, 'No payable payroll record available');

    const pay = await request.post(`${apiV1}/hr/payrolls/${item.id}/payments`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
            amount: Number(item.pending_amount),
            payment_method: 'CASH',
            description: 'Smoke payroll payment',
        },
    });
    expect(pay.ok()).toBeTruthy();
});
