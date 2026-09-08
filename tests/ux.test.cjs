const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSource, reactHarness, jsx, find } = require('./load-source.cjs');

function playerFixture(extra = {}) {
  const hooks = reactHarness();
  const toast = { ok() {}, error() {} };
  const source = loadSource('src/components/video-player.tsx', {
    react: hooks.react, 'react/jsx-runtime': jsx, 'hls.js': class {},
    '@/components/loading': {}, '@/components/toast': { useToast: () => toast },
    '@/components/youtube-host': { YouTubeHost: 'YouTubeHost' },
    '@/lib/fingerprint': { getDeviceLabel: () => 'Browser' }, '@/lib/google-drive': {},
  }, extra);
  return { hooks, component: source.VideoPlayer };
}

test('changing parent callbacks does not restart the player boot effect', () => {
  const { hooks, component } = playerFixture();
  const props = { lessonId: 'lesson', onCompleted() {} };
  const first = hooks.render(component, props);
  const second = hooks.render(component, { ...props, onCompleted() {} });
  const boot = (render) => render.effects.find(effect => effect.fn.toString().includes('async function boot'));
  assert.ok(boot(first));
  assert.equal(boot(second).changed, false);
  const newLesson = hooks.render(component, { ...props, lessonId: 'another-lesson' });
  assert.equal(boot(newLesson).changed, true);
});

