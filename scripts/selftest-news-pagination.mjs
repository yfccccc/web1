import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // Environment may already be supplied by the caller.
}

const prisma = new PrismaClient();
const baseUrl = process.env.NEWS_PAGINATION_TEST_BASE_URL || "http://localhost:3104";
const batch = `pagination-selftest-${Date.now()}`;
const pageSize = 20;

assert.equal(
  (process.env.BAIDU_PUSH_TOKEN ?? "").trim(),
  "",
  "Run both the test server and this script with BAIDU_PUSH_TOKEN disabled; the publish check must not submit temporary URLs.",
);

function newsWhere(extra = {}) {
  return {
    AND: [
      {
        OR: [
          { categoryHref: "/news" },
          { categoryHref: { startsWith: "/news/" } },
          { subHref: "/news" },
          { subHref: { startsWith: "/news/" } },
        ],
      },
      extra,
    ],
  };
}

async function makeAdminCookie() {
  const admin = await prisma.member.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true, email: true, role: true },
  });
  assert(admin, "A SUPER_ADMIN account is required for the pagination self-test");
  const configured = process.env.JWT_SECRET?.trim() || "";
  const secret = configured.length >= 32 ? configured : "dev-secret-change-in-development-only";
  const token = await new SignJWT({
    sub: admin.id,
    email: admin.email,
    role: admin.role,
    adminSessionVersion: 1,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(new TextEncoder().encode(secret));
  return `auth=${token}`;
}

async function fetchAdmin(path, cookie, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { cookie, ...(init?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.ok, true, `${path} returned ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

async function fetchPublicPage(path) {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200, `${path} returned ${response.status}`);
  const html = await response.text();
  const links = [...html.matchAll(/href="(\/news\/[^"]+)"/g)].map((match) => match[1].replace(/&amp;/g, "&"));
  return new Set(
    links
      .filter((href) => !/^\/news\/(?:all|trends|enterprise|tech|events|aftermarket)(?:\?|$)/.test(href))
      .map((href) => decodeURIComponent(href.slice("/news/".length).split("?")[0])),
  );
}

async function collectAdminIds(query, expectedTotal, cookie) {
  const ids = new Set();
  const totalPages = Math.max(1, Math.ceil(expectedTotal / pageSize));
  for (let page = 1; page <= totalPages; page += 1) {
    const data = await fetchAdmin(`/api/admin/articles?limit=${pageSize}&page=${page}&${query}`, cookie);
    assert.equal(data.total, expectedTotal);
    assert.equal(data.totalPages, totalPages);
    assert.equal(data.page, page);
    for (const item of data.items) {
      assert.equal(ids.has(item.id), false, `duplicate admin article ${item.id}`);
      ids.add(item.id);
    }
  }
  return ids;
}

async function collectPublicSlugs(path, expectedTotal) {
  const slugs = new Set();
  const totalPages = Math.max(1, Math.ceil(expectedTotal / pageSize));
  for (let page = 1; page <= totalPages; page += 1) {
    const pageSlugs = await fetchPublicPage(`${path}${page === 1 ? "" : `?page=${page}`}`);
    for (const slug of pageSlugs) {
      assert.equal(slugs.has(slug), false, `duplicate public article ${slug} on ${path}`);
      slugs.add(slug);
    }
  }
  return slugs;
}

async function counts() {
  const [all, approved, pending, draft, trendsApproved] = await Promise.all([
    prisma.article.count({ where: newsWhere() }),
    prisma.article.count({ where: newsWhere({ status: "approved" }) }),
    prisma.article.count({ where: newsWhere({ status: "pending" }) }),
    prisma.article.count({ where: newsWhere({ status: "draft" }) }),
    prisma.article.count({ where: newsWhere({ status: "approved", subHref: "/news/trends" }) }),
  ]);
  return { all, approved, pending, draft, trendsApproved };
}

let cookie = "";
let baselineCounts = null;
try {
  await fetch(`${baseUrl}/news/all`).then((response) => assert.equal(response.status, 200));
  cookie = await makeAdminCookie();
  baselineCounts = await counts();

  const now = Date.now();
  const rows = [];
  for (let index = 0; index < 45; index += 1) {
    rows.push({
      title: `[pagination selftest] approved ${batch} ${index}`,
      slug: `${batch}-approved-${index}`,
      content: `<p>pagination approved ${index}</p>`,
      categoryHref: "/news",
      subHref: "/news/trends",
      status: "approved",
      publishedAt: new Date(now - index * 1000),
      generationBatchId: batch,
    });
  }
  for (let index = 0; index < 25; index += 1) {
    rows.push({
      title: `[pagination selftest] pending ${batch} ${index}`,
      slug: `${batch}-pending-${index}`,
      content: `<p>pagination pending ${index}</p>`,
      categoryHref: "/news",
      subHref: "/news/trends",
      status: "pending",
      generationBatchId: batch,
    });
  }
  for (let index = 0; index < 22; index += 1) {
    rows.push({
      title: `[pagination selftest] draft ${batch} ${index}`,
      slug: `${batch}-draft-${index}`,
      content: `<p>pagination draft ${index}</p>`,
      categoryHref: "/news",
      subHref: "/news/trends",
      status: "draft",
      generationBatchId: batch,
    });
  }
  await prisma.article.createMany({ data: rows });

  const beforePublish = await counts();
  const expectedApproved = await prisma.article.findMany({
    where: newsWhere({ status: "approved" }),
    select: { id: true, slug: true },
  });
  const allAdminIds = await collectAdminIds("tab=articles", beforePublish.all, cookie);
  assert.equal(allAdminIds.size, beforePublish.all);
  assert.equal((await collectAdminIds("tab=articles&status=approved", beforePublish.approved, cookie)).size, beforePublish.approved);
  assert.equal((await collectAdminIds("tab=articles&status=pending", beforePublish.pending, cookie)).size, beforePublish.pending);
  assert.equal((await collectAdminIds("tab=articles&status=draft", beforePublish.draft, cookie)).size, beforePublish.draft);
  assert.equal(
    (await collectAdminIds("tab=articles&subHref=%2Fnews%2Ftrends", await prisma.article.count({ where: newsWhere({ subHref: "/news/trends" }) }), cookie)).size,
    await prisma.article.count({ where: newsWhere({ subHref: "/news/trends" }) }),
  );

  const publicAll = await collectPublicSlugs("/news/all", beforePublish.approved);
  assert.deepEqual(publicAll, new Set(expectedApproved.map((item) => item.slug)));
  const publicTrends = await collectPublicSlugs("/news/trends", beforePublish.trendsApproved);
  const trendSlugs = await prisma.article.findMany({
    where: newsWhere({ status: "approved", subHref: "/news/trends" }),
    select: { slug: true },
  });
  assert.deepEqual(publicTrends, new Set(trendSlugs.map((item) => item.slug)));

  const pendingTarget = await prisma.article.findFirstOrThrow({ where: { generationBatchId: batch, status: "pending" } });
  await fetchAdmin(`/api/admin/articles/${pendingTarget.id}`, cookie, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "approved" }),
  });
  const afterPublish = await counts();
  assert.equal(afterPublish.approved, beforePublish.approved + 1);
  assert.equal(afterPublish.pending, beforePublish.pending - 1);
  assert.equal((await fetchAdmin("/api/admin/articles?tab=articles&status=approved&limit=20&page=1", cookie)).total, afterPublish.approved);
  assert.equal((await collectPublicSlugs("/news/all", afterPublish.approved)).has(pendingTarget.slug), true);

  await fetchAdmin(`/api/admin/articles/${pendingTarget.id}`, cookie, { method: "DELETE" });
  const afterDelete = await counts();
  assert.equal(afterDelete.approved, beforePublish.approved);
  assert.equal((await fetchAdmin("/api/admin/articles?tab=articles&status=approved&limit=20&page=1", cookie)).total, beforePublish.approved);
  assert.equal((await collectPublicSlugs("/news/all", afterDelete.approved)).has(pendingTarget.slug), false);

  const adminPage = await fetch(`${baseUrl}/membership/admin/content?mode=manage&tab=articles&page=2&status=approved&subHref=%2Fnews%2Ftrends`, {
    headers: { cookie },
  });
  assert.equal(adminPage.status, 200);

  console.log(JSON.stringify({ ok: true, batch, beforePublish, afterPublish, afterDelete }, null, 2));
} finally {
  const testArticleIds = await prisma.article.findMany({
    where: { generationBatchId: batch },
    select: { id: true },
  });
  if (testArticleIds.length > 0) {
    await prisma.operationLog.deleteMany({
      where: { targetId: { in: testArticleIds.map((item) => item.id) } },
    });
  }
  await prisma.article.deleteMany({ where: { generationBatchId: batch } });
  if (baselineCounts) {
    const restoredCounts = await counts();
    assert.deepEqual(restoredCounts, baselineCounts, "self-test data cleanup did not restore the original counts");
    console.log(JSON.stringify({ cleanupRestored: true, restoredCounts }, null, 2));
  }
  await prisma.$disconnect();
}
