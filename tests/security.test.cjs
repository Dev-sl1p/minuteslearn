const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource } = require('./load-source.cjs');
const zod = require('zod');
const next = { NextResponse: class extends Response { static json(body, init) { return Response.json(body, init); } } };

function licenseLogin({ existing = null, account = null, redeem = { ok: true, course: { id: 'course' } } } = {}) {
  const state = { created: 0, cleaned: 0 };
  const learner = { id: 'new', email: 'student@example.invalid', role: 'USER' };
  const source = loadSource('src/lib/license-login.ts', {
    '@/lib/db': { prisma: {
      license: { findFirst: async () => existing },
      user: { findUnique: async () => account, create: async () => { state.created++; return learner; }, findUniqueOrThrow: async () => learner, deleteMany: async () => { state.cleaned++; } },
    } },
    '@/lib/wp-license': { validateLicense: async () => ({ key: 'valid-key', status: 'active', customerEmail: null }) },
    '@/lib/redeem': { redeemLicenseKey: async () => redeem },
    '@/lib/license-status': { refreshLicenseStatus: async () => true },
  });
  return { state, login: () => source.loginWithEmailAndLicense({ email: learner.email, licenseKey: 'valid-key' }) };
}

test('an unbound key cannot enter an existing admin or learner account when purchaser email is absent', async () => {
  for (const role of ['ADMIN', 'USER']) {
    const { state, login } = licenseLogin({ account: { id: 'existing', role } });
    assert.equal((await login()).ok, false);
    assert.equal(state.created, 0);
  }
});
test('a key previously bound to an admin cannot authenticate the admin', async () => {
  const { login } = licenseLogin({ existing: { status: 'ACTIVE', user: { email: 'student@example.invalid', role: 'ADMIN' } } });
  assert.equal((await login()).ok, false);
});
test('expired local keys are rejected before authentication', async () => {
  const { login } = licenseLogin({ existing: { status: 'ACTIVE', expiresAt: new Date(0), user: { email: 'student@example.invalid', role: 'USER' } } });
  assert.equal((await login()).ok, false);
});
test('failed first binding removes only the newly created empty account so the user can retry', async () => {
  const { state, login } = licenseLogin({ redeem: { ok: false, error: 'NO_COURSE_MAPPING' } });
  assert.equal((await login()).ok, false);
  assert.equal(state.created, 1);
  assert.equal(state.cleaned, 1);
});
test('successful first binding retains the new learner account', async () => {
  const { state, login } = licenseLogin();
  assert.equal((await login()).ok, true);
  assert.equal(state.cleaned, 0);
});
test('a mismatched product cannot fall back to the only paid course', async () => {
  let activated = false;
  const source = loadSource('src/lib/redeem.ts', {
    '@/lib/db': { prisma: { license: { findFirst: async () => null }, course: { findFirst: async () => null, findMany: async () => [{ id: 'wrong-course', wooSku: 'different' }] } } },
    '@/lib/wp-license': { validateLicense: async () => ({ key: 'valid', status: 'active', productId: 'unrelated' }), activateLicense: async () => { activated = true; return { ok: true }; } },
    '@/lib/license-status': {},
  });
  const result = await source.redeemLicenseKey({ userId: 'learner', licenseKey: 'valid', instanceId: 'device' });
  assert.equal(result.error, 'NO_COURSE_MAPPING');
  assert.equal(activated, false);
});

test('login sessions fail after revocation, password changes, role changes, or expiration', async () => {
  const user = { id: 'user', role: 'ADMIN', passwordHash: 'original-hash' };
  let record;
  const source = loadSource('src/lib/auth-session.ts', { '@/lib/db': { prisma: { session: { findUnique: async () => record } } } }, { process: { env: { AUTH_SECRET: 'test-only-secret' } } });
  const token = { id: user.id, role: user.role, fingerprint: 'browser-123', loginSession: `${source.deviceSessionPrefix(user.id, 'browser-123')}random`, credentialStamp: source.credentialStamp(user) };
  record = { userId: user.id, user: { ...user }, expires: new Date(Date.now() + 10000) };
  assert.equal(await source.validateLoginSession(token), true);
  record.user.passwordHash = 'new-hash';
  assert.equal(await source.validateLoginSession(token), false);
  record.user = { ...user, role: 'USER' };
  assert.equal(await source.validateLoginSession(token), false);
  record.user = user; record.expires = new Date(0);
  assert.equal(await source.validateLoginSession(token), false);
  record = null;
  assert.equal(await source.validateLoginSession(token), false);
  assert.equal(await source.validateLoginSession({ id: user.id, role: 'ADMIN' }), false);
});
test('revoking a device removes its login sessions and ends its playback sessions in one transaction', async () => {
  const writes = [];
  const tx = {
    $queryRaw: async () => [],
    device: { findFirst: async () => ({ id: 'device', fingerprint: 'browser-123' }), update: async (args) => writes.push(['device', args]) },
    session: { deleteMany: async (args) => writes.push(['login', args]) },
    playbackSession: { updateMany: async (args) => writes.push(['playback', args]) },
  };
  const source = loadSource('src/lib/devices.ts', { '@/lib/db': { prisma: { $transaction: async fn => fn(tx) } }, '@/lib/auth-session': { deviceSessionPrefix: (user, fp) => `${user}:${fp}.` } });
  await source.revokeDevice('owner', 'device');
  assert.deepEqual(writes.map(([kind]) => kind), ['login', 'playback', 'device']);
  assert.equal(writes[0][1].where.sessionToken.startsWith, 'owner:browser-123.');
  assert.equal(writes[1][1].where.userId, 'owner');
});

