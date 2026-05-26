// IIFE so module-scoped declarations (MODULE_ID, MODULE_TITLE, etc.) never leak into a
// shared/global scope. Sibling modules each declare `const MODULE_ID`; without this wrapper,
// loading them in the same realm (e.g. as classic scripts, or a hot-reload re-eval) throws
// "Identifier 'MODULE_ID' has already been declared".
(function () {
const MODULE_ID = "star-quick-dice";
const MODULE_TITLE = "Star Quick Dice";

const ROLL_MODES = ["normal", "advantage", "disadvantage"];
const MODE_LABELS = { normal: "Normal", advantage: "Adv", disadvantage: "Dis" };

// A custom die formula: one or more `NdX` dice terms and/or integers joined by + / -,
// e.g. "1d20", "2d6+3", "1d8+1d6". Leading sign and bare die size (e.g. "d6") are rejected.
const FORMULA_RE = /^\d+(?:d\d+)?(?:[+-]\d+(?:d\d+)?)*$/;
function isValidFormula(raw) {
    return FORMULA_RE.test(raw) && raw.includes("d");
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

function customFormulas(customDice = getCustomDice()) {
    return customDice.map(d => d.formula);
}

function getBarGrid(customDice = getCustomDice()) {
    const saved = game.user.getFlag(MODULE_ID, "barGrid");
    if (saved?.length) return saved;
    return [customFormulas(customDice)];
}

function getVisibility(customDice = getCustomDice()) {
    const saved = game.user.getFlag(MODULE_ID, "diceVisibility") ?? {};
    const visibility = {};
    for (const formula of customFormulas(customDice)) {
        visibility[formula] = saved[formula] !== false;
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
    diceBar.find(".sqd-bar-handle").on("mousedown", (e) => {
        e.preventDefault();
        startX    = e.clientX;
        startY    = e.clientY;
        startLeft = parseInt(diceBar.css("left")) || 0;
        startTop  = parseInt(diceBar.css("top"))  || 0;

        $(document).on("mousemove.sqd-drag", (e) => {
            const left = Math.max(0, Math.min(window.innerWidth  - diceBar.outerWidth(),  startLeft + e.clientX - startX));
            const top  = Math.max(0, Math.min(window.innerHeight - diceBar.outerHeight(), startTop  + e.clientY - startY));
            diceBar.css({ left, top });
        });

        $(document).on("mouseup.sqd-drag", () => {
            $(document).off("mousemove.sqd-drag mouseup.sqd-drag");
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
        let flavor = `Quick Roll: ${label ? `${label} (${formula})` : formula}`;
        if (mode === "advantage")         flavor += " — Advantage";
        else if (mode === "disadvantage") flavor += " — Disadvantage";
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
    const knownDice  = new Set(customFormulas(customDice));
    const labels     = new Map(customDice.map(d => [d.formula, d.label]));
    const gridEl = diceBar.find(".sqd-dice-grid");
    gridEl.empty();
    const multirow = grid.length > 1;
    diceBar.toggleClass("sqd-bar-multirow", multirow);
    if (multirow) {
        const maxCols = Math.max(...grid.map(r => r.length));
        gridEl.css("--sqd-cols", maxCols);
    } else {
        gridEl.css("--sqd-cols", "");
    }

    grid.forEach(row => {
        const rowEl = $('<div class="sqd-bar-row">');
        row.forEach(formula => {
            if (!knownDice.has(formula)) return;
            const label = labels.get(formula) || "";
            const btn = $("<button>")
                .attr("data-roll", formula)
                .attr("title", formula)
                .text(label || formula);
            if (!visibility[formula]) btn.hide();
            btn.click(makeRollClickHandler(diceBar, formula, label));
            rowEl.append(btn);
        });
        gridEl.append(rowEl);
    });

    if (gridEl.find("button[data-roll]").length === 0) {
        gridEl.append('<span class="sqd-empty-hint">Click the gear to add dice</span>');
    }
}

function renderLayoutEditor(html, pendingGrid) {
    const panel = html.find('[data-panel="layout"]');
    panel.empty();

    if (pendingGrid.length === 0 || pendingGrid.every(r => r.length === 0)) {
        panel.append('<p class="sqd-layout-empty">No dice configured. Add dice on the Dice tab.</p>');
        return;
    }

    const flat    = pendingGrid.flat();
    const numRows = pendingGrid.length;
    const numCols = Math.ceil(flat.length / numRows);

    panel.append('<p class="sqd-layout-hint">Drag any die to a slot to reorder &middot; Change the row count to reorganize the grid</p>');

    const controls = $('<div class="sqd-layout-controls">');
    const rowInput = $('<input type="number" class="sqd-rows-input">')
        .attr("min", 1).attr("max", flat.length).val(numRows);
    controls.append($('<label class="sqd-rows-label">').text("Number of Rows: ").append(rowInput));
    panel.append(controls);

    const editor = $('<div class="sqd-layout-editor">');
    for (let r = 0; r < numRows; r++) {
        const rowEl = $('<div class="sqd-layout-row">');
        for (let c = 0; c < numCols; c++) {
            const idx = r * numCols + c;
            if (idx < flat.length) {
                rowEl.append(
                    $('<div class="sqd-layout-tile" draggable="true">')
                        .attr("data-index", idx)
                        .text(flat[idx])
                );
            } else {
                rowEl.append($('<div class="sqd-layout-slot">').attr("data-index", idx));
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

async function openConfig(diceBar) {
    const savedVisibility = game.user.getFlag(MODULE_ID, "diceVisibility") ?? {};
    const barHidden       = game.settings.get(MODULE_ID, "barHidden");
    const pendingCustom   = [...getCustomDice()];
    const pendingGrid     = getBarGrid().map(row => [...row]);

    let saved                = false;
    let pendingResetPosition = false;
    let originalPosition     = null;
    let pendingResetDice     = false;

    function makeRow(formula, isCustom, label = "") {
        const safe      = escapeHtml(formula);
        const safeLabel = escapeHtml(label);
        const checked = savedVisibility[formula] !== false ? "checked" : "";
        const deleteBtn = isCustom
            ? `<button type="button" class="sqd-delete-btn">&#10005;</button>`
            : "";
        return `
            <tr data-formula="${safe}">
                <td><input type="text" class="sqd-formula-cell-input" value="${safe}"></td>
                <td><input type="text" class="sqd-nick-cell-input" value="${safeLabel}" placeholder="Nickname"></td>
                <td class="sqd-checkbox-cell"><input type="checkbox" name="${safe}" ${checked}></td>
                <td class="sqd-delete-cell">${deleteBtn}</td>
            </tr>
        `;
    }

    function wireLayoutTab($html) {
        let dragIndex = -1;

        $html.on("dragstart", ".sqd-layout-tile", (e) => {
            dragIndex = parseInt($(e.currentTarget).data("index"));
            e.originalEvent.dataTransfer.effectAllowed = "move";
            setTimeout(() => $(e.currentTarget).addClass("sqd-dragging"), 0);
        });

        $html.on("dragend", ".sqd-layout-tile", () => {
            $html.find(".sqd-layout-tile, .sqd-layout-slot").removeClass("sqd-dragging sqd-slot-over");
            dragIndex = -1;
        });

        $html.on("dragover", ".sqd-layout-tile, .sqd-layout-slot", (e) => {
            const idx = parseInt($(e.currentTarget).data("index"));
            if (dragIndex === -1 || idx === dragIndex) return;
            e.preventDefault();
            $html.find(".sqd-layout-tile, .sqd-layout-slot").removeClass("sqd-slot-over");
            $(e.currentTarget).addClass("sqd-slot-over");
        });

        $html.on("dragleave", ".sqd-layout-tile, .sqd-layout-slot", (e) => {
            $(e.currentTarget).removeClass("sqd-slot-over");
        });

        $html.on("drop", ".sqd-layout-tile, .sqd-layout-slot", (e) => {
            e.preventDefault();
            const tgtIdx = parseInt($(e.currentTarget).data("index"));
            const srcIdx = dragIndex;
            dragIndex = -1;
            if (srcIdx === -1 || tgtIdx === srcIdx) return;

            const flat    = pendingGrid.flat();
            const formula = flat[srcIdx];
            flat.splice(srcIdx, 1);
            const adjusted = srcIdx < tgtIdx ? tgtIdx - 1 : tgtIdx;
            flat.splice(Math.min(adjusted, flat.length), 0, formula);

            reshapeGrid(pendingGrid, pendingGrid.length, flat);
            renderLayoutEditor($html, pendingGrid);
        });

        $html.on("change", ".sqd-rows-input", (e) => {
            const flat = pendingGrid.flat();
            let n = parseInt(e.target.value);
            if (isNaN(n) || n < 1) n = 1;
            if (n > flat.length) n = flat.length;
            $(e.target).val(n);
            reshapeGrid(pendingGrid, n, flat);
            renderLayoutEditor($html, pendingGrid);
        });
    }

    function wireResetTab($html) {
        $html.on("click", ".sqd-reset-position-btn", () => {
            if (!pendingResetPosition) {
                originalPosition = {
                    left: parseInt(diceBar.css("left")),
                    top:  parseInt(diceBar.css("top")),
                };
            }
            pendingResetPosition = true;
            applyBarPosition(diceBar, null);
        });

        $html.on("click", ".sqd-clear-dice-btn", () => {
            pendingResetDice = true;
            pendingCustom.splice(0);
            pendingGrid.splice(0, pendingGrid.length, []);
            $html.find("tbody tr").remove();

            if (!$html.find("[data-panel='layout']").hasClass("sqd-tab-panel-hidden")) {
                renderLayoutEditor($html, pendingGrid);
            }

            renderBar(diceBar, { customDice: [], grid: [[]], visibility: {} });
        });
    }

    function wireDiceTab($html) {
        $html.on("click", ".sqd-delete-btn", (e) => {
            const row       = $(e.currentTarget).closest("tr");
            const formula   = row.data("formula");
            const customIdx = pendingCustom.findIndex(d => d.formula === formula);
            if (customIdx !== -1) {
                pendingCustom.splice(customIdx, 1);
                for (let r = 0; r < pendingGrid.length; r++) {
                    const idx = pendingGrid[r].indexOf(formula);
                    if (idx !== -1) {
                        pendingGrid[r].splice(idx, 1);
                        if (pendingGrid[r].length === 0) pendingGrid.splice(r, 1);
                        break;
                    }
                }
            }
            row.remove();
        });

        $html.on("click", ".sqd-add-btn", () => {
            const input     = $html.find(".sqd-formula-input");
            const nickInput = $html.find(".sqd-nick-input");
            const raw  = input.val().trim().toLowerCase().replace(/\s+/g, "");
            const nick = nickInput.val().trim();

            if (!isValidFormula(raw)) {
                ui.notifications.warn(`${MODULE_TITLE}: Invalid dice formula. Use dice with +/- numbers, e.g. 1d20, 2d6+3, 1d8+1d6.`);
                return;
            }
            if (customFormulas(pendingCustom).includes(raw)) {
                ui.notifications.warn(`${MODULE_TITLE}: ${raw} already exists.`);
                return;
            }

            pendingCustom.push({ formula: raw, label: nick });
            if (pendingGrid.length === 0) pendingGrid.push([raw]);
            else pendingGrid[pendingGrid.length - 1].push(raw);

            $html.find("tbody").append(makeRow(raw, true, nick));
            input.val("").focus();
            nickInput.val("");
        });

        $html.on("keydown", ".sqd-formula-input, .sqd-nick-input", (e) => {
            if (e.key === "Enter") $html.find(".sqd-add-btn").trigger("click");
        });
    }

    function wireExtraTab($html) {
        $html.on("change", ".sqd-hide-bar-checkbox", (e) => {
            if (e.target.checked) diceBar.hide();
            else                  diceBar.show();
        });
    }

    const allDice      = new Set(customFormulas(pendingCustom));
    const customLabels = new Map(pendingCustom.map(d => [d.formula, d.label]));
    const flatDice     = pendingGrid.flat().filter(f => allDice.has(f));

    const content = `
        <div class="sqd-tabs">
            <button type="button" class="sqd-tab sqd-tab-active" data-tab="dice">Dice</button>
            <button type="button" class="sqd-tab" data-tab="layout">Layout</button>
            <button type="button" class="sqd-tab" data-tab="reset">Reset</button>
            <button type="button" class="sqd-tab" data-tab="extra">Extra</button>
        </div>
        <div class="sqd-tab-panel" data-panel="dice">
            <table class="sqd-config-table">
                <thead>
                    <tr><th>Dice</th><th>Name</th><th>Visible</th><th></th></tr>
                </thead>
                <tbody>
                    ${flatDice.map(formula =>
                        makeRow(formula, customLabels.has(formula), customLabels.get(formula))
                    ).join("")}
                </tbody>
            </table>
            <div class="sqd-add-row">
                <input type="text" class="sqd-formula-input" placeholder="Formula e.g. 1d20, 2d6+3">
                <input type="text" class="sqd-nick-input" placeholder="Nickname (optional)">
                <button type="button" class="sqd-add-btn">Add</button>
            </div>
        </div>
        <div class="sqd-tab-panel sqd-tab-panel-hidden" data-panel="layout"></div>
        <div class="sqd-tab-panel sqd-tab-panel-hidden" data-panel="extra">
            <div class="sqd-extra-panel">
                <label class="sqd-extra-item">
                    <input type="checkbox" class="sqd-hide-bar-checkbox"${barHidden ? " checked" : ""}>
                    <div>
                        <strong>Hide Button Bar</strong>
                        <p>Hide the button bar from the screen.</p>
                        <p>To restore it, uncheck this option in Configure Game Settings.</p>
                    </div>
                </label>
            </div>
        </div>
        <div class="sqd-tab-panel sqd-tab-panel-hidden" data-panel="reset">
            <div class="sqd-reset-panel">
                <div class="sqd-reset-item">
                    <div>
                        <strong>Reset Bar Position</strong>
                        <p>Move the button bar to the default position at the top center of the screen.</p>
                    </div>
                    <button type="button" class="sqd-reset-position-btn">Reset Position</button>
                </div>
                <div class="sqd-reset-item">
                    <div>
                        <strong>Clear All Dice</strong>
                        <p>Remove every die from the bar.</p>
                    </div>
                    <button type="button" class="sqd-clear-dice-btn">Clear Dice</button>
                </div>
            </div>
        </div>
    `;

    await foundry.applications.api.DialogV2.wait({
        window:      { title: `${MODULE_TITLE} — Configure (save to persist changes)` },
        content,
        rejectClose: false,
        buttons: [
            {
                action: "save",
                label: "Save",
                callback: async (event, button, dialog) => {
                    const $html = $(dialog.element);

                    // Read and validate formula edits from the table rows.
                    const editedRows = [];
                    const formulasSeen = new Set();
                    let editValid = true;
                    $html.find("tbody tr").each(function () {
                        if (!editValid) return false;
                        const $row    = $(this);
                        const oldFormula = $row.data("formula");
                        const newRaw  = $row.find(".sqd-formula-cell-input").val().trim().toLowerCase().replace(/\s+/g, "");
                        const newLabel = $row.find(".sqd-nick-cell-input").val().trim();
                        const checked  = $row.find("input[type=checkbox]").prop("checked");
                        if (!isValidFormula(newRaw)) {
                            ui.notifications.warn(`${MODULE_TITLE}: "${newRaw}" is not a valid dice formula.`);
                            editValid = false;
                        } else if (formulasSeen.has(newRaw)) {
                            ui.notifications.warn(`${MODULE_TITLE}: "${newRaw}" appears more than once.`);
                            editValid = false;
                        } else {
                            formulasSeen.add(newRaw);
                            editedRows.push({ oldFormula, newFormula: newRaw, newLabel, checked });
                        }
                    });
                    if (!editValid) return false;

                    // Apply formula/label edits to pending state.
                    const formulaMap = new Map(editedRows.map(r => [r.oldFormula, r.newFormula]));
                    for (const row of editedRows) {
                        const entry = pendingCustom.find(d => d.formula === row.oldFormula);
                        if (entry) { entry.formula = row.newFormula; entry.label = row.newLabel; }
                    }
                    for (let r = 0; r < pendingGrid.length; r++) {
                        pendingGrid[r] = pendingGrid[r].map(f => formulaMap.get(f) ?? f);
                    }
                    const newVisibility = {};
                    for (const { newFormula, checked } of editedRows) {
                        newVisibility[newFormula] = checked;
                    }

                    saved = true;
                    await game.user.setFlag(MODULE_ID, "diceVisibility", newVisibility);
                    await game.user.setFlag(MODULE_ID, "customDice", pendingCustom);
                    await game.user.setFlag(MODULE_ID, "barGrid", pendingGrid);
                    if (pendingResetPosition) {
                        await game.user.unsetFlag(MODULE_ID, "barPosition");
                    }
                    const newBarHidden = $html.find(".sqd-hide-bar-checkbox").prop("checked");
                    await game.settings.set(MODULE_ID, "barHidden", newBarHidden);
                    if (newBarHidden) diceBar.hide();
                    else              diceBar.show();
                    renderBar(diceBar);
                }
            },
            { action: "cancel", label: "Cancel", default: true }
        ],
        render: (event, dialog) => {
            const $html = $(dialog.element);

            $html.on("click", ".sqd-tab", (e) => {
                const tab = e.currentTarget.dataset.tab;
                $html.find(".sqd-tab").removeClass("sqd-tab-active");
                $(e.currentTarget).addClass("sqd-tab-active");
                $html.find(".sqd-tab-panel").addClass("sqd-tab-panel-hidden");
                $html.find(`[data-panel="${tab}"]`).removeClass("sqd-tab-panel-hidden");
                if (tab === "layout") renderLayoutEditor($html, pendingGrid);
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
        name: "Hide Button Bar",
        hint: "Remove the button bar from the screen. Toggle this setting to bring it back.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            if (value) $(".sqd-dice-bar").hide();
            else       $(".sqd-dice-bar").show();
        },
    });
});

Hooks.once("ready", () => {
    const diceBar = $(`<div class="sqd-dice-bar">
        <div class="sqd-bar-controls">
            <span class="sqd-bar-handle" title="Drag to move bar">&#8801;</span>
            <button class="sqd-mode-btn sqd-mode-normal" data-mode="normal" title="Roll mode: click to cycle Normal / Advantage / Disadvantage">Normal</button>
            <button class="sqd-config-btn" title="Configure Dice">&#9881;</button>
        </div>
        <div class="sqd-dice-grid"></div>
    </div>`);

    diceBar.data("rollMode", "normal");
    const modeBtn = diceBar.find(".sqd-mode-btn");
    modeBtn.on("click", () => {
        const current = diceBar.data("rollMode") || "normal";
        const next = ROLL_MODES[(ROLL_MODES.indexOf(current) + 1) % ROLL_MODES.length];
        diceBar.data("rollMode", next);
        modeBtn
            .text(MODE_LABELS[next])
            .attr("data-mode", next)
            .removeClass("sqd-mode-normal sqd-mode-advantage sqd-mode-disadvantage")
            .addClass(`sqd-mode-${next}`);
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
    diceBar.find(".sqd-config-btn").click(async () => {
        if (configOpen) return;
        configOpen = true;
        try {
            await openConfig(diceBar);
        } finally {
            configOpen = false;
        }
    });
});

if (typeof module !== "undefined") module.exports = {};
})();
