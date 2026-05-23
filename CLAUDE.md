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

Star Quick Dice is a FoundryVTT v13 module that adds a quick-access dice bar to the UI. All logic lives in `scripts/main.js` (~457 lines); styles are in `styles/styles.css`.

**Lifecycle:**
1. `Hooks.once("init")` — registers `barHidden` as a client-scoped game setting
2. `Hooks.once("ready")` — builds and mounts the bar DOM, applies saved position, binds drag

**Persistence:**
- Bar position and per-user config (dice layout, visibility, custom dice) → `game.user.setFlag() / getFlag()` (flag namespace: `"star-quick-dice"`)
- `barHidden` setting → `game.settings.register() / get() / set()`

**Key functions in `main.js`:**
- `renderBar()` — rebuilds dice buttons from the saved grid; called on init and after config saves
- `makeRollClickHandler(formula)` — returns an async click handler that evaluates a `Roll` and calls `toMessage()` with `ChatMessage.getSpeaker()`
- `openConfig()` — opens a `foundry.applications.api.DialogV2` with four tabs: Dice, Layout, Reset, Extra
- `renderLayoutEditor()` — renders the drag-and-drop grid in the Layout tab
- `reshapeGrid(grid, rows)` — redistributes dice slots when row count changes
- `getCustomDice() / getBarGrid() / getVisibility()` — read saved flags with defaults
- `escapeHtml(str)` — used wherever user-supplied strings (custom dice labels/formulas) are inserted into the DOM; never bypass this

**Tests (`tests/main.test.js`):**
The suite mocks the entire Foundry global (`game`, `Hooks`, `Roll`, `ChatMessage`, `$`) via `beforeEach` setup. Tests verify DOM structure, roll behavior, XSS resilience (script injection, attribute injection, img onerror), drag-and-drop layout, config dialog tab switching, and edge cases (invalid saved data, NaN, missing DOM nodes). When adding features, follow the existing mock pattern and add XSS tests for any new user-supplied string rendering.