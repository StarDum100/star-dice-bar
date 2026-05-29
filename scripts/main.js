// IIFE so module-scoped declarations (MODULE_ID, MODULE_TITLE, etc.) never leak into a
// shared/global scope. Sibling modules each declare `const MODULE_ID`; without this wrapper,
// loading them in the same realm (e.g. as classic scripts, or a hot-reload re-eval) throws
// "Identifier 'MODULE_ID' has already been declared".
(function () {
const MODULE_ID = "star-dice-bar";
const MODULE_TITLE = "Star Dice Bar";

const ROLL_MODES = ["normal", "advantage", "disadvantage"];
const MODE_LABEL_KEYS = { normal: "Mode.Normal", advantage: "Mode.Advantage", disadvantage: "Mode.Disadvantage" };

// Localization helper. Every visible string is stored under the STARDICEBAR namespace
// in localization/<lang>.json (registered via module.json "languages"). Pass `data` to
// interpolate {placeholders} via game.i18n.format; omit it for a plain lookup.
function translate(key, data) {
    const id = `STARDICEBAR.${key}`;
    return data ? game.i18n.format(id, data) : game.i18n.localize(id);
}

// All user-facing notifications are prefixed with the module title for clarity in Foundry's
// notification stream, e.g. "Star Dice Bar: <message>".
function notify(key, data) {
    ui.notifications.warn(`${MODULE_TITLE}: ${translate(key, data)}`);
}

// A custom die formula: one or more `NdX` dice terms and/or integers joined by + / -,
// e.g. "1d20", "2d6+3", "1d8+1d6". Leading sign and bare die size (e.g. "d6") are rejected.
const FORMULA_RE = /^\d+(?:d\d+)?(?:[+-]\d+(?:d\d+)?)*$/;
function isValidFormula(raw) {
    return FORMULA_RE.test(raw) && raw.includes("d");
}

// Composite die key: "formula|label" when a label exists, plain formula when it doesn't.
// dieKey("1d6", "") === "1d6" keeps barGrid and diceVisibility backwards compatible.
function dieKey(formula, label) {
    return label ? `${formula}|${label}` : formula;
}

function dieKeys(customDice) {
    return customDice.map(d => dieKey(d.formula, d.label));
}

// Human-readable identifier shown in warnings: "formula (label)" or plain "formula".
function dieDisplay(formula, label) {
    return label ? `${formula} (${label})` : formula;
}

// Advantage/disadvantage doubles each die term and keeps the highest/lowest half,
// e.g. 1d20 -> 2d20kh1, 2d6 -> 4d6kl2. Flat +/- modifiers are left untouched.
function buildRollFormula(formula, mode) {
    if (mode !== "advantage" && mode !== "disadvantage") return formula;
    const keep = mode === "advantage" ? "kh" : "kl";
    return formula.replace(/(\d+)d(\d+)/gi, (_match, count, faces) => {
        const n = parseInt(count, 10);
        return `${n * 2}d${faces}${keep}${n}`;
    });
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function getCustomDice() {
    const saved = game.user.getFlag(MODULE_ID, "customDice") ?? [];
    return saved.map(d => ({ formula: d?.formula ?? "", label: d?.label ?? "" }));
}

function getBarGrid(customDice = getCustomDice()) {
    const saved = game.user.getFlag(MODULE_ID, "barGrid");
    if (saved?.length) return saved;
    return [dieKeys(customDice)];
}

function getVisibility(customDice = getCustomDice()) {
    const saved = game.user.getFlag(MODULE_ID, "diceVisibility") ?? {};
    const visibility = {};
    for (const key of dieKeys(customDice)) {
        visibility[key] = saved[key] !== false;
    }
    return visibility;
}

function applyBarPosition(diceBar, savedPos = game.user.getFlag(MODULE_ID, "barPosition")) {
    const pos = savedPos ?? {
        left: Math.round((window.innerWidth - diceBar.outerWidth()) / 2),
        top: 10,
    };
    const left = Math.max(0, Math.min(window.innerWidth  - diceBar.outerWidth(),  pos.left));
    const top  = Math.max(0, Math.min(window.innerHeight - diceBar.outerHeight(), pos.top));
    diceBar.css({ left, top });
}

function initBarDrag(diceBar) {
    let startX, startY, startLeft, startTop;
    diceBar.find(".sdb-bar-handle").on("mousedown", (e) => {
        e.preventDefault();
        startX    = e.clientX;
        startY    = e.clientY;
        startLeft = parseInt(diceBar.css("left")) || 0;
        startTop  = parseInt(diceBar.css("top"))  || 0;

        $(document).on("mousemove.sdb-drag", (e) => {
            const left = Math.max(0, Math.min(window.innerWidth  - diceBar.outerWidth(),  startLeft + e.clientX - startX));
            const top  = Math.max(0, Math.min(window.innerHeight - diceBar.outerHeight(), startTop  + e.clientY - startY));
            diceBar.css({ left, top });
        });

        $(document).on("mouseup.sdb-drag", () => {
            $(document).off("mousemove.sdb-drag mouseup.sdb-drag");
            game.user.setFlag(MODULE_ID, "barPosition", {
                left: parseInt(diceBar.css("left")),
                top:  parseInt(diceBar.css("top")),
            });
        });
    });
}

function makeRollClickHandler(diceBar, formula, label = "") {
    return async () => {
        const mode = diceBar.data("rollMode") || "normal";
        const roll = new Roll(buildRollFormula(formula, mode));
        await roll.evaluate();
        let flavor = translate("Flavor.QuickRoll", { dice: label ? `${label} (${formula})` : formula });
        if (mode === "advantage")         flavor += translate("Flavor.AdvantageSuffix");
        else if (mode === "disadvantage") flavor += translate("Flavor.DisadvantageSuffix");
        roll.toMessage({
            speaker: ChatMessage.getSpeaker(),
            flavor,
        });
    };
}

function renderBar(diceBar, overrides = {}) {
    const customDice = overrides.customDice ?? getCustomDice();
    const grid       = overrides.grid       ?? getBarGrid(customDice);
    const visibility = overrides.visibility ?? getVisibility(customDice);
    const knownKeys  = new Set(dieKeys(customDice));
    const diceByKey  = new Map(customDice.map(d => [dieKey(d.formula, d.label), d]));
    const gridEl = diceBar.find(".sdb-dice-grid");
    gridEl.empty();
    const multirow = grid.length > 1;
    diceBar.toggleClass("sdb-bar-multirow", multirow);
    if (multirow) {
        const maxCols = Math.max(...grid.map(r => r.length));
        gridEl.css("--sdb-cols", maxCols);
    } else {
        gridEl.css("--sdb-cols", "");
    }

    grid.forEach(row => {
        const rowEl = $('<div class="sdb-bar-row">');
        row.forEach(key => {
            if (!knownKeys.has(key)) return;
            const die     = diceByKey.get(key);
            const formula = die.formula;
            const label   = die.label || "";
            const btn = $("<button>")
                .attr("data-roll", formula)
                .attr("title", formula)
                .text(label || formula);
            if (!visibility[key]) btn.hide();
            btn.click(makeRollClickHandler(diceBar, formula, label));
            rowEl.append(btn);
        });
        gridEl.append(rowEl);
    });

    if (gridEl.find("button[data-roll]").length === 0) {
        gridEl.append(`<span class="sdb-empty-hint">${translate("Bar.EmptyHint")}</span>`);
    }
}

function renderLayoutEditor(html, pendingGrid, pendingCustom = []) {
    const panel = html.find('[data-panel="layout"]');
    panel.empty();

    if (pendingGrid.length === 0 || pendingGrid.every(r => r.length === 0)) {
        panel.append(`<p class="sdb-layout-empty">${translate("Layout.Empty")}</p>`);
        return;
    }

    const diceByKey = new Map(pendingCustom.map(d => [dieKey(d.formula, d.label), d]));
    const flat    = pendingGrid.flat();
    const numRows = pendingGrid.length;
    const numCols = Math.ceil(flat.length / numRows);

    panel.append(`<p class="sdb-layout-hint">${translate("Layout.Hint")}</p>`);

    const controls = $('<div class="sdb-layout-controls">');
    const rowInput = $('<input type="number" class="sdb-rows-input">')
        .attr("min", 1).attr("max", flat.length).val(numRows);
    controls.append($('<label class="sdb-rows-label">').text(translate("Layout.NumberOfRows")).append(rowInput));
    panel.append(controls);

    const editor = $('<div class="sdb-layout-editor">');
    for (let r = 0; r < numRows; r++) {
        const rowEl = $('<div class="sdb-layout-row">');
        for (let c = 0; c < numCols; c++) {
            const idx = r * numCols + c;
            if (idx < flat.length) {
                const key       = flat[idx];
                const die       = diceByKey.get(key);
                const tileLabel = die ? (die.label || die.formula) : key;
                rowEl.append(
                    $('<div class="sdb-layout-tile" draggable="true">')
                        .attr("data-index", idx)
                        .text(tileLabel)
                );
            } else {
                rowEl.append($('<div class="sdb-layout-slot">').attr("data-index", idx));
            }
        }
        editor.append(rowEl);
    }
    panel.append(editor);
}

function reshapeGrid(pendingGrid, numRows, flat = pendingGrid.flat()) {
    const numCols = Math.ceil(flat.length / numRows);
    pendingGrid.splice(0);
    for (let r = 0; r < numRows; r++) {
        const row = flat.slice(r * numCols, (r + 1) * numCols);
        if (row.length > 0) pendingGrid.push(row);
    }
}

// Builds one editable Dice-tab row. `savedVisibility` seeds the checkbox state; an unknown
// key defaults to visible. Each row gets a delete button.
function makeRow(formula, label = "", savedVisibility = {}) {
    const key       = dieKey(formula, label);
    const safe      = escapeHtml(formula);
    const safeLabel = escapeHtml(label);
    const safeKey   = escapeHtml(key);
    const checked   = savedVisibility[key] !== false ? "checked" : "";
    return `
        <tr data-formula="${safe}" data-key="${safeKey}">
            <td><input type="text" class="sdb-formula-cell-input" value="${safe}"></td>
            <td><input type="text" class="sdb-label-cell-input" value="${safeLabel}"></td>
            <td class="sdb-checkbox-cell"><input type="checkbox" name="${safeKey}" ${checked}></td>
            <td class="sdb-delete-cell"><button type="button" class="sdb-delete-btn">&#10005;</button></td>
        </tr>
    `;
}

// Assembles the full config-dialog inner HTML (the four tabs and their panels). Rows are
// rendered in saved-grid order, skipping any grid key without a matching custom die.
function buildConfigContent(pendingCustom, pendingGrid, barHidden, savedVisibility) {
    const allKeys   = new Set(dieKeys(pendingCustom));
    const diceByKey = new Map(pendingCustom.map(d => [dieKey(d.formula, d.label), d]));
    const flatKeys  = pendingGrid.flat().filter(k => allKeys.has(k));

    return `
        <div class="sdb-tabs">
            <button type="button" class="sdb-tab sdb-tab-active" data-tab="dice">${translate("Tab.Dice")}</button>
            <button type="button" class="sdb-tab" data-tab="layout">${translate("Tab.Layout")}</button>
            <button type="button" class="sdb-tab" data-tab="reset">${translate("Tab.Reset")}</button>
            <button type="button" class="sdb-tab" data-tab="extra">${translate("Tab.Extra")}</button>
        </div>
        <div class="sdb-tab-panel" data-panel="dice">
            <table class="sdb-config-table">
                <thead>
                    <tr><th>${translate("Table.Formula")}</th><th>${translate("Table.Label")}</th><th>${translate("Table.Visible")}</th><th></th></tr>
                </thead>
                <tbody>
                    ${flatKeys.map(key => {
                        const die = diceByKey.get(key);
                        return makeRow(die.formula, die.label, savedVisibility);
                    }).join("")}
                </tbody>
            </table>
            <div class="sdb-add-row">
                <input type="text" class="sdb-formula-input" placeholder="${escapeHtml(translate("AddForm.FormulaPlaceholder"))}">
                <input type="text" class="sdb-label-input" placeholder="${escapeHtml(translate("AddForm.LabelPlaceholder"))}">
                <button type="button" class="sdb-add-btn">${translate("AddForm.AddButton")}</button>
            </div>
        </div>
        <div class="sdb-tab-panel sdb-tab-panel-hidden" data-panel="layout"></div>
        <div class="sdb-tab-panel sdb-tab-panel-hidden" data-panel="extra">
            <div class="sdb-extra-panel">
                <label class="sdb-extra-item">
                    <input type="checkbox" class="sdb-hide-bar-checkbox"${barHidden ? " checked" : ""}>
                    <div>
                        <strong>${translate("Extra.HideBarTitle")}</strong>
                        <p>${translate("Extra.HideBarDesc")}</p>
                        <p>${translate("Extra.HideBarRestore")}</p>
                    </div>
                </label>
            </div>
        </div>
        <div class="sdb-tab-panel sdb-tab-panel-hidden" data-panel="reset">
            <div class="sdb-reset-panel">
                <div class="sdb-reset-item">
                    <div>
                        <strong>${translate("Reset.PositionTitle")}</strong>
                        <p>${translate("Reset.PositionDesc")}</p>
                    </div>
                    <button type="button" class="sdb-reset-position-btn">${translate("Reset.PositionButton")}</button>
                </div>
                <div class="sdb-reset-item">
                    <div>
                        <strong>${translate("Reset.ClearTitle")}</strong>
                        <p>${translate("Reset.ClearDesc")}</p>
                    </div>
                    <button type="button" class="sdb-clear-dice-btn">${translate("Reset.ClearButton")}</button>
                </div>
            </div>
        </div>
    `;
}

// Two-phase commit of the Dice tab's edited rows into pendingCustom / pendingGrid.
// Phase 1 reads every row and validates; an invalid formula keeps the original (warned).
// Phase 2 commits each valid edit that doesn't collide with a kept original or a key already
// committed by an earlier row (warned on collision). Mutates pendingCustom and pendingGrid in
// place and returns the new visibility map keyed by each row's resolved die key.
function commitDiceEdits($html, pendingCustom, pendingGrid) {
    // Phase 1: read all rows; warn on invalid formulas per-row but keep going.
    const rowData = [];
    $html.find("tbody tr").each(function () {
        const $row      = $(this);
        const oldKey    = $row.data("key");
        const newRaw    = $row.find(".sdb-formula-cell-input").val().trim().toLowerCase().replace(/\s+/g, "");
        const newLabel  = $row.find(".sdb-label-cell-input").val().trim();
        const checked   = $row.find("input[type=checkbox]").prop("checked");
        const formulaOk = isValidFormula(newRaw);
        const newKey    = dieKey(newRaw, newLabel);
        if (!formulaOk) {
            notify("Notify.InvalidKeepOriginal", { formula: newRaw });
        }
        rowData.push({ oldKey, newRaw, newLabel, newKey, checked, formulaOk });
    });

    // Originals that won't vacate: invalid edit, or key not actually changed.
    // Any valid edit targeting one of these keys would create a duplicate.
    const keepOriginalKeys = new Set(
        rowData.filter(r => !r.formulaOk || r.newKey === r.oldKey).map(r => r.oldKey)
    );

    // Phase 2: commit each valid edit that doesn't collide with a kept original
    // or an already-committed key from an earlier row.
    const committed     = new Set();
    const keyMap        = new Map();
    const newVisibility = {};

    for (const row of rowData) {
        let resolvedKey = row.oldKey;
        if (row.formulaOk) {
            if (row.newKey !== row.oldKey && keepOriginalKeys.has(row.newKey)) {
                notify("Notify.AlreadyExistsKeepOriginal", { die: dieDisplay(row.newRaw, row.newLabel) });
            } else if (committed.has(row.newKey)) {
                notify("Notify.AlreadyExistsKeepOriginal", { die: dieDisplay(row.newRaw, row.newLabel) });
            } else {
                resolvedKey = row.newKey;
                const entry = pendingCustom.find(d => dieKey(d.formula, d.label) === row.oldKey);
                if (entry) { entry.formula = row.newRaw; entry.label = row.newLabel; }
                if (resolvedKey !== row.oldKey) keyMap.set(row.oldKey, resolvedKey);
            }
        }
        committed.add(resolvedKey);
        newVisibility[resolvedKey] = row.checked;
    }
    for (let r = 0; r < pendingGrid.length; r++) {
        pendingGrid[r] = pendingGrid[r].map(k => keyMap.get(k) ?? k);
    }

    return newVisibility;
}

async function openConfig(diceBar) {
    const savedVisibility = game.user.getFlag(MODULE_ID, "diceVisibility") ?? {};
    const barHidden       = game.settings.get(MODULE_ID, "barHidden");
    const pendingCustom   = [...getCustomDice()];
    const pendingGrid     = getBarGrid().map(row => [...row]);

    let saved                = false;
    let pendingResetPosition = false;
    let originalPosition     = null;
    let pendingResetDice     = false;

    function wireLayoutTab($html) {
        let dragIndex = -1;

        $html.on("dragstart", ".sdb-layout-tile", (e) => {
            dragIndex = parseInt($(e.currentTarget).data("index"));
            e.originalEvent.dataTransfer.effectAllowed = "move";
            setTimeout(() => $(e.currentTarget).addClass("sdb-dragging"), 0);
        });

        $html.on("dragend", ".sdb-layout-tile", () => {
            $html.find(".sdb-layout-tile, .sdb-layout-slot").removeClass("sdb-dragging sdb-slot-over");
            dragIndex = -1;
        });

        $html.on("dragover", ".sdb-layout-tile, .sdb-layout-slot", (e) => {
            const idx = parseInt($(e.currentTarget).data("index"));
            if (dragIndex === -1 || idx === dragIndex) return;
            e.preventDefault();
            $html.find(".sdb-layout-tile, .sdb-layout-slot").removeClass("sdb-slot-over");
            $(e.currentTarget).addClass("sdb-slot-over");
        });

        $html.on("dragleave", ".sdb-layout-tile, .sdb-layout-slot", (e) => {
            $(e.currentTarget).removeClass("sdb-slot-over");
        });

        $html.on("drop", ".sdb-layout-tile, .sdb-layout-slot", (e) => {
            e.preventDefault();
            const tgtIdx = parseInt($(e.currentTarget).data("index"));
            const srcIdx = dragIndex;
            dragIndex = -1;
            if (srcIdx === -1 || tgtIdx === srcIdx) return;

            const flat = pendingGrid.flat();
            const key  = flat[srcIdx];
            flat.splice(srcIdx, 1);
            const adjusted = srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx;
            flat.splice(Math.min(adjusted, flat.length), 0, key);

            reshapeGrid(pendingGrid, pendingGrid.length, flat);
            renderLayoutEditor($html, pendingGrid, pendingCustom);
        });

        $html.on("change", ".sdb-rows-input", (e) => {
            const flat = pendingGrid.flat();
            let n = parseInt(e.target.value);
            if (isNaN(n) || n < 1) n = 1;
            if (n > flat.length) n = flat.length;
            $(e.target).val(n);
            reshapeGrid(pendingGrid, n, flat);
            renderLayoutEditor($html, pendingGrid, pendingCustom);
        });
    }

    function wireResetTab($html) {
        $html.on("click", ".sdb-reset-position-btn", () => {
            if (!pendingResetPosition) {
                originalPosition = {
                    left: parseInt(diceBar.css("left")),
                    top:  parseInt(diceBar.css("top")),
                };
            }
            pendingResetPosition = true;
            applyBarPosition(diceBar, null);
        });

        $html.on("click", ".sdb-clear-dice-btn", () => {
            pendingResetDice = true;
            pendingCustom.splice(0);
            pendingGrid.splice(0, pendingGrid.length, []);
            $html.find("tbody tr").remove();

            if (!$html.find("[data-panel='layout']").hasClass("sdb-tab-panel-hidden")) {
                renderLayoutEditor($html, pendingGrid, pendingCustom);
            }

            renderBar(diceBar, { customDice: [], grid: [[]], visibility: {} });
        });
    }

    function wireDiceTab($html) {
        $html.on("click", ".sdb-delete-btn", (e) => {
            const row       = $(e.currentTarget).closest("tr");
            const key       = row.data("key");
            const customIdx = pendingCustom.findIndex(d => dieKey(d.formula, d.label) === key);
            if (customIdx !== -1) {
                pendingCustom.splice(customIdx, 1);
                for (let r = 0; r < pendingGrid.length; r++) {
                    const idx = pendingGrid[r].indexOf(key);
                    if (idx !== -1) {
                        pendingGrid[r].splice(idx, 1);
                        if (pendingGrid[r].length === 0) pendingGrid.splice(r, 1);
                        break;
                    }
                }
            }
            row.remove();
        });

        $html.on("click", ".sdb-add-btn", () => {
            const input      = $html.find(".sdb-formula-input");
            const labelInput = $html.find(".sdb-label-input");
            const raw   = input.val().trim().toLowerCase().replace(/\s+/g, "");
            const label = labelInput.val().trim();

            if (!isValidFormula(raw)) {
                notify("Notify.InvalidFormula");
                return;
            }
            if (pendingCustom.some(d => d.formula === raw && d.label === label)) {
                notify("Notify.AlreadyExists", { die: dieDisplay(raw, label) });
                return;
            }

            const key = dieKey(raw, label);
            pendingCustom.push({ formula: raw, label });
            if (pendingGrid.length === 0) pendingGrid.push([key]);
            else pendingGrid[pendingGrid.length - 1].push(key);

            $html.find("tbody").append(makeRow(raw, label, savedVisibility));
            input.val("").focus();
            labelInput.val("");
        });

        $html.on("keydown", ".sdb-formula-input, .sdb-label-input", (e) => {
            if (e.key === "Enter") $html.find(".sdb-add-btn").trigger("click");
        });
    }

    function wireExtraTab($html) {
        $html.on("change", ".sdb-hide-bar-checkbox", (e) => {
            if (e.target.checked) diceBar.hide();
            else                  diceBar.show();
        });
    }

    const content = buildConfigContent(pendingCustom, pendingGrid, barHidden, savedVisibility);

    await foundry.applications.api.DialogV2.wait({
        window:      { title: translate("Dialog.Title", { title: MODULE_TITLE }) },
        content,
        rejectClose: false,
        buttons: [
            {
                action: "save",
                label: translate("Dialog.Save"),
                callback: async (event, button, dialog) => {
                    const $html = $(dialog.element);
                    const newVisibility = commitDiceEdits($html, pendingCustom, pendingGrid);

                    saved = true;
                    await game.user.setFlag(MODULE_ID, "diceVisibility", newVisibility);
                    await game.user.setFlag(MODULE_ID, "customDice", pendingCustom);
                    await game.user.setFlag(MODULE_ID, "barGrid", pendingGrid);
                    if (pendingResetPosition) {
                        await game.user.unsetFlag(MODULE_ID, "barPosition");
                    }
                    const newBarHidden = $html.find(".sdb-hide-bar-checkbox").prop("checked");
                    await game.settings.set(MODULE_ID, "barHidden", newBarHidden);
                    if (newBarHidden) diceBar.hide();
                    else              diceBar.show();
                    renderBar(diceBar);
                }
            },
            { action: "cancel", label: translate("Dialog.Cancel"), default: true }
        ],
        render: (event, dialog) => {
            const $html = $(dialog.element);

            $html.on("click", ".sdb-tab", (e) => {
                const tab = e.currentTarget.dataset.tab;
                $html.find(".sdb-tab").removeClass("sdb-tab-active");
                $(e.currentTarget).addClass("sdb-tab-active");
                $html.find(".sdb-tab-panel").addClass("sdb-tab-panel-hidden");
                $html.find(`[data-panel="${tab}"]`).removeClass("sdb-tab-panel-hidden");
                if (tab === "layout") renderLayoutEditor($html, pendingGrid, pendingCustom);
            });

            wireLayoutTab($html);
            wireResetTab($html);
            wireDiceTab($html);
            wireExtraTab($html);
        }
    });

    if (!saved) {
        if (pendingResetPosition) diceBar.css(originalPosition);
        if (pendingResetDice)     renderBar(diceBar);
        if (barHidden) diceBar.hide();
        else           diceBar.show();
    }
}

Hooks.once("init", () => {
    console.log(`${MODULE_TITLE} | Initialized`);
    game.settings.register(MODULE_ID, "barHidden", {
        name: "STARDICEBAR.Settings.HideBar.Name",
        hint: "STARDICEBAR.Settings.HideBar.Hint",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            if (value) $(".sdb-dice-bar").hide();
            else       $(".sdb-dice-bar").show();
        },
    });
});

Hooks.once("ready", () => {
    const diceBar = $(`<div class="sdb-dice-bar">
        <div class="sdb-bar-controls">
            <span class="sdb-bar-handle" title="${escapeHtml(translate("Bar.DragHandleTitle"))}">&#8801;</span>
            <button class="sdb-mode-btn sdb-mode-normal" data-mode="normal" title="${escapeHtml(translate("Bar.ModeButtonTitle"))}">${translate("Mode.Normal")}</button>
            <button class="sdb-config-btn" title="${escapeHtml(translate("Bar.ConfigButtonTitle"))}">&#9881;</button>
        </div>
        <div class="sdb-dice-grid"></div>
    </div>`);

    diceBar.data("rollMode", "normal");
    const modeBtn = diceBar.find(".sdb-mode-btn");

    modeBtn.on("click", () => {
        const current = diceBar.data("rollMode") || "normal";
        const next = ROLL_MODES[(ROLL_MODES.indexOf(current) + 1) % ROLL_MODES.length];
        diceBar.data("rollMode", next);
        modeBtn
            .text(translate(MODE_LABEL_KEYS[next]))
            .attr("data-mode", next)
            .removeClass("sdb-mode-normal sdb-mode-advantage sdb-mode-disadvantage")
            .addClass(`sdb-mode-${next}`);
    });

    $("body").append(diceBar);
    renderBar(diceBar);
    initBarDrag(diceBar);
    // Defer until after the browser has laid out the element so outerWidth() is accurate,
    // which makes the default centred position match what "Reset Position" produces.
    requestAnimationFrame(() => {
        applyBarPosition(diceBar);
        if (game.settings.get(MODULE_ID, "barHidden")) diceBar.hide();
    });

    let configOpen = false;
    diceBar.find(".sdb-config-btn").click(async () => {
        if (configOpen) return;
        configOpen = true;
        try {
            await openConfig(diceBar);
        } finally {
            configOpen = false;
        }
    });
});

if (typeof module !== "undefined") module.exports = { commitDiceEdits, buildConfigContent, makeRow };
})();
