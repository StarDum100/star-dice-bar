# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test          # Run full Jest test suite
```

No build step — the module loads directly into FoundryVTT as plain JS/CSS.

To run a single test file or describe block:
```bash
npx jest tests/main.test.js
npx jest --testNamePattern="some describe block name"
```

## Architecture

Star Dice Bar is a FoundryVTT v14 module that adds a quick-access dice bar to the UI. All logic lives in `scripts/main.js`; styles are in `styles/styles.css`; user-facing strings live in `localization/<lang>.json`.

`main.js` is wrapped in an IIFE to prevent `MODULE_ID` and other module-scoped `const` declarations from colliding with sibling modules that declare the same names in a shared realm.

There are no built-in dice: the bar starts empty (showing a "Click the gear to add dice" hint) and every die is a user-added custom die. The Reset tab's "Clear All Dice" empties the bar.

**Lifecycle:**
1. `Hooks.once("init")` — registers `barHidden` as a client-scoped game setting
2. `Hooks.once("ready")` — builds and mounts the bar DOM, applies saved position, binds drag

**Persistence:**
- Bar position and per-user config (dice layout, visibility, custom dice) → `game.user.setFlag() / getFlag()` (flag namespace: `"star-dice-bar"`)
- Custom dice are stored as `{ formula, label }` objects (`label` is the optional nickname). `getCustomDice()` normalizes legacy plain-string entries to this shape on read.
- The composite key for a die is `"formula|label"` when a label exists, or plain `"formula"` when it doesn't (produced by `dieKey(formula, label)`). The `barGrid` and `diceVisibility` flags are keyed by this composite key — not by formula alone. Any code that reads or writes those flags must use `dieKey()` consistently.
- `barHidden` setting → `game.settings.register() / get() / set()`

**Roll modes:** the bar has a sticky Normal/Advantage/Disadvantage toggle (`.sdb-mode-btn`); the current mode is held on the bar element via `diceBar.data("rollMode")`. Advantage/disadvantage doubles each die term and keeps highest/lowest (e.g. `1d20` → `2d20kh1`); flat `+/-` modifiers are untouched.

**Localization:**
- Every visible UI string is stored under the `STARDICEBAR` namespace in `localization/<lang>.json`, registered via the `languages` array in `module.json`. English (`localization/en.json`) is the source of truth.
- `t(key, data)` is the in-module helper: it prefixes the key with `STARDICEBAR.` and calls `game.i18n.localize(key)` (no `data`) or `game.i18n.format(key, data)` (with `{placeholder}` interpolation). All UI text must go through `t()` — do not hardcode user-facing strings.
- `notify(key, data)` wraps `ui.notifications.warn` and prefixes the localized message with `MODULE_TITLE`, producing e.g. `"Star Dice Bar: <message>"`.
- The `barHidden` setting registers its `name`/`hint` as raw i18n keys (`STARDICEBAR.Settings.HideBar.*`); Foundry localizes those automatically when the settings menu renders.
- `MODULE_TITLE` (`"Star Dice Bar"`) is the brand name and is intentionally **not** localized; it is interpolated into the dialog title and notification prefixes.
- Translation values are trusted (shipped in-repo), but any value placed into an HTML attribute is still passed through `escapeHtml()` so a translation containing a quote can't break the markup.
- Adding a language: drop a `localization/<lang>.json` with the same nested keys, add an entry to `module.json` `languages`. `tests/localization.test.js` then enforces key/placeholder parity with English automatically.

**Key functions in `main.js`:**
- `t(key, data) / notify(key, data)` — localization helpers (see Localization above)
- `renderBar()` — rebuilds dice buttons from the saved grid; button text is `label || formula`, tooltip is the formula; called on init and after config saves
- `makeRollClickHandler(diceBar, formula, label)` — returns an async click handler that reads the current roll mode, evaluates a `Roll` (rewritten for advantage/disadvantage), and calls `toMessage()` with `ChatMessage.getSpeaker()`
- `buildRollFormula(formula, mode)` — rewrites die terms for advantage/disadvantage
- `isValidFormula(raw)` — validates an entered formula (dice terms and integers joined by `+`/`-`; at least one die; no leading sign)
- `openConfig()` — opens a `foundry.applications.api.DialogV2` with four tabs: Dice, Layout, Reset, Extra
- `renderLayoutEditor()` — renders the drag-and-drop grid in the Layout tab
- `reshapeGrid(grid, rows)` — redistributes dice slots when row count changes
- `dieKey(formula, label) / dieKeys(customDice)` — produce the composite persistence keys used in `barGrid` and `diceVisibility`
- `getCustomDice() / getBarGrid() / getVisibility()` — read saved flags with defaults
- `escapeHtml(str)` — used wherever user-supplied strings (custom dice formulas and nicknames) are inserted into the DOM; never bypass this
- `openConfig` save callback runs a **two-phase commit**: phase 1 reads every row, validates formulas, and identifies which originals stay (invalid edit or key unchanged); phase 2 commits valid edits that don't collide with kept originals or already-committed keys, warning on each collision. Modifying the save logic requires understanding both phases.
- A `configOpen` boolean guard on the gear button prevents opening a second config dialog while one is already open.

**Local dev:**
Link the project into Foundry's modules directory with a directory junction (no admin required):
```cmd
mklink /J "%LOCALAPPDATA%\FoundryVTT\Data\modules\star-dice-bar" "<path-to-repo>"
```
Changes are reflected immediately — no copy step needed.

**Tests:**
- `tests/main.test.js` mocks the entire Foundry global (`game`, `Hooks`, `Roll`, `ChatMessage`, `$`) via `beforeEach` setup. The `game.i18n` mock loads the real `localization/en.json` and resolves keys through the same `localize`/`format` contract Foundry uses, so assertions check actual English text rather than raw keys. Tests verify DOM structure, roll behavior, XSS resilience (script injection, attribute injection, img onerror), drag-and-drop layout, config dialog tab switching, and edge cases (invalid saved data, NaN, missing DOM nodes). When adding features, follow the existing mock pattern and add XSS tests for any new user-supplied string rendering.
- `tests/localization.test.js` validates the language files: English is non-empty with string values, and any additional language has full key + `{placeholder}` parity with English (parity tests skip while English is the only language).
- `tests/manifest.test.js` validates `module.json`, including that every declared `languages` path exists on disk and parses as JSON nested under `STARDICEBAR`.
- `tests/encoding.test.js` guards source files (including `localization/en.json`) against Windows-1252 double-encoding corruption.