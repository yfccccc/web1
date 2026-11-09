// Explicit production smoke test: creates one temporary MEMBER, never an administrator.
// Run from /home/web1 only after the deployment has been authorized.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
assert.equal(process.cwd(), '/home/web1');
const { createRequire } = require('node:module');
const requireApp = createRequire('/home/web1/package.json');
const bcrypt = requireApp('bcryptjs');
const { PrismaClient } = requireApp('@prisma/client');
const envText = fs.readFileSync('/home/web1/.env', 'utf8');
const line = envText.split(/\r?\n/).find(line => line.trim().startsWith('DATABASE_URL='));
const databaseUrl = line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
const url = new URL(databaseUrl);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '5432');
assert.equal(url.pathname, '/web1');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const origin = 'https://cnzhengmu.com';
const email = `codex-verification-probe-${randomUUID()}`;
const password = randomBytes(32).toString('hex');
let testMember;
const result = { origin, startedAt: new Date().toISOString(), checks: [] };
const release = fs.readFileSync('/home/web1/.codex-releases/enterprise-current.txt', 'utf8').trim();
assert.equal(path.dirname(release), '/home/web1/.codex-releases');
async function snapshot() {
  return db.$queryRaw`
    SELECT a.id, a."authorMemberId", a.status, a.title, md5(a.content) AS content_hash,
           a."displayAuthor", a."coverImage", a."updatedAt"
    FROM articles a WHERE a."authorMemberId" IN (
      'cmn5mtlef00vdaenp67lo201r','cmnck50950000p1d28k7o2713','cmpcbf9d203w6nagrxepcthnn',
      'cmse7eydp0add105w7mdf45h5','cmsfejajd0aw1105whw7rdn6q') ORDER BY a.id`;
}
async function main() {
  const target = await db.enterprise.findUniqueOrThrow({
    where: { licenseCode: '91440300593008744E' },
    select: { id: true, memberId: true, companyName: true, verificationStatus: true, licenseCode: true, updatedAt: true },
  });
  assert.equal(target.verificationStatus, 'approved');
  const before = await snapshot();
  testMember = await db.member.create({ data: {
    email, name: '部署验收临时账号', passwordHash: await bcrypt.hash(password, 10),
    role: 'MEMBER', memberType: 'enterprise_basic', accountStatus: 'active',
  }, select: { id: true, email: true } });
  const login = await fetch(`${origin}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ account: email, password }), signal: AbortSignal.timeout(20000),
  });
  assert.equal(login.status, 200, 'Temporary account login failed');
  const match = (login.headers.get('set-cookie') || '').match(/(?:^|[ ,])auth=([^;]+)/);
  assert(match, 'Auth cookie missing');
  const cookie = `auth=${match[1]}`;
  const body = {
    companyName: target.companyName, accountName: email,
    contactPerson: '部署验收（应被拦截）', contactPhone: '13800138000',
    licenseImageUrl: '/icon.png', licenseCode: target.licenseCode,
    address: '广东省深圳市南山区测试路1号',
  };
  const responses = await Promise.all(Array.from({ length: 3 }, async () => {
    const response = await fetch(`${origin}/api/member/enterprise-verification`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    return { status: response.status, body: data };
  }));
  result.responses = responses;
  for (const response of responses) {
    assert.equal(response.status, 409);
    assert.deepEqual(response.body, { error: '该统一社会信用代码已被注册，请勿重复提交' });
  }
  result.checks.push('Three real public HTTPS submissions returned exact Chinese HTTP 409');
  const applicationCount = await db.enterpriseVerification.count({ where: { memberId: testMember.id } });
  const enterpriseCount = await db.enterprise.count({ where: { memberId: testMember.id } });
  assert.equal(applicationCount, 0); assert.equal(enterpriseCount, 0);
  result.testApplicationsCreated = applicationCount; result.testEnterprisesCreated = enterpriseCount;
  const afterTarget = await db.enterprise.findUniqueOrThrow({ where: { id: target.id },
    select: { id: true, memberId: true, companyName: true, verificationStatus: true, licenseCode: true, updatedAt: true } });
  assert.deepEqual(afterTarget, target);
  assert.deepEqual(await snapshot(), before);
  result.checks.push('Existing approved enterprise unchanged', `${before.length} A/B account articles unchanged`);
  result.passed = true;
}
main().catch(error => {
  result.passed = false;
  // Never print credentials or the auth cookie.
  result.failure = error.message;
  process.exitCode = 1;
}).finally(async () => {
  try {
    if (testMember) {
      const m = await db.member.findUniqueOrThrow({ where: { id: testMember.id }, select: { id: true, email: true, role: true } });
      assert.equal(m.email, email); assert.equal(m.role, 'MEMBER');
      assert.equal(await db.article.count({ where: { authorMemberId: m.id } }), 0);
      assert.equal(await db.galleryImage.count({ where: { authorMemberId: m.id } }), 0);
      assert.equal(await db.enterprise.count({ where: { memberId: m.id } }), 0);
      const deleted = await db.member.deleteMany({ where: { id: m.id, email, role: 'MEMBER' } });
      assert.equal(deleted.count, 1);
      assert.equal(await db.member.count({ where: { id: m.id } }), 0);
      result.temporaryAccountRemoved = true;
    }
  } catch (error) {
    result.passed = false; result.cleanupFailure = error.message;
    result.testMemberId = testMember?.id; process.exitCode = 1;
  }
  result.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(release, 'production-smoke-results.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await db.$disconnect();
});
