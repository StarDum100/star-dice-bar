Hooks.once("init", () => {
    console.log("Star Quick Dice | Initialized");
});

Hooks.once("ready", () => {
    const diceBar = $(`
    <div class="quick-dice-bar">
      <button data-roll="1d4">d4</button>
      <button data-roll="1d6">d6</button>
      <button data-roll="1d8">d8</button>
      <button data-roll="1d10">d10</button>
      <button data-roll="1d12">d12</button>
      <button data-roll="1d20">d20</button>
      <button data-roll="1d100">d100</button>
    </div>
  `);

    $("#ui-top").append(diceBar);

    diceBar.find("button").click(async (event) => {
        const formula = event.currentTarget.dataset.roll;

        const roll = new Roll(formula);
        await roll.evaluate();

        roll.toMessage({
            speaker: ChatMessage.getSpeaker(),
            flavor: `Quick Roll: ${formula}`
        });
    });
});
