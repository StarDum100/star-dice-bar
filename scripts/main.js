const BUILT_IN_DICE = [
    { label: "d4",   formula: "1d4"   },
    { label: "d6",   formula: "1d6"   },
    { label: "d8",   formula: "1d8"   },
    { label: "d10",  formula: "1d10"  },
    { label: "d12",  formula: "1d12"  },
    { label: "d20",  formula: "1d20"  },
    { label: "d100", formula: "1d100" },
];

function formulaToLabel(formula) {
    return formula.replace(/^1d/, "d");
}

function applyGridDrop(grid, srcFormula, tgtFormula, zone) {
    let srcRow = -1, srcCol = -1, tgtRow = -1, tgtCol = -1;
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] === srcFormula) { srcRow = r; srcCol = c; }
            if (grid[r][c] === tgtFormula) { tgtRow = r; tgtCol = c; }
        }
    }
    if (srcRow === -1 || tgtRow === -1) return;

    grid[srcRow].splice(srcCol, 1);

    if (srcRow === tgtRow && srcCol < tgtCol) tgtCol--;

    if (grid[srcRow].length === 0) {
        grid.splice(srcRow, 1);
        if (tgtRow > srcRow) tgtRow--;
    }

    if (zone === "left")        grid[tgtRow].splice(tgtCol,     0, srcFormula);
    else if (zone === "right")  grid[tgtRow].splice(tgtCol + 1, 0, srcFormula);
    else if (zone === "top")    grid.splice(tgtRow,     0, [srcFormula]);
    else if (zone === "bottom") grid.splice(tgtRow + 1, 0, [srcFormula]);
}

function getCustomDice() {
    return game.user.getFlag("star-quick-dice", "customDice") ?? [];
}

function getBarGrid() {
    const saved = game.user.getFlag("star-quick-dice", "barGrid");
    if (saved?.length) return saved;
    return [[...BUILT_IN_DICE, ...getCustomDice()].map(d => d.formula)];
}

function getVisibility() {
    const saved = game.user.getFlag("star-quick-dice", "diceVisibility") ?? {};
    const visibility = {};
    for (const die of [...BUILT_IN_DICE, ...getCustomDice()]) {
        visibility[die.formula] = saved[die.formula] !== false;
    }
    return visibility;
}

function applyBarPosition(diceBar) {
    const savedPos = game.user.getFlag("star-quick-dice", "barPosition");
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
            game.user.setFlag("star-quick-dice", "barPosition", {
                left: parseInt(diceBar.css("left")),
                top:  parseInt(diceBar.css("top")),
            });
        });
    });
}

function makeRollClickHandler(formula) {
    return async () => {
        const roll = new Roll(formula);
        await roll.evaluate();
        roll.toMessage({
            speaker: ChatMessage.getSpeaker(),
            flavor: `Quick Roll: ${formula}`,
        });
    };
}

function renderBar(diceBar) {
    const grid = getBarGrid();
    const visibility = getVisibility();
    const diceMap = new Map([...BUILT_IN_DICE, ...getCustomDice()].map(d => [d.formula, d]));
    const gridEl = diceBar.find(".sqd-dice-grid");
    gridEl.empty();

    grid.forEach((row, rowIdx) => {
        if (rowIdx > 0) gridEl.append($('<span class="sqd-row-break">'));
        row.forEach(formula => {
            const die = diceMap.get(formula);
            if (!die) return;
            const btn = $("<button>").attr("data-roll", formula).text(die.label);
            if (!visibility[formula]) btn.hide();
            btn.click(makeRollClickHandler(formula));
            gridEl.append(btn);
        });
    });
}

function renderLayoutEditor(html, pendingGrid, diceMap) {
    const panel = html.find('[data-panel="layout"]');
    panel.empty();

    if (pendingGrid.length === 0 || pendingGrid.every(r => r.length === 0)) {
        panel.append('<p class="sqd-layout-empty">No dice configured. Add dice on the Dice tab.</p>');
        return;
    }

    const editor = $('<div class="sqd-layout-editor">');
    pendingGrid.forEach(row => {
        const rowEl = $('<div class="sqd-layout-row">');
        row.forEach(formula => {
            const die = diceMap.get(formula);
            rowEl.append(
                $('<div class="sqd-layout-tile" draggable="true">')
                    .attr("data-formula", formula)
                    .text(die ? die.label : formula)
            );
        });
        editor.append(rowEl);
    });
    panel.append(editor);
}

