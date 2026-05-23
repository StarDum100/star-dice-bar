const DICE = [
    { label: "d4",   formula: "1d4"   },
    { label: "d6",   formula: "1d6"   },
    { label: "d8",   formula: "1d8"   },
    { label: "d10",  formula: "1d10"  },
    { label: "d12",  formula: "1d12"  },
    { label: "d20",  formula: "1d20"  },
    { label: "d100", formula: "1d100" },
];

function getVisibility() {
    const saved = game.user.getFlag("star-quick-dice", "diceVisibility") ?? {};
    const visibility = {};
    for (const die of DICE) {
        visibility[die.formula] = saved[die.formula] !== false;
    }
    return visibility;
}

function applyVisibility(diceBar, visibility) {
    diceBar.find("button[data-roll]").each(function () {
        $(this).toggle(visibility[$(this).data("roll")] !== false);
    });
}

function openConfig(diceBar) {
    const visibility = getVisibility();

    const rows = DICE.map(({ label, formula }) => `
        <tr>
            <td>${label}</td>
            <td>${formula}</td>
            <td class="sqd-checkbox-cell">
                <input type="checkbox" name="${formula}" ${visibility[formula] ? "checked" : ""}>
            </td>
        </tr>
    `).join("");

    const content = `
        <table class="sqd-config-table">
            <thead>
                <tr><th>Die</th><th>Formula</th><th>Visible</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    new Dialog({
        title: "Star Quick Dice — Configure",
        content,
        buttons: {
            save: {
                label: "Save",
                callback: async (html) => {
                    const newVisibility = {};
                    for (const { formula } of DICE) {
                        newVisibility[formula] = html.find(`input[name="${formula}"]`).is(":checked");
                    }
                    await game.user.setFlag("star-quick-dice", "diceVisibility", newVisibility);
                    applyVisibility(diceBar, newVisibility);
                }
            },
            cancel: { label: "Cancel" }
        },
        default: "save"
    }).render(true);
}

Hooks.once("init", () => {
    console.log("Star Quick Dice | Initialized");
});

Hooks.once("ready", () => {
    const diceBar = $(`
        <div class="quick-dice-bar">
            ${DICE.map(({ label, formula }) => `<button data-roll="${formula}">${label}</button>`).join("")}
            <button class="sqd-config-btn" title="Configure Dice">&#9881;</button>
        </div>
    `);

    $("#ui-top").append(diceBar);
    applyVisibility(diceBar, getVisibility());

    diceBar.find("button[data-roll]").click(async (event) => {
        const formula = event.currentTarget.dataset.roll;
        const roll = new Roll(formula);
        await roll.evaluate();
        roll.toMessage({
            speaker: ChatMessage.getSpeaker(),
            flavor: `Quick Roll: ${formula}`
        });
    });

    diceBar.find(".sqd-config-btn").click(() => openConfig(diceBar));
});
