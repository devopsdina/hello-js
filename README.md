### LaunchDarkly sample JavaScript application 

We've built a simple browser application that demonstrates how LaunchDarkly's SDK works. 

Below, you'll find the basic build procedure, but for more comprehensive instructions, you can visit your [Quickstart page](https://app.launchdarkly.com/quickstart#/) or the [JavaScript SDK reference guide](https://docs.launchdarkly.com/sdk/client-side/javascript).

This version of the application uses the [LaunchDarkly JavaScript SDK v4](https://github.com/launchdarkly/js-core/tree/main/packages/sdk/browser) (`@launchdarkly/js-client-sdk`).

#### Build instructions 

1. Edit `index.html` and set the value of `clientSideID` to your LaunchDarkly client-side ID. If there is an existing boolean feature flag in your LaunchDarkly project that you want to evaluate, set `flagKey` to the flag key.

```
const clientSideID = 'myClientSideID';
const flagKey = 'my-flag-key';
```

2. Serve the folder and open it in your browser. `index.html` imports `ld-client.js` as a module, which browsers block over `file://`.

```
npm start    # python3 -m http.server 8000
```

Then open http://localhost:8000.

You should receive the message "The <flagKey> feature flag evaluates to <flagValue>." The application will run continuously and react to the flag changes in LaunchDarkly. When the flag is on, the background turns green and Osmo, the LaunchDarkly mark, launches onto the page.

#### SDK initialization rules

`ld-client.js` wraps the SDK so the app follows the [PS preflight checklist](https://launchdarkly-labs.github.io/ps-flag-book/sdk/preflight-checklist/init-and-config.html):

- **Singleton.** `initLaunchDarkly()` creates and starts one client. Calling it again logs a warning and returns the existing client.
- **Initialization never blocks for more than 500ms.** On timeout the page renders fallback values, and the `change` listener re-renders when flags arrive.
- **`identify` never blocks for more than 500ms.** `identifyContext()` resolves to `completed`, `error`, `timeout` or `shed`.

Both timeouts use the SDK's native `timeout` option, set explicitly: `start({ timeout: 0.5 })` and `identify(context, { timeout: 0.5 })`. The SDK measures timeouts in seconds and defaults to 5s.

To verify the timeout in a browser, block `clientsdk.launchdarkly.com` and `clientstream.launchdarkly.com` in DevTools (Network → Block request URL). The page should render the fallback value within 500ms.

#### Tests

```
npm test     # node --test, Node 20.4+; no dependencies
```
