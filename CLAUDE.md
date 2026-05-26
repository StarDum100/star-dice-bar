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

Star Quick Dice is a FoundryVTT v14 module that adds a quick-access dice bar to the UI. All logic lives in `scripts/main.js` (~540 lines); styles are in `styles/styles.css`.

**Lifecycle:**
1. `Hooks.once("init")` — registers `barHidden` as a client-scoped game setting
2. `Hooks.once("ready")` — builds and mounts the bar DOM, applies saved position, binds drag

**Persistence:**
- Bar position and per-user config (dice layout, visibility, custom dice) → `game.user.setFlag() / getFlag()` (flag namespace: `"star-quick-dice"`)
- Custom dice are stored as `{ formula, label }` objects (`label` is the optional nickname). `getCustomDice()` normalizes legacy plain-string entries to this shape on read. The grid and visibility flags are keyed by `formula`.
- `barHidden` setting → `game.settings.register() / get() / set()`

**Roll modes:** the bar has a sticky Normal/Advantage/Disadvantage toggle (`.sqd-mode-btn`); the current mode is held on the bar element via `diceBar.data("rollMode")`. Advantage/disadvantage doubles each die term and keeps highest/lowest (e.g. `1d20` → `2d20kh1`); flat `+/-` modifiers are untouched.

**Key functions in `main.js`:**
- `renderBar()` — rebuilds dice buttons from the saved grid; button text is `label || formula`, tooltip is the formula; called on init and after config saves
- `makeRollClickHandler(diceBar, formula, label)` — returns an async click handler that reads the current roll mode, evaluates a `Roll` (rewritten for advantage/disadvantage), and calls `toMessage()` with `ChatMessage.getSpeaker()`
- `buildRollFormula(formula, mode)` — rewrites die terms for advantage/disadvantage
- `isValidFormula(raw)` — validates an entered formula (dice terms and integers joined by `+`/`-`; at least one die; no leading sign)
- `openConfig()` — opens a `foundry.applications.api.DialogV2` with four tabs: Dice, Layout, Reset, Extra
- `renderLayoutEditor()` — renders the drag-and-drop grid in the Layout tab
- `reshapeGrid(grid, rows)` — redistributes dice slots when row count changes
- `getCustomDice() / customFormulas() / getBarGrid() / getVisibility()` — read saved flags with defaults
- `escapeHtml(str)` — used wherever user-supplied strings (custom dice formulas and nicknames) are inserted into the DOM; never bypass this

**Tests (`tests/main.test.js`):**
The suite mocks the entire Foundry global (`game`, `Hooks`, `Roll`, `ChatMessage`, `$`) via `beforeEach` setup. Tests verify DOM structure, roll behavior, XSS resilience (script injection, attribute injection, img onerror), drag-and-drop layout, config dialog tab switching, and edge cases (invalid saved data, NaN, missing DOM nodes). When adding features, follow the existing mock pattern and add XSS tests for any new user-supplied string rendering.