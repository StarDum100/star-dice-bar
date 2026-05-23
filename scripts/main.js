const BUILT_IN_DICE = ["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "1d100"];

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function getCustomDice() {
    return game.user.getFlag("star-quick-dice", "customDice") ?? [];
}

function getBarGrid(customDice = getCustomDice()) {
    const saved = game.user.getFlag("star-quick-dice", "barGrid");
    if (saved?.length) return saved;
    return [[...BUILT_IN_DICE, ...customDice]];
}

function getVisibility(customDice = getCustomDice()) {
    const saved = game.user.getFlag("star-quick-dice", "diceVisibility") ?? {};
    const visibility = {};
    for (const formula of [...BUILT_IN_DICE, ...customDice]) {
        visibility[formula] = saved[formula] !== false;
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
    const customDice = getCustomDice();
    const grid = getBarGrid(customDice);
    const visibility = getVisibility(customDice);
    const knownDice = new Set([...BUILT_IN_DICE, ...customDice]);
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
            const btn = $("<button>").attr("data-roll", formula).text(formula);
            if (!visibility[formula]) btn.hide();
            btn.click(makeRollClickHandler(formula));
            rowEl.append(btn);
        });
        gridEl.append(rowEl);
    });
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
    const savedVisibility = game.user.getFlag("star-quick-dice", "diceVisibility") ?? {};
    const barHidden       = game.settings.get("star-quick-dice", "barHidden");
    const pendingCustom   = [...getCustomDice()];
    const pendingGrid     = getBarGrid().map(row => [...row]);

    function makeRow(formula, isCustom) {
        const safe    = escapeHtml(formula);
        const checked = savedVisibility[formula] !== false ? "checked" : "";
        const deleteBtn = isCustom
            ? `<button type="button" class="sqd-delete-btn">&#10005;</button>`
            : "";
        return `
            <tr data-formula="${safe}">
                <td>${safe}</td>
                <td class="sqd-checkbox-cell"><input type="checkbox" name="${safe}" ${checked}></td>
                <td class="sqd-delete-cell">${deleteBtn}</td>
            </tr>
        `;
    }

    const allDice = new Set([...BUILT_IN_DICE, ...pendingCustom]);
    const flatDice = pendingGrid.flat().filter(f => allDice.has(f));

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
                    <tr><th>Dice</th><th>Visible</th><th></th></tr>
                </thead>
                <tbody>
                    ${flatDice.map(formula =>
                        makeRow(formula, pendingCustom.includes(formula))
                    ).join("")}
                </tbody>
            </table>
            <div class="sqd-add-row">
                <input type="text" class="sqd-formula-input" placeholder="e.g. 2d6, 1d105">
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
                        <p>Remove the button bar from the screen. To restore it, uncheck this option in Configure Game Settings.</p>
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
                        <strong>Reset Dice Buttons</strong>
                        <p>Remove all custom dice and restore the default visibility and layout.</p>
                    </div>
                    <button type="button" class="sqd-reset-dice-btn">Reset Dice</button>
                </div>
            </div>
        </div>
    `;

    await foundry.applications.api.DialogV2.wait({
        window: { title: "Star Quick Dice — Configure" },
        content,
        rejectClose: false,
        buttons: [
            {
                action: "save",
                label: "Save",
                callback: async (event, button, dialog) => {
                    const $html = $(dialog.element);
                    const newVisibility = {};
                    $html.find("tbody input[type=checkbox]").each(function () {
                        newVisibility[this.name] = this.checked;
                    });
                    await game.user.setFlag("star-quick-dice", "diceVisibility", newVisibility);
                    await game.user.setFlag("star-quick-dice", "customDice", pendingCustom);
                    await game.user.setFlag("star-quick-dice", "barGrid", pendingGrid);
                    renderBar(diceBar);
                }
            },
            { action: "cancel", label: "Cancel", default: true }
        ],
        render: (event, dialog) => {
            const $html = $(dialog.element);
            // ── Tab switching ──────────────────────────────────────────────
            $html.on("click", ".sqd-tab", (e) => {
                const tab = e.currentTarget.dataset.tab;
                $html.find(".sqd-tab").removeClass("sqd-tab-active");
                $(e.currentTarget).addClass("sqd-tab-active");
                $html.find(".sqd-tab-panel").addClass("sqd-tab-panel-hidden");
                $html.find(`[data-panel="${tab}"]`).removeClass("sqd-tab-panel-hidden");
                if (tab === "layout") renderLayoutEditor($html, pendingGrid);
            });

            // ── Layout tab drag-and-drop ───────────────────────────────────
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

            // ── Reset tab ─────────────────────────────────────────────────
            $html.on("click", ".sqd-reset-position-btn", async () => {
                await game.user.setFlag("star-quick-dice", "barPosition", null);
                applyBarPosition(diceBar);
            });

            $html.on("click", ".sqd-reset-dice-btn", async () => {
                await game.user.unsetFlag("star-quick-dice", "customDice");
                await game.user.unsetFlag("star-quick-dice", "barGrid");
                await game.user.unsetFlag("star-quick-dice", "diceVisibility");

                // Reset in-memory state so the dialog reflects the change immediately
                pendingCustom.splice(0);
                pendingGrid.splice(0, pendingGrid.length, [...BUILT_IN_DICE]);

                if (!$html.find("[data-panel='layout']").hasClass("sqd-tab-panel-hidden")) {
                    renderLayoutEditor($html, pendingGrid);
                }

                renderBar(diceBar);
            });

            // ── Dice tab: delete ──────────────────────────────────────────
            $html.on("click", ".sqd-delete-btn", (e) => {
                const row     = $(e.currentTarget).closest("tr");
                const formula = row.data("formula");
                pendingCustom.splice(pendingCustom.indexOf(formula), 1);
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
            $html.on("click", ".sqd-add-btn", () => {
                const input = $html.find(".sqd-formula-input");
                const raw   = input.val().trim().toLowerCase();

                if (!/^\d+d\d+$/.test(raw)) {
                    ui.notifications.warn("Star Quick Dice: Invalid add dice format. Use format NdX, e.g. 2d6 or 1d105.");
                    return;
                }
                if ([...BUILT_IN_DICE, ...pendingCustom].includes(raw)) {
                    ui.notifications.warn(`Star Quick Dice: ${raw} already exists.`);
                    return;
                }

                pendingCustom.push(raw);
                if (pendingGrid.length === 0) pendingGrid.push([raw]);
                else pendingGrid[pendingGrid.length - 1].push(raw);

                $html.find("tbody").append(makeRow(raw, true));
                input.val("").focus();
            });

            $html.on("keydown", ".sqd-formula-input", (e) => {
                if (e.key === "Enter") $html.find(".sqd-add-btn").trigger("click");
            });

            // ── Extra tab ─────────────────────────────────────────────────
            $html.on("change", ".sqd-hide-bar-checkbox", async (e) => {
                const hidden = e.target.checked;
                await game.settings.set("star-quick-dice", "barHidden", hidden);
                if (hidden) diceBar.hide();
                else        diceBar.show();
            });
        }
    });
}

Hooks.once("init", () => {
    console.log("Star Quick Dice | Initialized");
    game.settings.register("star-quick-dice", "barHidden", {
        name: "Hide Button Bar",
        hint: "Remove the button bar from the screen. Toggle this setting to bring it back.",
        scope: "client",
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            if (value) $(".quick-dice-bar").hide();
            else       $(".quick-dice-bar").show();
        },
    });
});

Hooks.once("ready", () => {
    const diceBar = $(`<div class="quick-dice-bar">
        <div class="sqd-bar-controls">
            <span class="sqd-bar-handle" title="Drag to move bar">&#8801;</span>
            <button class="sqd-config-btn" title="Configure Dice">&#9881;</button>
        </div>
        <div class="sqd-dice-grid"></div>
    </div>`);

    $("body").append(diceBar);
    applyBarPosition(diceBar);
    renderBar(diceBar);
    initBarDrag(diceBar);
    if (game.settings.get("star-quick-dice", "barHidden")) diceBar.hide();

    diceBar.find(".sqd-config-btn").click(() => openConfig(diceBar));
});

if (typeof module !== "undefined") module.exports = {};