const parseStorage = loadSource('src/lib/supabase-storage-url.ts');
function coverAccess(prisma) {
  return loadSource('src/lib/cover-access.ts', { '@/lib/db': { prisma }, '@/lib/supabase-storage-url': parseStorage }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' } } });
}
test('private resources cannot be served as covers, even when registered as a cover', async () => {
  const source = coverAccess({ lessonResource: { findFirst: async () => ({ id: 'document' }) }, course: { findMany: async () => { throw Error('must not read covers'); } } });
  assert.equal(await source.storageCoverVisibility('materials', 'private.pdf'), null);
});
test('only a registered cover on the configured storage project can be public', async () => {
  const source = coverAccess({ lessonResource: { findFirst: async () => null }, course: { findMany: async () => [
    { published: true, coverUrl: 'https://project.supabase.co/storage/v1/object/public/materials/cover.png' },
    { published: true, coverUrl: 'https://other.supabase.co/storage/v1/object/public/materials/private.png' },
  ] } });
  assert.equal(await source.storageCoverVisibility('materials', 'cover.png'), 'public');
  assert.equal(await source.storageCoverVisibility('materials', 'private.png'), null);
  assert.equal(await source.storageCoverVisibility('materials', 'unknown.png'), null);
});
test('cover API rejects an anonymous private path before service-role download', async () => {
  let downloaded = false;
  const source = loadSource('src/app/api/cover/route.ts', {
    'next/server': next, '@/lib/auth': { auth: async () => null }, '@/lib/security': {}, '@/lib/supabase-storage-url': parseStorage,
    '@/lib/cover-access': { storageCoverVisibility: async () => null },
    '@/lib/supabase-admin': { storageBucket: () => 'materials', supabaseStorageConfigured: () => true, getSupabaseAdmin: () => { downloaded = true; throw Error('private download'); } },
  });
  const response = await source.GET(new Request('https://app.invalid/api/cover?path=private.pdf'));
  assert.equal(response.status, 404);
  assert.equal(downloaded, false);
});
test('cover bytes must be an allowed raster image; PDF and SVG are rejected', () => {
  const source = coverAccess({});
  assert.equal(source.rasterImageType(Buffer.from('%PDF-1.7')), null);
  assert.equal(source.rasterImageType(Buffer.from('<svg onload="alert(1)">')), null);
  assert.equal(source.rasterImageType(Buffer.from([137,80,78,71,13,10,26,10])), 'image/png');
});

test('old playback stays superseded instead of renewing and evicting the new player', async () => {
  const rows = [];
  const matches = (row, where) => Object.entries(where).every(([key, value]) => key === 'createdAt' ? row.createdAt > value.gt : row[key] === value);
  const table = {
    updateMany: async ({ where, data }) => { const selected = rows.filter(row => matches(row, where)); selected.forEach(row => Object.assign(row, data)); return { count: selected.length }; },
    create: async ({ data }) => { const row = { id: String(rows.length), endedAt: null, createdAt: new Date(), ...data }; rows.push(row); return row; },
    findFirst: async ({ where }) => rows.find(row => matches(row, where)) ?? null,
  };
  const prisma = { playbackSession: table, $queryRaw: async () => [], $transaction: async fn => fn(prisma) };
  const source = loadSource('src/lib/playback-session.ts', { '@/lib/db': { prisma } });
  const a = await source.startPlaybackSession({ userId: 'u', lessonId: 'l', deviceId: 'a' });
  const b = await source.startPlaybackSession({ userId: 'u', lessonId: 'l', deviceId: 'b' });
  assert.equal((await source.heartbeatPlaybackSession({ userId: 'u', token: a.token })).reason, 'SUPERSEDED');
  assert.equal((await source.heartbeatPlaybackSession({ userId: 'u', token: b.token })).ok, true);
  assert.equal(rows.filter(row => !row.endedAt).length, 1);
});
test('lesson gates reject unknown lessons and locked successors', () => {
  const source = loadSource('src/lib/progress.ts', { '@/lib/db': {} });
  const lessons = [{ id: 'first', slug: 'first', order: 1 }, { id: 'second', slug: 'second', order: 2 }];
  assert.equal(source.isLessonUnlocked(lessons, 'missing', new Set()), false);
  assert.equal(source.isLessonUnlocked(lessons, 'second', new Set()), false);
  assert.equal(source.isLessonUnlocked(lessons, 'second', new Set(['first'])), true);
});
test('a forged full-duration report cannot instantly complete a lesson', async () => {
  const prisma = {
    $queryRaw: async () => [],
    playbackSession: { findFirst: async () => ({ createdAt: new Date(Date.now() - 1000) }) },
    lessonProgress: { findUnique: async () => null, upsert: async ({ create }) => create },
    $transaction: async fn => fn(prisma),
  };
  const source = loadSource('src/lib/progress.ts', { '@/lib/db': { prisma } });
  const result = await source.upsertLessonProgress({ userId: 'u', lessonId: 'l', courseId: 'c', sessionToken: 'token', watchedSec: 3600, durationSec: 3600, forceComplete: true });
  assert.equal(result.completed, false);
  assert.ok(result.watchedSec < 3);
});
test('progress API uses the stored duration, requires a playback token, and enforces the lesson gate', async () => {
  let input, unlocked = true;
  const source = loadSource('src/app/api/progress/route.ts', {
    'next/server': next, zod, '@/lib/auth': { auth: async () => ({ user: { id: 'u', role: 'USER' } }) },
    '@/lib/db': { prisma: { lesson: { findUnique: async () => ({ id: 'l', courseId: 'c', durationSec: 600, course: { published: true } }) } } },
    '@/lib/redeem': { userHasCourseAccess: async () => true },
    '@/lib/progress': { userHasLessonAccess: async () => unlocked, upsertLessonProgress: async data => { input = data; return { completed: false, percent: 1 }; } },
  });
  const request = (token = true) => new Request('https://app.invalid/api/progress', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonId: 'l', watchedSec: 1, durationSec: 1, forceComplete: true, ...(token ? { sessionToken: 'token-123' } : {}) }) });
  assert.equal((await source.POST(request(false))).status, 400);
  assert.equal((await source.POST(request())).status, 200);
  assert.equal(input.durationSec, 600);
  assert.equal(input.forceComplete, undefined);
  unlocked = false;
  assert.equal((await source.POST(request())).status, 403);
});
test('YouTube playback needs neither a Mux key nor an internal stream secret', async () => {
  const youtube = loadSource('src/lib/youtube.ts');
  const source = loadSource('src/lib/stream.ts', {
    jose: {}, '@/lib/env': { isProductionRuntime: () => true }, '@/lib/google-drive': {}, '@/lib/youtube': youtube,
  }, { process: { env: { NODE_ENV: 'production', VIDEO_PROVIDER: 'youtube' } } });
  const result = await source.createPlaybackToken({ userId: 'u', lessonId: 'l', assetId: 'https://youtu.be/M7lc1UVf-VE' });
  assert.equal(result.provider, 'youtube');
  assert.equal(result.playbackUrl, 'M7lc1UVf-VE');
  assert.equal(result.token, undefined);
  await assert.rejects(source.createPlaybackToken({ userId: 'u', lessonId: 'l', assetId: 'invalid-asset' }));
});

