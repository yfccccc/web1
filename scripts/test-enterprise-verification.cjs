// Run only against the disposable local PostgreSQL instance; never load .env.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const url = new URL(process.env.DATABASE_URL || 'http://missing');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55439');
assert.equal(url.pathname, '/enterprise_verification_test');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename);
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(request, ...args) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
};
let session = null;
const originalLoad = Module._load;
Module._load = function(request, ...args) {
  if (request === '@/lib/session') return { getSession: async () => session };
  return originalLoad.call(this, request, ...args);
};
const { prisma: db } = require('../lib/prisma.ts');
const submit = require('../app/api/member/enterprise-verification/route.ts');
const review = require('../app/api/admin/enterprise-verifications/[id]/route.ts');
const accounts = require('../app/api/admin/members/route.ts');
const { NextRequest } = require('next/server');
const { submitEnterpriseVerification, reviewEnterpriseVerification, DUPLICATE_LICENSE } = require('../lib/enterprise-verification-workflow.ts');
const results = [];
const runId = Date.now().toString(36);
const baseCode = ('91' + Date.now().toString().padStart(15, '0')).slice(0, 17);
const charset = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
const validCode = baseCode + charset[(31 - [...baseCode].reduce((sum, c, i) => sum + charset.indexOf(c) * weights[i], 0) % 31) % 31];
const params = id => ({ params: Promise.resolve({ id }) });
const request = (method, body) => new NextRequest('http://localhost/api/test', {
  method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
});
const payload = (code = validCode) => ({
  companyName: '测试企业', accountName: 'test-account', accountPassword: '[removed]',
  contactPerson: '测试联系人', contactPhone: '13800138000', licenseImageUrl: '/test.png',
  licenseCode: code.endsWith('-CODE') ? `${code}-${runId}`.toUpperCase() : code, address: '广东省深圳市南山区测试路1号',
});
async function member(label) {
  return db.member.create({ data: { email: `verification-${runId}-${label}`, passwordHash: 'test-only',
    memberType: 'enterprise_basic', role: 'MEMBER', accountStatus: 'pending_review', name: '企业展示名称' } });
}
async function test(name, fn) { await fn(); results.push(name); console.log('PASS', name); }
function login(m) { session = { sub: m.id, email: m.email, role: m.role, memberType: m.memberType }; }
async function main() {
  const admin = await member('admin'); admin.role = 'SUPER_ADMIN';
  const a = await member('a');
  let application;
  await test('unauthenticated and non-admin detail/review requests are denied', async () => {
    session = null;
    assert.equal((await review.GET(request('GET'), params('missing'))).status, 403);
    assert.equal((await review.PATCH(request('PATCH', { action: 'approve' }), params('missing'))).status, 403);
    assert.equal((await submit.POST(request('POST', payload()))).status, 401);
    login(a);
    assert.equal((await review.GET(request('GET'), params('missing'))).status, 403);
  });
  await test('12 concurrent submissions create exactly one pending application', async () => {
    login(a);
    const responses = await Promise.all(Array.from({ length: 12 }, () => submit.POST(request('POST', payload()))));
    assert(responses.every(r => r.status === 200));
    const rows = await db.enterpriseVerification.findMany({ where: { memberId: a.id } });
    assert.equal(rows.length, 1); application = rows[0];
  });
  await test('cross-account pending credit code is rejected (including normalized input)', async () => {
    const b = await member('b'); login(b);
    const response = await submit.POST(request('POST', payload(` ${validCode.toLowerCase()} `)));
    assert.equal(response.status, 409);
    assert.equal(await db.enterpriseVerification.count({ where: { memberId: b.id } }), 0);
  });
  await test('approval atomically activates account; duplicate concurrent approvals conflict', async () => {
    login(admin);
    const responses = await Promise.all(Array.from({ length: 8 }, () => review.PATCH(request('PATCH', { action: 'approve' }), params(application.id))));
    assert.equal(responses.filter(r => r.status === 200).length, 1);
    assert.equal(responses.filter(r => r.status === 409).length, 7);
    const m = await db.member.findUniqueOrThrow({ where: { id: a.id } });
    const e = await db.enterprise.findUniqueOrThrow({ where: { memberId: a.id } });
    const v = await db.enterpriseVerification.findUniqueOrThrow({ where: { id: application.id } });
    assert.equal(m.accountStatus, 'active'); assert(m.reviewedAt);
    assert.equal(e.verificationStatus, 'approved'); assert.equal(v.status, 'approved');
    assert.equal(v.approvedEnterpriseId, e.id);
  });
  await test('approved member cannot resubmit, even with invalid body', async () => {
    login(a);
    const response = await submit.POST(request('POST', {}));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, '您已成功完成企业认证，无需重复提交');
    assert.equal(await db.enterpriseVerification.count({ where: { memberId: a.id } }), 1);
  });
  await test('cross-account approved enterprise code is rejected', async () => {
    const b = await member('approved-conflict'); login(b);
    const response = await submit.POST(request('POST', payload()));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, DUPLICATE_LICENSE);
  });
  await test('real database P2002 is mapped to friendly HTTP 409 by submission and review endpoints', async () => {
    const b = await member('p2002');
    let conflict;
    try {
      await db.enterprise.create({ data: { memberId: b.id, licenseCode: validCode } });
    } catch (error) { conflict = error; }
    assert.equal(conflict?.code, 'P2002');
    assert.equal(await db.enterprise.count({ where: { memberId: b.id } }), 0);
    const transaction = db.$transaction;
    // Feed the genuine database exception to each HTTP handler's transaction boundary.
    db.$transaction = async () => { throw conflict; };
    try {
      login(b);
      const submission = await submit.POST(request('POST', payload()));
      assert.equal(submission.status, 409);
      assert.deepEqual(await submission.json(), { error: DUPLICATE_LICENSE });
      login(admin);
      const approval = await review.PATCH(request('PATCH', { action: 'approve' }), params(application.id));
      assert.equal(approval.status, 409);
      assert.deepEqual(await approval.json(), { error: DUPLICATE_LICENSE });
    } finally { db.$transaction = transaction; }
  });
  await test('detail endpoint handles 404 and excludes passwords', async () => {
    login(admin);
    assert.equal((await review.GET(request('GET'), params('missing'))).status, 404);
    const response = await review.GET(request('GET'), params(application.id));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.member.email, a.email);
    assert(!('accountPassword' in data)); assert(!('passwordHash' in data.member));
  });
  await test('member list links to pending application before newer reviewed history', async () => {
    const b = await member('list');
    const pending = await db.enterpriseVerification.create({ data: { ...payload('LIST-CODE'), memberId: b.id } });
    await db.enterpriseVerification.create({ data: { ...payload('LIST-CODE'), memberId: b.id, status: 'rejected', createdAt: new Date(Date.now() + 1000) } });
    login(admin);
    const response = await accounts.GET(new NextRequest(`http://localhost/api/admin/members?q=${b.email}`));
    assert.equal((await response.json()).items[0].verificationId, pending.id);
  });
  await test('failed account activation rolls back enterprise and application approval', async () => {
    const b = await member('rollback');
    const v = await submitEnterpriseVerification(db, b.id, payload('ROLLBACK-CODE'));
    await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION test_activation_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.email LIKE '%-rollback' AND NEW."accountStatus" = 'active' THEN RAISE EXCEPTION 'injected activation failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER test_activation_failure BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION test_activation_failure()');
    try {
      await assert.rejects(reviewEnterpriseVerification(db, { id: v.id, action: 'approve', reviewNote: null, reviewerId: admin.id }));
      assert.equal(await db.enterprise.count({ where: { memberId: b.id } }), 0);
      assert.equal((await db.enterpriseVerification.findUniqueOrThrow({ where: { id: v.id } })).status, 'pending');
      assert.equal((await db.member.findUniqueOrThrow({ where: { id: b.id } })).accountStatus, 'pending_review');
    } finally { await db.$executeRawUnsafe('DROP TRIGGER test_activation_failure ON members'); }
  });
  await test('submission racing approval never leaves a new pending application', async () => {
    const b = await member('race');
    const v = await submitEnterpriseVerification(db, b.id, payload('RACE-CODE'));
    const outcomes = await Promise.allSettled([
      reviewEnterpriseVerification(db, { id: v.id, action: 'approve', reviewNote: null, reviewerId: admin.id }),
      ...Array.from({ length: 8 }, () => submitEnterpriseVerification(db, b.id, payload('RACE-CODE'))),
    ]);
    assert.equal(outcomes[0].status, 'fulfilled');
    assert.equal(await db.enterpriseVerification.count({ where: { memberId: b.id } }), 1);
    assert.equal(await db.enterpriseVerification.count({ where: { memberId: b.id, status: 'pending' } }), 0);
    assert.equal((await db.member.findUniqueOrThrow({ where: { id: b.id } })).accountStatus, 'active');
  });
  await test('concurrent different accounts claiming same code yield one pending owner', async () => {
    const members = await Promise.all(Array.from({ length: 6 }, (_, i) => member(`cross-${i}`)));
    const responses = await Promise.allSettled(members.map(m => submitEnterpriseVerification(db, m.id, payload('CROSS-CODE'))));
    assert.equal(responses.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(await db.enterpriseVerification.count({ where: { licenseCode: `CROSS-CODE-${runId}`.toUpperCase() } }), 1);
  });
  await test('historical pending application cannot approve a code owned by another account', async () => {
    const b = await member('historical');
    const v = await db.enterpriseVerification.create({ data: { ...payload(), memberId: b.id } });
    login(admin);
    assert.equal((await review.PATCH(request('PATCH', { action: 'approve' }), params(v.id))).status, 409);
    assert.equal(await db.enterprise.count({ where: { memberId: b.id } }), 0);
    assert.equal((await db.member.findUniqueOrThrow({ where: { id: b.id } })).accountStatus, 'pending_review');
    assert.equal((await review.PATCH(request('PATCH', { action: 'reject', reviewNote: 'duplicate' }), params(v.id))).status, 200);
    assert.equal((await db.enterpriseVerification.findUniqueOrThrow({ where: { id: v.id } })).status, 'rejected');
  });
  fs.writeFileSync(path.join(root, 'artifacts/enterprise-verification-fix/test-results.json'), JSON.stringify({ at: new Date().toISOString(), database: '127.0.0.1:55439/enterprise_verification_test', passed: results }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