test('heartbeat failure stops playback without silently starting another session', async () => {
  const calls = [];
  let timer;
  const { hooks, component } = playerFixture({
    fetch: async (url) => {
      calls.push(url);
      return url === '/api/playback/start'
        ? Response.json({ sessionToken: 'session-123', resumeAt: 120, percent: 20, playback: { provider: 'youtube', playbackUrl: 'M7lc1UVf-VE' } })
        : Response.json({ reason: 'SUPERSEDED', error: 'another device' }, { status: 409 });
    },
    setInterval(fn) { timer = fn; return 1; }, clearInterval() {},
    document: { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' },
  });
  const props = { lessonId: 'lesson' };
  const first = hooks.render(component, props);
  for (const effect of first.effects) effect.fn();
  await new Promise(resolve => setImmediate(resolve));
  const loaded = hooks.render(component, props);
  const youtube = find(loaded.tree, node => node.type === 'YouTubeHost');
  assert.equal(youtube.props.startSeconds, 120);
  assert.equal(youtube.props.paused, false);
  timer();
  await new Promise(resolve => setImmediate(resolve));
  const blocked = hooks.render(component, props);
  assert.equal(find(blocked.tree, node => node.type === 'YouTubeHost').props.paused, true);
  assert.equal(calls.filter(url => url === '/api/playback/start').length, 1);
});

test('login recovers its controls after a network failure and does not call the old binding endpoint', async () => {
  const hooks = reactHarness();
  const messages = [];
  const source = loadSource('src/components/login-form.tsx', {
    react: hooks.react, 'react/jsx-runtime': jsx,
    'next-auth/react': { signIn: async () => { throw Error('offline'); } },
    'next/navigation': { useRouter: () => ({ push() {}, refresh() {} }) },
    '@/components/loading': {}, '@/components/toast': { useToast: () => ({ error: (...args) => messages.push(args), ok() {} }) },
    '@/lib/license-login-messages': { licenseLoginErrorMessage: () => 'error' },
    '@/lib/fingerprint': { getDeviceFingerprint: () => 'browser-123' },
    '@/lib/redirect-target': loadSource('src/lib/redirect-target.ts'),
  }, { FormData: class { get(name) { return name === 'email' ? 'test@example.invalid' : 'test-key'; } }, fetch: () => { throw Error('old endpoint must not be called'); } });
  const form = hooks.render(source.LoginForm, {}).tree;
  await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  assert.equal(hooks.slots[0], false);
  assert.equal(messages.length, 1);
});

test('return paths keep deep links without allowing external or auth endpoint redirects', () => {
  const { safeReturnPath } = loadSource('src/lib/redirect-target.ts');
  assert.equal(safeReturnPath('/learn/course/lesson?from=library'), '/learn/course/lesson?from=library');
  for (const value of ['//evil.invalid', 'https://evil.invalid', '/\\evil.invalid', '/api/auth/signout', '/admin/login', '/login']) {
    assert.equal(safeReturnPath(value), '/library');
  }
});

test('student analytics uses actual lesson totals: 5 out of 20 is 25 percent', () => {
  const hooks = reactHarness();
  const source = loadSource('src/components/admin-analytics.tsx', { react: hooks.react, 'react/jsx-runtime': jsx, '@/components/icon': { Icon: 'Icon' } });
  const { tree } = hooks.render(source.AdminAnalytics, {
    courseStats: [], topStudents: [{ userId: 'u', email: 'u@example.invalid', name: null, courses: 1, completedLessons: 5, totalLessons: 20 }],
    overview: { students: 1, activeEntitlements: 1, completedLessons30d: 5, redeem30d: 1 },
  });
  assert.ok(find(tree, node => node.props?.style?.width === '25%'));
  assert.equal(find(tree, node => node.type === 'input').props.disabled, undefined);
});

test('YouTube host callback changes do not recreate the iframe', () => {
  const hooks = reactHarness();
  const source = loadSource('src/components/youtube-host.tsx', { react: hooks.react, 'react/jsx-runtime': jsx, '@/lib/youtube-iframe-api': {} });
  const props = { videoId: 'M7lc1UVf-VE', startSeconds: 45, onProgress() {} };
  hooks.render(source.YouTubeHost, props);
  const updated = hooks.render(source.YouTubeHost, { ...props, onProgress() {} });
  const iframe = updated.effects.find(effect => effect.fn.toString().includes('new YT.Player'));
  assert.equal(iframe.changed, false);
});

test('YouTube reports valid playback samples and stops polling when paused', async () => {
  const hooks = reactHarness();
  const timers = new Map();
  const saved = [];
  let options, current = 0, duration = 0, destroyed = false;
  const player = {
    getCurrentTime: () => current, getDuration: () => duration,
    pauseVideo() {}, destroy() { destroyed = true; },
  };
  const source = loadSource('src/components/youtube-host.tsx', {
    react: hooks.react, 'react/jsx-runtime': jsx,
    '@/lib/youtube-iframe-api': { loadYouTubeIframeApi: async () => {} },
  }, {
    document: { createElement: () => ({ style: {}, remove() {} }) },
    window: { location: { origin: 'https://app.invalid' } },
    YT: { Player: class { constructor(_mount, config) { options = config; return player; } }, PlayerState: { PLAYING: 1, PAUSED: 2, BUFFERING: 3, ENDED: 0 } },
    setInterval(fn, delay) { timers.set(delay, fn); return delay; }, clearInterval(id) { timers.delete(id); },
  });
  const rendered = hooks.render(source.YouTubeHost, {
    videoId: 'M7lc1UVf-VE', onProgress: (...args) => saved.push(args),
  });
  hooks.slots[0].current = { appendChild() {} };
  const cleanups = rendered.effects.map(effect => effect.fn()).filter(Boolean);
  await new Promise(resolve => setImmediate(resolve));
  options.events.onReady();
  assert.equal(timers.size, 0);
  options.events.onStateChange({ data: 1 });
  timers.get(2000)();
  assert.equal(saved.length, 0, 'wait for valid metadata before reporting progress');
  duration = 600;
  current = NaN;
  timers.get(2000)();
  assert.equal(saved.length, 0);
  current = 65;
  options.events.onStateChange({ data: 1 });
  timers.get(2000)();
  assert.deepEqual(saved.at(-1), [65, 600, false]);
  options.events.onStateChange({ data: 2 });
  assert.equal(timers.has(2000), false);
  assert.equal(timers.size, 0);
  cleanups.forEach(cleanup => cleanup());
  assert.equal(timers.size, 0);
  assert.equal(destroyed, true);
});

test('YouTube shows saved lesson progress and waits for server confirmation to unlock', async () => {
  const replies = [];
  let completed = 0;
  const { hooks, component } = playerFixture({
    fetch: async url => url === '/api/playback/start'
      ? Response.json({ sessionToken: 'session-123', resumeAt: 120, percent: 20, playback: { provider: 'youtube', playbackUrl: 'M7lc1UVf-VE' } })
      : new Promise(resolve => replies.push(resolve)),
    setInterval() { return 1; }, clearInterval() {},
    document: { addEventListener() {}, removeEventListener() {} },
  });
  const props = { lessonId: 'lesson', onCompleted: () => completed++ };
  hooks.render(component, props).effects.forEach(effect => effect.fn());
  await new Promise(resolve => setImmediate(resolve));
  const render = () => hooks.render(component, props).tree;
  const host = () => find(render(), node => node.type === 'YouTubeHost').props;
  const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node)
    : [node.props?.children].flat(Infinity).map(text).join('');
  const label = id => text(find(render(), node => node.props?.['data-testid'] === id));

  assert.equal(find(render(), node => node.props?.['data-testid'] === 'youtube-position'), undefined);
  host().onProgress(540, 600, false);
  assert.equal(label('lesson-progress'), 'ความคืบหน้า 20% · ครบ 90% เพื่อปลดล็อกบทถัดไป');
  assert.equal(completed, 0);
  replies.shift()(Response.json({ completed: false, percent: 89.9 }));
  await new Promise(resolve => setImmediate(resolve));
  assert.match(label('lesson-progress'), /ความคืบหน้า 89%/, 'do not round up to the unlock threshold');
  host().onProgress(600, 600, true);
  replies.shift()(Response.json({ completed: true, percent: 100 }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, 1);
  assert.match(label('lesson-progress'), /ผ่านบทเรียนแล้ว/);
});

test('device identification still works when browser storage is disabled', () => {
  const source = loadSource('src/lib/fingerprint.ts', {}, {
    window: {}, localStorage: { getItem() { throw Error('disabled'); }, setItem() { throw Error('disabled'); } },
  });
  const first = source.getDeviceFingerprint();
  assert.match(first, /^fp_[a-f0-9-]+$/);
  assert.equal(source.getDeviceFingerprint(), first);
});
