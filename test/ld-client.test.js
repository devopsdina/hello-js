import { beforeEach, describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  IDENTIFY_TIMEOUT_SECONDS,
  INIT_TIMEOUT_SECONDS,
  getLaunchDarkly,
  identifyContext,
  initLaunchDarkly,
  resetLaunchDarklyForTests,
} from '../ld-client.js';

function fakeSdk() {
  const client = {
    start: mock.fn(() => Promise.resolve({ status: 'complete' })),
    identify: mock.fn(() => Promise.resolve({ status: 'completed' })),
  };
  return { client, createClient: mock.fn(() => client) };
}

function fakeLogger() {
  return { warn: mock.fn() };
}

function init(sdk, overrides = {}) {
  return initLaunchDarkly({
    createClient: sdk.createClient,
    clientSideID: 'client-side-id',
    context: { kind: 'user', key: 'user-1' },
    logger: fakeLogger(),
    ...overrides,
  });
}

beforeEach(() => {
  resetLaunchDarklyForTests();
});

describe('singleton initialization', () => {
  it('creates and starts exactly one client', async () => {
    const sdk = fakeSdk();
    const { client, ready } = init(sdk);

    assert.equal(sdk.createClient.mock.callCount(), 1);
    assert.deepEqual(sdk.createClient.mock.calls[0].arguments, [
      'client-side-id',
      { kind: 'user', key: 'user-1' },
      {},
    ]);
    assert.equal(client.start.mock.callCount(), 1);
    assert.equal(getLaunchDarkly(), client);
    assert.deepEqual(await ready, { status: 'complete' });
  });

  it('warns and reuses the existing client when called again', () => {
    const sdk = fakeSdk();
    const first = init(sdk);

    const logger = fakeLogger();
    const second = init(sdk, { logger });

    assert.equal(second, first);
    assert.equal(sdk.createClient.mock.callCount(), 1);
    assert.equal(first.client.start.mock.callCount(), 1);
    assert.equal(logger.warn.mock.callCount(), 1);
    assert.match(logger.warn.mock.calls[0].arguments[0], /not re-initialized/);
  });
});

describe('initialization timeout', () => {
  it('is 500ms or less', () => {
    assert.ok(INIT_TIMEOUT_SECONDS > 0 && INIT_TIMEOUT_SECONDS <= 0.5);
  });

  it('is passed explicitly to start()', () => {
    const sdk = fakeSdk();
    init(sdk);

    assert.deepEqual(sdk.client.start.mock.calls[0].arguments, [{ timeout: INIT_TIMEOUT_SECONDS }]);
  });
});

describe('identify timeout', () => {
  it('is 500ms or less', () => {
    assert.ok(IDENTIFY_TIMEOUT_SECONDS > 0 && IDENTIFY_TIMEOUT_SECONDS <= 0.5);
  });

  it('is passed explicitly to identify()', async () => {
    const sdk = fakeSdk();
    init(sdk);
    const context = { kind: 'user', key: 'user-2' };

    const result = await identifyContext(context);

    assert.deepEqual(sdk.client.identify.mock.calls[0].arguments, [
      context,
      { timeout: IDENTIFY_TIMEOUT_SECONDS },
    ]);
    assert.deepEqual(result, { status: 'completed' });
  });

  it('throws if called before initLaunchDarkly()', () => {
    assert.throws(() => identifyContext({ kind: 'user', key: 'user-2' }), /must be called before/);
  });
});