test('duplicate start requests reuse their session and cannot revive it after takeover', async () => {
  const rows = [];
  const prisma = {
    $queryRaw: async () => [], $transaction: async fn => fn(prisma),
    playbackSession: {
      findUnique: async ({ where }) => rows.find(row => row.token === where.token) ?? null,
      updateMany: async ({ where, data }) => { rows.filter(row => row.userId === where.userId && row.endedAt === null).forEach(row => Object.assign(row, data)); },
      create: async ({ data }) => { const row = { ...data, id: String(rows.length), endedAt: null }; rows.push(row); return row; },
    },
  };
  const source = loadSource('src/lib/playback-session.ts', { '@/lib/db': { prisma } });
  const request = { userId: 'u', deviceId: 'd', lessonId: 'l', requestId: 'first-mount' };
  const first = await source.startPlaybackSession(request);
  const duplicate = await source.startPlaybackSession(request);
  assert.equal(first.token, duplicate.token);
  assert.equal(rows.length, 1);
  await source.startPlaybackSession({ ...request, requestId: 'another-mount' });
  assert.equal(await source.startPlaybackSession(request), null);
  assert.equal(rows.length, 2);
});

test('admins can preview draft lessons and playback uses the authenticated device identity', async () => {
  let registered, role = 'ADMIN';
  const calls = [];
  const source = loadSource('src/app/api/playback/start/route.ts', {
    'next/server': next, zod,
    '@/lib/auth': { auth: async () => ({ user: { id: 'u', role, fingerprint: 'authenticated-browser' } }) },
    '@/lib/db': { prisma: { lesson: { findUnique: async () => ({ id: 'l', courseId: 'c', streamAssetId: 'youtube', course: { published: false } }) }, lessonProgress: { findUnique: async () => ({ watchedSec: 120, percent: 20, completed: false }) } } },
    '@/lib/redeem': { userHasCourseAccess: async () => true }, '@/lib/progress': { userHasLessonAccess: async () => true },
    '@/lib/devices': { registerDevice: async input => { registered = input; return { ok: true, device: { id: 'device' } }; } },
    '@/lib/playback-session': { cleanupStaleSessions: async () => {}, startPlaybackSession: async () => { calls.push('session'); return { token: 'token-123' }; } },
    '@/lib/stream': { createPlaybackToken: async () => { calls.push('video'); return { provider: 'youtube', playbackUrl: 'M7lc1UVf-VE' }; }, PlaybackConfigError: class extends Error {} },
  });
  const request = () => new Request('https://app.invalid/api/playback/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lessonId: 'l', requestId: '123e4567-e89b-42d3-a456-426614174000', fingerprint: 'forged-browser' }) });
  const response = await source.POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).resumeAt, 120);
  assert.equal(registered.fingerprint, 'authenticated-browser');
  assert.deepEqual(calls, ['video', 'session']);
  role = 'USER';
  assert.equal((await source.POST(request())).status, 404);
});

