const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const { SignJWT } = require('jose');
const { chromium, expect: baseExpect } = require('@playwright/test');
const expect = baseExpect.configure({ timeout: 60000 });
const url = new URL(process.env.DATABASE_URL || 'http://missing');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55439');
assert.equal(url.pathname, '/enterprise_verification_test');
const db = new PrismaClient();
let browser;
async function main() {
  const suffix = Date.now();
  const admin = await db.member.create({ data: { email: `ui-admin-${suffix}`, passwordHash: 'test-only', role: 'SUPER_ADMIN', accountStatus: 'active' } });
  const member = await db.member.create({ data: { email: `ui-enterprise-${suffix}`, name: '不应显示为提交账号的企业名', passwordHash: 'test-only', role: 'MEMBER', memberType: 'enterprise_basic', accountStatus: 'pending_review' } });
  const v = await db.enterpriseVerification.create({ data: {
    memberId: member.id, companyName: '本地界面测试企业', accountName: member.email,
    accountPassword: '[removed]', contactPerson: '测试', contactPhone: '13800138000',
    licenseImageUrl: '/icon.png', licenseCode: `UI-${suffix}`, address: '广东省深圳市南山区测试路1号',
  } });
  const token = await new SignJWT({ sub: admin.id, email: admin.email, role: 'SUPER_ADMIN', adminSessionVersion: 1 })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode('enterprise-verification-local-test-secret-only'));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: 'auth', value: token, domain: '127.0.0.1', path: '/', httpOnly: true }]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(60000);
  await page.goto('http://127.0.0.1:3109/membership/admin/accounts', { timeout: 120000 });
  const row = page.getByRole('row').filter({ hasText: member.email });
  const link = row.getByRole('link', { name: '去审核资质' });
  await expect(link).toHaveAttribute('href', `/membership/admin/enterprise-verifications/${v.id}`);
  await page.screenshot({ path: 'artifacts/enterprise-verification-fix/accounts.png', fullPage: true });
  await link.click();
  await expect(page.getByRole('heading', { name: '企业资质审核详情' })).toBeVisible();
  await expect(page.getByText(`提交账号：${member.email} / enterprise_basic`)).toBeVisible();
  await expect(page.getByText('不应显示为提交账号的企业名')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/enterprise-verification-fix/detail-pending.png', fullPage: true });
  await page.getByRole('button', { name: '通过并生成详情页' }).click();
  await expect(page.getByText('审核通过，账号已激活。')).toBeVisible();
  await expect(page.getByRole('button', { name: '通过并生成详情页' })).toHaveCount(0);
  assert.equal((await db.member.findUniqueOrThrow({ where: { id: member.id } })).accountStatus, 'active');
  await page.reload();
  await expect(page.getByText('已通过', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/enterprise-verification-fix/detail-approved.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/enterprise-verification-fix/detail-mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  const result = { passed: ['account link targets exact application', 'submitter renders login email, not display name', 'real HTTP approval activates account', 'reload retains approval and hides review buttons', 'no browser runtime errors'], at: new Date().toISOString() };
  fs.writeFileSync('artifacts/enterprise-verification-fix/ui-test-results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); await db.$disconnect(); });
