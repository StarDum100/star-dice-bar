# Star Quick Dice

A FoundryVTT module that adds a quick-access dice bar to the top of the UI, letting you roll common dice (d4–d100) with a single click. Results are posted to chat with the current speaker.

## Features

- One-click buttons for d4, d6, d8, d10, d12, d20, and d100
- Results posted to chat with flavor text showing the formula used
- Non-intrusive bar anchored to the top of the Foundry UI

## Compatibility

| Foundry Version | Status |
|---|---|
| v12 | Verified |

## Installation

1. In Foundry, open **Add-on Modules** and click **Install Module**.
2. Paste the manifest URL into the field at the bottom and click **Install**.
3. Enable the module in your world under **Manage Modules**.

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)

### Setup
```bash
npm install
```

### Testing locally in Foundry

Symlink or copy the module folder into your Foundry data directory:

```
<Foundry Data>/Data/modules/star-quick-dice/
```

Then launch Foundry, enable the module in your world, and open the browser console (`F12`) to watch for errors. Verify:

- The dice bar appears at the top of the screen
- Clicking each button posts a roll to chat with the correct formula in the flavor text
- No errors appear in the console

### Running the automated test suite

```bash
npm test
```

The suite uses [Jest](https://jestjs.io/) with a jsdom environment to test the module without a running Foundry instance. It covers:

- **DOM structure** — the dice bar is appended to `#ui-top` with 7 correctly labelled buttons
- **Click behavior** — each button rolls the right formula, evaluates it, and posts it to chat with the correct speaker and flavor text
- **Resilience** — graceful handling when expected DOM elements are absent
- **Manifest validation** — `module.json` is well-formed, version strings are valid, and all referenced files exist on disk

### Verifying compatibility with a new Foundry version

When a new Foundry version is released:

1. Check the Foundry changelog for changes to any of the APIs this module depends on:
   - `Hooks.once` — used to register `init` and `ready` callbacks
   - `Roll` — constructed with a formula string; `.evaluate()` and `.toMessage()` must exist
   - `ChatMessage.getSpeaker()` — used to populate the chat message speaker
   - The `#ui-top` element — where the dice bar is appended
2. Run `npm test` to confirm the test suite still passes.
3. Install the module in a Foundry world running the new version and run through the manual steps above.
4. Update `compatibility.verified` in `module.json` once confirmed working.
