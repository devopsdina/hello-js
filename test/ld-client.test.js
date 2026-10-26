// Tests run the real LaunchDarkly SDK against a local HTTP server standing in
// for LaunchDarkly, so the timeouts are measured, not just passed through.
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { basicLogger, createClient as realCreateClient } from '@launchdarkly/js-client-sdk';

import {
  IDENTIFY_TIMEOUT_SECONDS,
  INIT_TIMEOUT_SECONDS,
  getLaunchDarkly,
  identifyContext,
  initLaunchDarkly,
  resetLaunchDarklyForTests,
} from '../ld-client.js';

const TIMEOUT_MS = 500;
// Upper bound on how late a timeout may resolve, to absorb timer jitter.
const SLACK_MS = 250;

// 'respond' serves one flag; 'hang' accepts connections and never answers,
// like a network that blocks LaunchDarkly.
let mode = 'respond';
const server = http.createServer((req, res) => {
  if (mode === 'hang') {
    return;
  }
  res.setHeader('content-type', 'application/json');
  if (req.url.startsWith('/sdk/evalx/')) {
    res.end(JSON.stringify({ 'demo-flag': { value: true, variation: 0, version: 1, flagVersion: 1 } }));
  } else {
    res.end('[]');
  }
});
let endpoint;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

function init(overrides = {}) {
  return initLaunchDarkly({
    createClient: realCreateClient,
    clientSideID: 'test-client-side-id',
    context: { kind: 'user', key: 'user-1' },
    options: {
      baseUri: endpoint,
      streamUri: endpoint,
      eventsUri: endpoint,
      sendEvents: false,
      // The goals URL watcher polls on an interval that close() doesn't stop,
      // which keeps Node from exiting after the tests. Goals aren't under test.
      fetchGoals: false,
      logger: basicLogger({ level: 'none' }),
    },
    logger: { warn: mock.fn() },
    ...overrides,
  });
}

async function timed(promise) {
  const start = performance.now();
  const value = await promise;
  return { value, ms: performance.now() - start };
}

beforeEach(() => {
  mode = 'respond';
  resetLaunchDarklyForTests();
});

afterEach(async () => {
  await getLaunchDarkly()?.close();
  server.closeAllConnections();
});

describe('singleton initialization', () => {
  it('creates one client and reuses it on a second call, with a warning', async () => {
    const createClient = mock.fn(realCreateClient);
    const first = init({ createClient });
    await first.ready;

    const logger = { warn: mock.fn() };
    const second = init({ createClient, logger });

    assert.equal(second, first);
    assert.equal(getLaunchDarkly(), first.client);
    assert.equal(createClient.mock.callCount(), 1);
    assert.equal(logger.warn.mock.callCount(), 1);
    assert.match(logger.warn.mock.calls[0].arguments[0], /not re-initialized/);
  });
});

describe('initialization timeout', () => {
  it('is set to 500ms or less', () => {
    assert.ok(INIT_TIMEOUT_SECONDS > 0 && INIT_TIMEOUT_SECONDS <= TIMEOUT_MS / 1000);
  });

  it('completes and serves flags when LaunchDarkly answers', async () => {
    const { client, ready } = init();

    assert.deepEqual(await ready, { status: 'complete' });
    assert.equal(client.variation('demo-flag', false), true);
  });

  it('stops waiting at the timeout when LaunchDarkly never answers', async () => {
    mode = 'hang';
    const { client, ready } = init();

    const { value, ms } = await timed(ready);

    assert.equal(value.status, 'timeout');
    assert.ok(ms >= TIMEOUT_MS - 50 && ms < TIMEOUT_MS + SLACK_MS, `resolved after ${ms}ms`);
    assert.equal(client.variation('demo-flag', false), false, 'serves the fallback value');
  });
});

describe('identify timeout', () => {
  it('is set to 500ms or less', () => {
    assert.ok(IDENTIFY_TIMEOUT_SECONDS > 0 && IDENTIFY_TIMEOUT_SECONDS <= TIMEOUT_MS / 1000);
  });

  it('completes when LaunchDarkly answers', async () => {
    await init().ready;

    const result = await identifyContext({ kind: 'user', key: 'user-2' });

    assert.equal(result.status, 'completed');
  });

  it('stops waiting at the timeout when LaunchDarkly never answers', async () => {
    const { client, ready } = init();
    await ready;
    mode = 'hang';

    const { value, ms } = await timed(identifyContext({ kind: 'user', key: 'user-2' }));

    assert.equal(value.status, 'timeout');
    assert.ok(ms >= TIMEOUT_MS - 50 && ms < TIMEOUT_MS + SLACK_MS, `resolved after ${ms}ms`);
    assert.equal(client.variation('demo-flag', false), true, 'keeps the previous flag values');
  });

  it('throws if called before initLaunchDarkly()', () => {
    assert.throws(() => identifyContext({ kind: 'user', key: 'user-2' }), /must be called before/);
  });
});