function openConfig(diceBar) {
    const savedVisibility = game.user.getFlag("star-quick-dice", "diceVisibility") ?? {};
    const pendingCustom = [...getCustomDice()];
    const pendingGrid   = getBarGrid().map(row => [...row]);
    const diceMap       = new Map([...BUILT_IN_DICE, ...pendingCustom].map(d => [d.formula, d]));

    function makeRow(label, formula, isCustom) {
        const checked = savedVisibility[formula] !== false ? "checked" : "";
        const deleteBtn = isCustom
            ? `<button type="button" class="sqd-delete-btn">&#10005;</button>`
            : "";
        return `
            <tr data-formula="${formula}">
                <td>${label}</td>
                <td>${formula}</td>
                <td class="sqd-checkbox-cell"><input type="checkbox" name="${formula}" ${checked}></td>
                <td class="sqd-delete-cell">${deleteBtn}</td>
            </tr>
        `;
    }

    const flatDice = pendingGrid.flat().map(f => diceMap.get(f)).filter(Boolean);

    const content = `
        <div class="sqd-tabs">
            <button type="button" class="sqd-tab sqd-tab-active" data-tab="dice">Dice</button>
            <button type="button" class="sqd-tab" data-tab="layout">Layout</button>
            <button type="button" class="sqd-tab" data-tab="reset">Reset</button>
        </div>
        <div class="sqd-tab-panel" data-panel="dice">
            <table class="sqd-config-table">
                <thead>
                    <tr><th>Die</th><th>Formula</th><th>Visible</th><th></th></tr>
                </thead>
                <tbody>
                    ${flatDice.map(({ label, formula }) =>
                        makeRow(label, formula, pendingCustom.some(d => d.formula === formula))
                    ).join("")}
                </tbody>
            </table>
            <div class="sqd-add-row">
                <input type="text" class="sqd-formula-input" placeholder="e.g. 2d6, 1d105">
                <button type="button" class="sqd-add-btn">Add</button>
            </div>
        </div>
        <div class="sqd-tab-panel sqd-tab-panel-hidden" data-panel="layout"></div>
        <div class="sqd-tab-panel sqd-tab-panel-hidden" data-panel="reset">
            <div class="sqd-reset-panel">
                <div class="sqd-reset-item">
                    <div>
                        <strong>Reset Bar Position</strong>
                        <p>Move the button bar back to the default position at the top center of the screen.</p>
                    </div>
                    <button type="button" class="sqd-reset-position-btn">Reset Position</button>
                </div>
                <div class="sqd-reset-item">
                    <div>
                        <strong>Reset Dice Buttons</strong>
                        <p>Remove all custom dice and restore the default visibility and order.</p>
                    </div>
                    <button type="button" class="sqd-reset-dice-btn">Reset Dice</button>
                </div>
            </div>
        </div>
    `;

    const dialogInstance = new Dialog({
        title: "Star Quick Dice — Configure",
        content,
        buttons: {
            save: {
                label: "Save",
                callback: async (html) => {
                    const newVisibility = {};
                    html.find("input[type=checkbox]").each(function () {
                        newVisibility[this.name] = this.checked;
                    });
                    await game.user.setFlag("star-quick-dice", "diceVisibility", newVisibility);
                    await game.user.setFlag("star-quick-dice", "customDice", pendingCustom);
                    await game.user.setFlag("star-quick-dice", "barGrid", pendingGrid);
                    renderBar(diceBar);
                }
            },
            cancel: { label: "Cancel" }
        },
        default: "save",
        render: (html) => {
            // ── Tab switching ──────────────────────────────────────────────
            html.on("click", ".sqd-tab", (e) => {
                const tab = e.currentTarget.dataset.tab;
                html.find(".sqd-tab").removeClass("sqd-tab-active");
                $(e.currentTarget).addClass("sqd-tab-active");
                html.find(".sqd-tab-panel").addClass("sqd-tab-panel-hidden");
                html.find(`[data-panel="${tab}"]`).removeClass("sqd-tab-panel-hidden");
                if (tab === "layout") renderLayoutEditor(html, pendingGrid, diceMap);
            });

            // ── Layout tab drag-and-drop ───────────────────────────────────
            let dragFormula = null;

            html.on("dragstart", ".sqd-layout-tile", (e) => {
                dragFormula = $(e.currentTarget).data("formula");
                e.originalEvent.dataTransfer.effectAllowed = "move";
                setTimeout(() => $(e.currentTarget).addClass("sqd-dragging"), 0);
            });

            html.on("dragend", ".sqd-layout-tile", () => {
                html.find(".sqd-layout-tile").removeClass(
                    "sqd-dragging sqd-drop-left sqd-drop-right sqd-drop-top sqd-drop-bottom"
                );
                dragFormula = null;
            });

            html.on("dragover", ".sqd-layout-tile", (e) => {
                const tgt = $(e.currentTarget).data("formula");
                if (!dragFormula || tgt === dragFormula) return;
                e.preventDefault();

                const rect   = e.currentTarget.getBoundingClientRect();
                const xRatio = rect.width  > 0 ? (e.clientX - rect.left) / rect.width  : 0.5;
                const yRatio = rect.height > 0 ? (e.clientY - rect.top)  / rect.height : 0.5;

                html.find(".sqd-layout-tile").removeClass(
                    "sqd-drop-left sqd-drop-right sqd-drop-top sqd-drop-bottom"
                );

                let zone;
                if      (yRatio < 0.3) zone = "top";
                else if (yRatio > 0.7) zone = "bottom";
                else if (xRatio < 0.5) zone = "left";
                else                   zone = "right";

                $(e.currentTarget).addClass(`sqd-drop-${zone}`).data("current-zone", zone);
            });

            html.on("dragleave", ".sqd-layout-tile", (e) => {
                $(e.currentTarget).removeClass(
                    "sqd-drop-left sqd-drop-right sqd-drop-top sqd-drop-bottom"
                );
            });

            html.on("drop", ".sqd-layout-tile", (e) => {
                e.preventDefault();
                const tgtFormula = $(e.currentTarget).data("formula");
                const zone       = $(e.currentTarget).data("current-zone");
                $(e.currentTarget).removeClass(
                    "sqd-drop-left sqd-drop-right sqd-drop-top sqd-drop-bottom"
                );
                if (!dragFormula || dragFormula === tgtFormula || !zone) return;
                applyGridDrop(pendingGrid, dragFormula, tgtFormula, zone);
                renderLayoutEditor(html, pendingGrid, diceMap);
            });

            // ── Reset tab ─────────────────────────────────────────────────
            html.on("click", ".sqd-reset-position-btn", async () => {
                await game.user.setFlag("star-quick-dice", "barPosition", null);
                applyBarPosition(diceBar);
            });

            html.on("click", ".sqd-reset-dice-btn", async () => {
                await game.user.unsetFlag("star-quick-dice", "customDice");
                await game.user.unsetFlag("star-quick-dice", "barGrid");
                await game.user.unsetFlag("star-quick-dice", "diceVisibility");
                renderBar(diceBar);
            });

            // ── Dice tab: delete ──────────────────────────────────────────
            html.on("click", ".sqd-delete-btn", (e) => {
                const row     = $(e.currentTarget).closest("tr");
                const formula = row.data("formula");
                pendingCustom.splice(pendingCustom.findIndex(d => d.formula === formula), 1);
                for (let r = 0; r < pendingGrid.length; r++) {
                    const idx = pendingGrid[r].indexOf(formula);
                    if (idx !== -1) {
                        pendingGrid[r].splice(idx, 1);
                        if (pendingGrid[r].length === 0) pendingGrid.splice(r, 1);
                        break;
                    }
                }
                row.remove();
            });

            // ── Dice tab: add ─────────────────────────────────────────────
            html.on("click", ".sqd-add-btn", () => {
                const input = html.find(".sqd-formula-input");
                const raw   = input.val().trim().toLowerCase();

                if (!/^\d+d\d+$/.test(raw)) {
                    ui.notifications.warn("Star Quick Dice: Invalid add dice format. Use format NdX, e.g. 2d6 or 1d105.");
                    return;
                }
                if ([...BUILT_IN_DICE, ...pendingCustom].some(d => d.formula === raw)) {
                    ui.notifications.warn(`Star Quick Dice: ${raw} already exists.`);
                    return;
                }

                const die = { label: formulaToLabel(raw), formula: raw };
                pendingCustom.push(die);
                diceMap.set(die.formula, die);
                if (pendingGrid.length === 0) pendingGrid.push([die.formula]);
                else pendingGrid[pendingGrid.length - 1].push(die.formula);

                html.find("tbody").append(makeRow(die.label, die.formula, true));
                input.val("").focus();
            });

            html.on("keydown", ".sqd-formula-input", (e) => {
                if (e.key === "Enter") html.find(".sqd-add-btn").trigger("click");
            });
        }
    });

    dialogInstance.render(true);
}

Hooks.once("init", () => {
    console.log("Star Quick Dice | Initialized");
});

Hooks.once("ready", () => {
    const diceBar = $(`<div class="quick-dice-bar">
        <span class="sqd-bar-handle" title="Drag to move bar">&#8801;</span>
        <div class="sqd-dice-grid"></div>
        <button class="sqd-config-btn" title="Configure Dice">&#9881;</button>
    </div>`);

    $("body").append(diceBar);
    applyBarPosition(diceBar);
    renderBar(diceBar);
    initBarDrag(diceBar);

    diceBar.find(".sqd-config-btn").click(() => openConfig(diceBar));
});

if (typeof module !== "undefined") module.exports = { applyGridDrop };
