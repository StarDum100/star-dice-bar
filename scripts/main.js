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

function getVisibility() {
    const saved = game.user.getFlag("star-quick-dice", "diceVisibility") ?? {};
    const visibility = {};
    for (const die of [...BUILT_IN_DICE, ...getCustomDice()]) {
        visibility[die.formula] = saved[die.formula] !== false;
    }
    return visibility;
}

function renderBar(diceBar) {
    const allDice = [...BUILT_IN_DICE, ...getCustomDice()];
    const visibility = getVisibility();

    diceBar.find("button[data-roll]").remove();

    const buttons = allDice.map(({ label, formula }) => {
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
                <tr><th>Die</th><th>Formula</th><th>Visible</th><th></th></tr>
            </thead>
            <tbody>
                ${BUILT_IN_DICE.map(({ label, formula }) => makeRow(label, formula, false)).join("")}
                ${pendingCustom.map(({ label, formula }) => makeRow(label, formula, true)).join("")}
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
                    await game.user.setFlag("star-quick-dice", "diceVisibility", newVisibility);
                    await game.user.setFlag("star-quick-dice", "customDice", pendingCustom);
                    renderBar(diceBar);
                }
            },
            cancel: { label: "Cancel" }
        },
        default: "save",
        render: (html) => {
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

            // Allow pressing Enter in the input to trigger Add
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
        <button class="sqd-config-btn" title="Configure Dice">&#9881;</button>
    </div>`);

    $("#ui-top").append(diceBar);
    renderBar(diceBar);

    diceBar.find(".sqd-config-btn").click(() => openConfig(diceBar));
});
