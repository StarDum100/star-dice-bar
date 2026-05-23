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

function getCustomDice() {
    return game.user.getFlag("star-quick-dice", "customDice") ?? [];
}

function getDiceOrder() {
    return game.user.getFlag("star-quick-dice", "diceOrder") ?? [];
}

function getOrderedDice() {
    const allDice = [...BUILT_IN_DICE, ...getCustomDice()];
    const order = getDiceOrder();
    if (!order.length) return allDice;
    const diceMap = new Map(allDice.map(d => [d.formula, d]));
    const ordered = order.map(f => diceMap.get(f)).filter(Boolean);
    const orderedSet = new Set(order);
    return [...ordered, ...allDice.filter(d => !orderedSet.has(d.formula))];
}

function getVisibility() {
    const saved = game.user.getFlag("star-quick-dice", "diceVisibility") ?? {};
    const visibility = {};
    for (const die of getOrderedDice()) {
        visibility[die.formula] = saved[die.formula] !== false;
    }
    return visibility;
}

function applyBarPosition(diceBar) {
    const saved = game.user.getFlag("star-quick-dice", "barPosition");
    const pos = saved ?? {
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

function renderBar(diceBar) {
    const ordered = getOrderedDice();
    const visibility = getVisibility();

    diceBar.find("button[data-roll]").remove();

    const buttons = ordered.map(({ label, formula }) => {
        const btn = $("<button>").attr("data-roll", formula).text(label);
        if (!visibility[formula]) btn.hide();
        btn.click(async () => {
            const roll = new Roll(formula);
            await roll.evaluate();
            roll.toMessage({
                speaker: ChatMessage.getSpeaker(),
                flavor: `Quick Roll: ${formula}`
            });
        });
        return btn;
    });

    diceBar.find(".sqd-config-btn").before(buttons);
}

function openConfig(diceBar) {
    const savedVisibility = game.user.getFlag("star-quick-dice", "diceVisibility") ?? {};
    const pendingCustom = [...getCustomDice()];

    function makeRow(label, formula, isCustom) {
        const checked = savedVisibility[formula] !== false ? "checked" : "";
        const deleteBtn = isCustom
            ? `<button type="button" class="sqd-delete-btn">&#10005;</button>`
            : "";
        return `
            <tr data-formula="${formula}">
                <td class="sqd-drag-handle" title="Drag to reorder">&#8285;</td>
                <td>${label}</td>
                <td>${formula}</td>
                <td class="sqd-checkbox-cell"><input type="checkbox" name="${formula}" ${checked}></td>
                <td class="sqd-delete-cell">${deleteBtn}</td>
            </tr>
        `;
    }

    const content = `
        <table class="sqd-config-table">
            <thead>
                <tr><th></th><th>Die</th><th>Formula</th><th>Visible</th><th></th></tr>
            </thead>
            <tbody>
                ${getOrderedDice().map(({ label, formula }) =>
                    makeRow(label, formula, pendingCustom.some(d => d.formula === formula))
                ).join("")}
            </tbody>
        </table>
        <div class="sqd-add-row">
            <input type="text" class="sqd-formula-input" placeholder="e.g. 2d6, 1d105">
            <button type="button" class="sqd-add-btn">Add</button>
        </div>
    `;

    new Dialog({
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
                    const newOrder = html.find("tbody tr").map(function () {
                        return $(this).data("formula");
                    }).get();
                    await game.user.setFlag("star-quick-dice", "diceVisibility", newVisibility);
                    await game.user.setFlag("star-quick-dice", "customDice", pendingCustom);
                    await game.user.setFlag("star-quick-dice", "diceOrder", newOrder);
                    renderBar(diceBar);
                }
            },
            cancel: { label: "Cancel" }
        },
        default: "save",
        render: (html) => {
            const tbody = html.find("tbody")[0];
            let dragSrc = null;

            html.on("mousedown", ".sqd-drag-handle", (e) => {
                $(e.currentTarget).closest("tr").attr("draggable", "true");
            });

            html.on("dragstart", "tr", (e) => {
                if (!$(e.currentTarget).attr("draggable")) return;
                dragSrc = e.currentTarget;
                e.originalEvent.dataTransfer.effectAllowed = "move";
                setTimeout(() => $(dragSrc).addClass("sqd-dragging"), 0);
            });

            html.on("dragend", "tr", (e) => {
                $(e.currentTarget).removeClass("sqd-dragging").removeAttr("draggable");
                html.find("tr").removeClass("sqd-drag-over");
                dragSrc = null;
            });

            html.on("dragover", "tr", (e) => {
                if (!dragSrc || e.currentTarget === dragSrc) return;
                e.preventDefault();
                html.find("tr").removeClass("sqd-drag-over");
                $(e.currentTarget).addClass("sqd-drag-over");
            });

            html.on("dragleave", "tr", (e) => {
                $(e.currentTarget).removeClass("sqd-drag-over");
            });

            html.on("drop", "tr", (e) => {
                e.preventDefault();
                $(e.currentTarget).removeClass("sqd-drag-over");
                if (!dragSrc || dragSrc === e.currentTarget) return;
                const rows = [...tbody.querySelectorAll("tr")];
                const srcIdx = rows.indexOf(dragSrc);
                const tgtIdx = rows.indexOf(e.currentTarget);
                if (srcIdx < tgtIdx) {
                    e.currentTarget.after(dragSrc);
                } else {
                    e.currentTarget.before(dragSrc);
                }
            });

            html.on("click", ".sqd-delete-btn", (e) => {
                const row = $(e.currentTarget).closest("tr");
                const formula = row.data("formula");
                pendingCustom.splice(pendingCustom.findIndex(d => d.formula === formula), 1);
                row.remove();
            });

            html.on("click", ".sqd-add-btn", () => {
                const input = html.find(".sqd-formula-input");
                const raw = input.val().trim().toLowerCase();

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
                html.find("tbody").append(makeRow(die.label, die.formula, true));
                input.val("").focus();
            });

            html.on("keydown", ".sqd-formula-input", (e) => {
                if (e.key === "Enter") html.find(".sqd-add-btn").trigger("click");
            });
        }
    }).render(true);
}

Hooks.once("init", () => {
    console.log("Star Quick Dice | Initialized");
});

Hooks.once("ready", () => {
    const diceBar = $(`<div class="quick-dice-bar">
        <span class="sqd-bar-handle" title="Drag to move bar">&#8801;</span>
        <button class="sqd-config-btn" title="Configure Dice">&#9881;</button>
    </div>`);

    $("body").append(diceBar);
    applyBarPosition(diceBar);
    renderBar(diceBar);
    initBarDrag(diceBar);

    diceBar.find(".sqd-config-btn").click(() => openConfig(diceBar));
});