test('a shop outage does not permanently revoke a license', async () => {
  let writes = 0;
  const source = loadSource('src/lib/license-status.ts', {
    '@/lib/db': { prisma: { $transaction: async () => { writes++; } } },
    '@/lib/wp-license': { validateLicense: async () => { throw Error('network outage'); } },
  });
  await assert.rejects(source.refreshLicenseStatus({ id: 'l', status: 'ACTIVE', expiresAt: null, wpActivated: true, updatedAt: new Date(0), key: 'valid' }));
  assert.equal(writes, 0);
});

test('inactive upstream licenses revoke local access and playback', async () => {
  let status = 'ACTIVE', entitlementStatus, playbackEnded = false;
  const prisma = {
    $transaction: async fn => fn(prisma),
    license: { updateMany: async ({ data }) => { status = data.status; return { count: 1 }; }, findUnique: async () => ({ status }) },
    entitlement: { updateMany: async ({ data }) => { entitlementStatus = data.status; } },
    playbackSession: { updateMany: async () => { playbackEnded = true; } },
  };
  const source = loadSource('src/lib/license-status.ts', { '@/lib/db': { prisma }, '@/lib/wp-license': { validateLicense: async () => ({ status: 'inactive', expiresAt: null }) } });
  assert.equal(await source.refreshLicenseStatus({ id: 'l', userId: 'u', status: 'ACTIVE', expiresAt: null, wpActivated: true, updatedAt: new Date(0), key: 'valid' }), false);
  assert.equal(entitlementStatus, 'REVOKED');
  assert.equal(playbackEnded, true);
});

test('resource download is strictly gated by course license access', async () => {
  let courseAllowed = false;
  const source = loadSource('src/app/api/learn/resources/[id]/download/route.ts', {
    'next/server': next,
    '@/lib/auth': { auth: async () => ({ user: { id: 'student-1', role: 'USER' } }) },
    '@/lib/db': {
      prisma: {
        lessonResource: {
          findUnique: async () => ({
            id: 'res-1',
            title: 'Exercise Files',
            url: 'https://example.invalid/files.zip',
            storagePath: null,
            lesson: { id: 'lesson-1', courseId: 'course-1', course: { published: true } },
          }),
        },
      },
    },
    '@/lib/redeem': { userHasCourseAccess: async (_uid, _cid) => courseAllowed },
    '@/lib/supabase-admin': {
      supabaseStorageConfigured: () => true,
      storageBucket: () => 'materials',
      getSupabaseAdmin: () => ({
        storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.invalid/file' }, error: null }) }) },
      }),
    },
  });

  // Without course license: 403 Forbidden
  const deniedRes = await source.GET(new Request('https://app.invalid/api/learn/resources/res-1/download'), { params: Promise.resolve({ id: 'res-1' }) });
  assert.equal(deniedRes.status, 403);

  // With active course license: 200 OK with material URL
  courseAllowed = true;
  const allowedRes = await source.GET(new Request('https://app.invalid/api/learn/resources/res-1/download'), { params: Promise.resolve({ id: 'res-1' }) });
  assert.equal(allowedRes.status, 200);
  const data = await allowedRes.json();
  assert.equal(data.url, 'https://example.invalid/files.zip');
  assert.equal(data.mode, 'external');
});

