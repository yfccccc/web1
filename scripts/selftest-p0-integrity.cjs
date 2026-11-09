// Offline API/page regression. No environment files or real database connections are loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {AsyncLocalStorage} = require('node:async_hooks');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename, originalLoad = Module._load;
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true},
}).outputText, filename);
Module._resolveFilename = function(request, ...args) {
  return originalResolve.call(this, request.startsWith('@/') ? path.join(root, request.slice(2)) : request, ...args);
};
let state, txActive = false, failTags = false, failEnterprise = false, staleReviewRead = false, nextId = 0;
let session = {sub: 'member', email: 'test-only', role: 'SUPER_ADMIN', memberType: 'personal', canEditAllContent: true};
const observations = {tagWrites: 0, claims: 0, externalCalls: 0};
const now = new Date('2026-01-01T00:00:00Z');
function reset() {
  state = {articles: new Map(), tags: new Map(), enterprises: new Map(), reviews: new Map(), members: new Map([['member', {id: 'member', memberType: 'personal', name: null}]])};
  failTags = false; failEnterprise = false; staleReviewRead = false;
}
function matches(row, where = {}) {
  if (where.AND && ![].concat(where.AND).every(w => matches(row, w))) return false;
  if (where.OR && !where.OR.some(w => matches(row, w))) return false;
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND' || key === 'OR') return true;
    if (key === 'keywordItems') return (state.tags.get(row.id) || []).some(tag => matches(tag, value.some));
    const actual = row[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('not' in value && actual === value.not) return false;
      if ('in' in value && !value.in.includes(actual)) return false;
      if ('contains' in value && !String(actual || '').includes(value.contains)) return false;
      if ('startsWith' in value && !String(actual || '').startsWith(value.startsWith)) return false;
      return true;
    }
    return value instanceof Date ? actual?.getTime() === value.getTime() : actual === value;
  });
}
const clone = x => x == null ? x : structuredClone(x);
function client(transactional) {
  const write = fn => async input => { assert.equal(transactional, true, 'core writes must use the transaction client'); return fn(input); };
  return {
    article: {
      findUnique: async ({where}) => clone(state.articles.get(where.id)),
      findFirst: async ({where}) => clone([...state.articles.values()].find(row => matches(row, where)) || null),
      findMany: async ({where, take}) => clone([...state.articles.values()].filter(row => matches(row, where)).slice(0, take)),
      count: async ({where} = {}) => [...state.articles.values()].filter(row => matches(row, where)).length,
      create: write(({data}) => { const row = {id: 'created-' + (++nextId), keywords: '', manualKeywords: null, updatedAt: now, ...data}; state.articles.set(row.id, row); return clone(row); }),
      update: write(({where, data}) => { const row = state.articles.get(where.id); assert(row); Object.assign(row, data); return clone(row); }),
    },
    industryWhitelist: {findMany: async () => {
      if (txActive) assert.equal(transactional, true, 'keyword lookup must join the caller transaction');
      return [{word: '图森木作', category: '品牌', weight: 3, synonyms: null, status: true}];
    }},
    newsKeyword: {
      deleteMany: write(({where}) => state.tags.delete(where.newsId)),
      createMany: write(({data}) => { observations.tagWrites++; if (failTags) throw new Error('injected tag persistence failure'); state.tags.set(data[0].newsId, clone(data)); return {count: data.length}; }),
    },
    enterpriseVerification: {
      findUnique: async ({where}) => {const row = clone(state.reviews.get(where.id)); if (row && staleReviewRead) {row.status = 'pending'; row.updatedAt = now;} return row;},
      findUniqueOrThrow: async ({where}) => clone(state.reviews.get(where.id)),
      updateMany: write(({where, data}) => {
        observations.claims++; assert.equal(where.status, 'pending'); assert(where.updatedAt instanceof Date);
        const row = state.reviews.get(where.id); if (!row || !matches(row, where)) return {count: 0};
        Object.assign(row, data, {updatedAt: new Date(now.getTime() + 1)}); return {count: 1};
      }),
      update: write(({where, data}) => {const row = state.reviews.get(where.id); Object.assign(row, data); return clone(row);}),
    },
    enterprise: {
      findUnique: async () => null,
      upsert: write(({where, create, update}) => {
        if (failEnterprise) throw new Error('injected enterprise persistence failure');
        const row = state.enterprises.get(where.memberId) || {id: 'enterprise', ...create};
        Object.assign(row, update); state.enterprises.set(where.memberId, row); return clone(row);
      }),
    },
    member: {
      findUnique: async ({where}) => clone(state.members.get(where.id)),
      update: write(({where, data}) => {const row = state.members.get(where.id); Object.assign(row, data); return clone(row);}),
    },
    tag: {findFirst: async query => {
      if (!query.include) return {label: '木作'};
      const relation = query.include.articles;
      assert(relation.where.article.is, 'tag relation needs a database filter');
      assert(relation.orderBy, 'sort before taking the first 100');
      return {label: '木作', articles: [...state.articles.values()].filter(row => matches(row, relation.where.article.is)).slice(0, relation.take).map(article => ({article}))};
    }},
  };
}
const db = client(false), tx = client(true);
const transactionContext = new AsyncLocalStorage();
let queue = Promise.resolve();
db.$transaction = async run => {
  let release; const previous = queue; queue = new Promise(resolve => {release = resolve;}); await previous;
  const before = clone(state); txActive = true;
  try {return await transactionContext.run(true, () => run(tx));} catch (error) {state = before; throw error;} finally {txActive = false; release();}
};
const external = () => {assert.notEqual(transactionContext.getStore(), true, 'external effects must follow this request commit'); observations.externalCalls++;};
const mocks = {
  'lib/prisma': {prisma: db}, 'lib/session': {getSession: async () => session},
  'lib/app-settings': {isContentReviewRequired: async () => false},
  'lib/operation-log': {writeOperationLog: async () => external()},
  'lib/baidu-submit': {pushApprovedNewsToBaidu: async () => external()},
  'lib/buying-summary': {revalidateBuyingArticlePaths: async () => external()},
  'lib/article-title': {normalizeArticleTitle: title => title.trim(), findDuplicateArticleByTitle: async () => null},
  'lib/slug': {generateUniqueArticleSlug: async () => 'test-slug-' + nextId},
  'lib/article-links': {validateInternalLinks: async () => ({ok: true, broken: []})},
  'lib/member-access-resolver': {
    getEffectiveMemberAccessForMember: async () => ({membershipRule: {label: 'test', canLinkTerms: false, canLinkStandards: false}}),
    findEffectiveCategoryAccess: () => ({enabled: true, annualLimit: null}),
    findEffectiveSubcategoryAccess: () => ({enabled: true, annualLimit: null}),
  },
};
Module._load = function(request, parent, ...rest) {
  if (request === 'next/cache') return {revalidatePath: external};
  const resolved = Module._resolveFilename(request, parent);
  const key = path.relative(root, resolved).replace(/\\/g, '/').replace(/\.tsx?$/, '');
  if (mocks[key]) return mocks[key];
  return originalLoad.call(this, request, parent, ...rest);
};
const {NextRequest} = require('next/server');
const react = require('react'), {renderToStaticMarkup} = require('react-dom/server');
const keywords = require('../lib/news-keywords-v2.ts');
const adminCreate = require('../app/api/admin/articles/route.ts');
const memberCreate = require('../app/api/member/articles/route.ts');
const adminEdit = require('../app/api/admin/articles/[id]/route.ts');
const review = require('../app/api/admin/enterprise-verifications/[id]/route.ts');
const tagPage = require('../app/tags/[type]/[slug]/page.tsx').default;
const keywordPage = require('../app/keyword/[name]/page.tsx').default;
const {getPublishedNewsSubcategoryPage} = require('../lib/news-listing.ts');
const request = (method, body) => new NextRequest('http://localhost/api/test', {method, headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
const payload = {title: '图森木作新闻', content: '<p>图森木作新闻。</p>', categoryHref: '/news', subHref: '/news/trends', manualKeywords: '图森木作', status: 'approved'};
const article = (id, extra = {}) => ({id, title: id, slug: id, status: 'approved', categoryHref: '/news', subHref: '/news/trends', keywords: '图森木作', manualKeywords: null, excerpt: 'test', publishedAt: now, updatedAt: now, authorMemberId: 'member', ...extra});
async function main() {
  reset();
  for (const row of [article('public-news'), article('draft', {status: 'draft'}), article('rejected', {status: 'rejected'}), article('dictionary', {categoryHref: '/dictionary', subHref: '/dictionary/brand-baike'}), article('brand', {categoryHref: '/brands', subHref: '/brands/wood'})]) state.articles.set(row.id, row);
  const result = await keywords.getArticlesByKeyword('图森木作');
  assert.deepEqual(result.items.map(row => row.id), ['public-news']); assert.equal(result.total, 1);
  const trends = await getPublishedNewsSubcategoryPage('trends', 1); assert.deepEqual(trends.items.map(row => row.id), ['public-news']);
  for (const element of [await tagPage({params: Promise.resolve({type: 'industry', slug: 'wood'})}), await keywordPage({params: Promise.resolve({name: '图森木作'})})]) {
    const html = renderToStaticMarkup(element); assert(html.includes('/news/public-news'));
    for (const bad of ['draft', 'rejected', 'dictionary', 'brand']) assert(!html.includes('/news/' + bad));
  }
  console.log('PASS aggregate queries and rendered keyword/tag pages exclude unpublished and foreign sections');
  for (const route of [adminCreate.POST, memberCreate.POST]) {
    reset(); failTags = true; const before = clone(state); const oldError = console.error; console.error = () => {};
    try {const response = await route(request('POST', payload)); assert.equal(response.status, 500);} catch (error) {assert.match(error.message, /injected tag/);} finally {console.error = oldError;}
    assert.deepEqual(state, before, 'creation and keyword failure must roll back together');
    failTags = false; const response = await route(request('POST', payload)); assert.equal(response.status, 200);
    assert.equal(state.articles.size, 1); assert.equal([...state.tags.values()][0][0].keyword, '图森木作');
  }
  reset(); state.articles.set('existing', article('existing', {content: 'old content'})); state.tags.set('existing', [{keyword: 'old tag'}]);
  const beforeEdit = clone(state); failTags = true;
  await assert.rejects(() => adminEdit.PATCH(request('PATCH', {content: '<p>图森木作更新。</p>', manualKeywords: '图森木作'}), {params: Promise.resolve({id: 'existing'})}), /injected tag/);
  assert.deepEqual(state, beforeEdit, 'failed edit must restore old article and old tags');
  failTags = false; assert.equal((await adminEdit.PATCH(request('PATCH', {content: '<p>图森木作更新。</p>', manualKeywords: '图森木作'}), {params: Promise.resolve({id: 'existing'})})).status, 200);
  console.log('PASS admin/member article creation and admin edit are atomic under injected tag failures; successful saves persist tags');
  const seedReview = () => {reset(); state.reviews.set('application', {id: 'application', memberId: 'member', status: 'pending', updatedAt: now, companyName: 'test', companyShortName: 'test', intro: ''});};
  const callReview = action => review.PATCH(request('PATCH', {action}), {params: Promise.resolve({id: 'application'})});
  seedReview(); const adminSession = session; session = null;
  assert.equal((await callReview('approve')).status, 403); session = adminSession;
  reset(); assert.equal((await callReview('approve')).status, 404);
  seedReview(); staleReviewRead = true; state.reviews.get('application').updatedAt = new Date(now.getTime() + 1);
  assert.equal((await callReview('approve')).status, 409, 'an edited pending revision must not be approved using a stale read');
  assert.equal(state.enterprises.size, 0);
  seedReview(); staleReviewRead = true;
  const responses = await Promise.all(Array.from({length: 12}, (_, i) => callReview(i % 2 ? 'reject' : 'approve')));
  assert.equal(responses.filter(r => r.status === 200).length, 1); assert.equal(responses.filter(r => r.status === 409).length, 11);
  assert.equal(state.reviews.get('application').status, 'approved'); assert.equal(state.enterprises.size, 1);
  seedReview(); failEnterprise = true; const beforeReview = clone(state);
  await assert.rejects(() => callReview('approve'), /injected enterprise/); assert.deepEqual(state, beforeReview);
  seedReview(); assert.equal((await callReview('reject')).status, 200); assert.equal(state.reviews.get('application').status, 'rejected'); assert.equal(state.enterprises.size, 0);
  console.log('PASS pending revision compare-and-set: one winner, 11 conflicts; downstream approval failure rolls back claim; rejection is atomic');
  assert(observations.tagWrites >= 6); assert(observations.claims >= 14);
  console.log('P0 integrity regression passed (in-memory transaction adapter; no real PostgreSQL locks were exercised).');
}
main().catch(error => {console.error(error); process.exitCode = 1;});
