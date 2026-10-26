// LaunchDarkly client wrapper that applies the PS preflight checklist rules:
//
// 1. The SDK is initialized once, as a singleton. Calling initLaunchDarkly()
//    again logs a warning and returns the existing client instead of
//    creating a second one.
//    https://launchdarkly-labs.github.io/ps-flag-book/sdk/preflight-checklist/init-and-config.html#sdk-is-initialized-once-as-a-singleton-early-in-the-applications-lifecycle
//
// 2. Initialization never blocks for more than 500ms. The SDK keeps connecting
//    in the background and fires 'change' events when flags arrive.
//    https://launchdarkly-labs.github.io/ps-flag-book/sdk/preflight-checklist/init-and-config.html#application-does-not-block-indefinitely-for-initialization
//
// 3. identify() never blocks for more than 500ms either.
//    https://launchdarkly-labs.github.io/ps-flag-book/cookbook/identify-timeout/index.html#javascript-client-side
//
// The v4 SDK (@launchdarkly/js-client-sdk) takes a native `timeout` option on
// start() and identify(), in seconds, defaulting to 5s. We set it explicitly.
//
// createClient is passed in rather than imported so the module has no
// dependency on how the SDK is loaded (CDN, npm, Angular DI) and can be unit
// tested with a fake client.

// SDK timeouts are in seconds: 0.5 = 500ms.
export const INIT_TIMEOUT_SECONDS = 0.5;
export const IDENTIFY_TIMEOUT_SECONDS = 0.5;

let instance = null;

/**
 * Creates and starts the LaunchDarkly client, once.
 *
 * @returns {{ client: object, ready: Promise<{status: 'complete' | 'failed' | 'timeout'}> }}
 *   `ready` is the SDK's start() promise, which resolves within INIT_TIMEOUT_SECONDS.
 */
export function initLaunchDarkly({ createClient, clientSideID, context, options = {}, logger = console }) {
  if (instance) {
    logger.warn(
      '[LaunchDarkly] initLaunchDarkly() was called again. Reusing the existing client; the SDK is not re-initialized.',
    );
    return instance;
  }

  const client = createClient(clientSideID, context, options);
  instance = { client, ready: client.start({ timeout: INIT_TIMEOUT_SECONDS }) };
  return instance;
}

/** Returns the client created by initLaunchDarkly(), or null before init. */
export function getLaunchDarkly() {
  return instance ? instance.client : null;
}

/**
 * Switches the client to a new context. The SDK resolves within
 * IDENTIFY_TIMEOUT_SECONDS; if it times out, the SDK keeps identifying in the
 * background and fires 'change' events when the new context's flags arrive.
 *
 * @returns {Promise<{status: 'completed' | 'error' | 'timeout' | 'shed'}>}
 */
export function identifyContext(context) {
  if (!instance) {
    throw new Error('[LaunchDarkly] initLaunchDarkly() must be called before identifyContext().');
  }
  return instance.client.identify(context, { timeout: IDENTIFY_TIMEOUT_SECONDS });
}

/** Test-only: forget the singleton so each test starts clean. */
export function resetLaunchDarklyForTests() {
  instance = null;
}
