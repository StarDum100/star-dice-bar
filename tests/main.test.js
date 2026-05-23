const $ = require("jquery");

const hookCallbacks = {};

global.$ = $;
global.Hooks = {
  once: jest.fn((event, cb) => { hookCallbacks[event] = cb; }),
};
global.Roll = jest.fn();
global.ChatMessage = {
  getSpeaker: jest.fn().mockReturnValue({ alias: "Tester" }),
};
global.game = {
  user: {
    getFlag:   jest.fn().mockReturnValue(undefined),
    setFlag:   jest.fn().mockResolvedValue(undefined),
    unsetFlag: jest.fn().mockResolvedValue(undefined),
  },
};
global.ui = {
  notifications: { warn: jest.fn() },
};
global.Dialog = jest.fn().mockImplementation((options) => {
  global.Dialog.__lastOptions = options;
  const instance = { render: jest.fn(), close: jest.fn() };
  global.Dialog.__lastInstance = instance;
  return instance;
});

require("../scripts/main.js");

// ── Helpers ───────────────────────────────────────────────────────────────

function openDialogHtml() {
  const options = global.Dialog.__lastOptions;
  const container = document.createElement("div");
  container.innerHTML = options.content;
  const html = $(container);
  options.render(html);
  return { html, options };
}

function setupBar(flagOverrides = {}) {
  global.game.user.getFlag.mockImplementation((ns, key) => flagOverrides[key] ?? undefined);
  document.body.innerHTML = "";
  hookCallbacks["ready"]();
}


// ── Star Quick Dice (integration) ────────────────────────────────────────

describe("Star Quick Dice", () => {
  describe("init hook", () => {
    it("registers an init hook", () => {
      expect(global.Hooks.once).toHaveBeenCalledWith("init", expect.any(Function));
    });
  });

  describe("ready hook", () => {
    beforeEach(() => {
      setupBar();
    });

    it("appends the dice bar to body", () => {
      expect(document.querySelector(".quick-dice-bar")).not.toBeNull();
    });

    it("renders 7 dice buttons by default", () => {
      expect(document.querySelectorAll("button[data-roll]")).toHaveLength(7);
    });

    it("renders a config button", () => {
      expect(document.querySelector(".sqd-config-btn")).not.toBeNull();
    });

    it("renders a drag handle", () => {
      expect(document.querySelector(".sqd-bar-handle")).not.toBeNull();
    });

    it("buttons live inside .sqd-dice-grid", () => {
      expect(document.querySelector(".sqd-dice-grid button[data-roll]")).not.toBeNull();
    });

    it.each([
      ["d4", "1d4"], ["d6", "1d6"], ["d8", "1d8"], ["d10", "1d10"],
      ["d12", "1d12"], ["d20", "1d20"], ["d100", "1d100"],
    ])("%s button has correct label and data-roll", (label, formula) => {
      const btn = document.querySelector(`[data-roll="${formula}"]`);
      expect(btn).not.toBeNull();
      expect(btn.textContent.trim()).toBe(label);
    });

    describe("barGrid ordering", () => {
      it("renders buttons in saved order from barGrid flag", () => {
        setupBar({ barGrid: [["1d20", "1d4", "1d6", "1d8", "1d10", "1d12", "1d100"]] });
        const buttons = [...document.querySelectorAll("button[data-roll]")];
        expect(buttons[0].dataset.roll).toBe("1d20");
        expect(buttons[1].dataset.roll).toBe("1d4");
      });

      it("renders buttons in default order when barGrid is not set", () => {
        const buttons = [...document.querySelectorAll("button[data-roll]")];
        expect(buttons[0].dataset.roll).toBe("1d4");
        expect(buttons[6].dataset.roll).toBe("1d100");
      });

      it("supports multiple rows from barGrid", () => {
        setupBar({ barGrid: [["1d4", "1d6"], ["1d8", "1d10"]] });
        expect(document.querySelector(".sqd-row-break")).not.toBeNull();
        expect(document.querySelectorAll("button[data-roll]")).toHaveLength(4);
      });

      it("ignores unknown formulas in barGrid without crashing", () => {
        setupBar({ barGrid: [["1d999", "1d4"]] });
        expect(() => {}).not.toThrow();
        expect(document.querySelectorAll("button[data-roll]")).toHaveLength(1);
      });
    });

    describe("custom dice", () => {
      it("renders custom dice from saved flags", () => {
        setupBar({ customDice: [{ label: "d105", formula: "1d105" }] });
        expect(document.querySelector('[data-roll="1d105"]')).not.toBeNull();
      });

      it("renders 8 buttons when one custom die is saved", () => {
        setupBar({ customDice: [{ label: "2d6", formula: "2d6" }] });
        expect(document.querySelectorAll("button[data-roll]")).toHaveLength(8);
      });
    });

    describe("visibility", () => {
      it("hides dice buttons saved as not visible", () => {
        setupBar({ diceVisibility: { "1d4": false } });
        expect(document.querySelector('[data-roll="1d4"]').style.display).toBe("none");
      });

      it("shows dice buttons saved as visible", () => {
        setupBar({ diceVisibility: { "1d20": true } });
        expect(document.querySelector('[data-roll="1d20"]').style.display).not.toBe("none");
      });
    });

    describe("on button click", () => {
      let mockRoll;
      beforeEach(() => {
        mockRoll = { evaluate: jest.fn().mockResolvedValue(undefined), toMessage: jest.fn() };
        global.Roll.mockClear();
        global.Roll.mockImplementation(() => mockRoll);
      });

      it("creates a Roll with the correct formula", () => {
        document.querySelector('[data-roll="1d20"]').click();
        expect(global.Roll).toHaveBeenCalledWith("1d20");
      });

      it("evaluates the roll", async () => {
        document.querySelector('[data-roll="1d6"]').click();
        await Promise.resolve();
        expect(mockRoll.evaluate).toHaveBeenCalled();
      });

      it("sends to chat with correct flavor text", async () => {
        document.querySelector('[data-roll="1d8"]').click();
        await new Promise(r => setTimeout(r, 0));
        expect(mockRoll.toMessage).toHaveBeenCalledWith(
          expect.objectContaining({ flavor: "Quick Roll: 1d8" })
        );
      });

      it("includes the current speaker in the message", async () => {
        document.querySelector('[data-roll="1d4"]').click();
        await new Promise(r => setTimeout(r, 0));
        expect(mockRoll.toMessage).toHaveBeenCalledWith(
          expect.objectContaining({ speaker: { alias: "Tester" } })
        );
      });
    });
  });

  describe("bar positioning", () => {
    it("applies saved position from barPosition flag", () => {
      setupBar({ barPosition: { left: 200, top: 150 } });
      const bar = document.querySelector(".quick-dice-bar");
      expect(bar.style.left).toBe("200px");
      expect(bar.style.top).toBe("150px");
    });

    it("applies a default top of 10px when no barPosition flag is set", () => {
      setupBar();
      expect(document.querySelector(".quick-dice-bar").style.top).toBe("10px");
    });

    it("saves position to flag on drag end", () => {
      setupBar();
      global.game.user.setFlag.mockClear();
      const handle = document.querySelector(".sqd-bar-handle");
      $(handle).trigger({ type: "mousedown", clientX: 50, clientY: 50, preventDefault: () => {} });
      $(document).trigger({ type: "mousemove.sqd-drag", clientX: 80, clientY: 70 });
      $(document).trigger("mouseup.sqd-drag");
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "barPosition",
        expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) })
      );
    });
  });

  describe("formulaToLabel", () => {
    function renderWithLabel(formula, label) {
      setupBar({ customDice: [{ label, formula }] });
    }

    it.each([
      ["1d4", "d4"], ["1d105", "d105"], ["2d6", "2d6"], ["3d8", "3d8"],
    ])("formulaToLabel(%s) === %s", (formula, expected) => {
      renderWithLabel(formula, expected);
      const btn = document.querySelector(`[data-roll="${formula}"]`);
      expect(btn).not.toBeNull();
      expect(btn.textContent.trim()).toBe(expected);
    });

    describe("invalid label values", () => {
      it("renders without crashing when label has no digits", () => {
        expect(() => renderWithLabel("1d999", "abc")).not.toThrow();
      });

      it("renders without crashing when label is empty", () => {
        expect(() => renderWithLabel("1d999", "")).not.toThrow();
      });

      it("renders without crashing when label contains special characters", () => {
        expect(() => renderWithLabel("1d999", "!@#$%^&*()")).not.toThrow();
      });

      it("does not execute a script tag injected as a label", () => {
        window.__xssLabel = undefined;
        renderWithLabel("1d999", '<script>window.__xssLabel = true</script>');
        expect(window.__xssLabel).toBeUndefined();
      });

      it("does not execute an event handler injected into the formula attribute", () => {
        window.__xssFormula = undefined;
        renderWithLabel('1d6" onmouseover="window.__xssFormula=true', "d6");
        expect(window.__xssFormula).toBeUndefined();
      });

      it("does not execute an img onerror payload injected as a label", () => {
        window.__xssImg = undefined;
        renderWithLabel("1d999", '<img src=x onerror="window.__xssImg=true">');
        expect(window.__xssImg).toBeUndefined();
      });
    });
  });

  describe("config dialog — add button warnings", () => {
    let html;
    beforeEach(() => {
      global.ui.notifications.warn.mockClear();
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      ({ html } = openDialogHtml());
    });

    function attemptAdd(formula) {
      html.find(".sqd-formula-input").val(formula);
      html.find(".sqd-add-btn").trigger("click");
    }

    it("warns with the correct message when the formula is empty", () => {
      attemptAdd("");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid add dice format. Use format NdX, e.g. 2d6 or 1d105."
      );
    });

    it("warns when the formula has no digits", () => {
      attemptAdd("abc");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid add dice format. Use format NdX, e.g. 2d6 or 1d105."
      );
    });

    it("warns when the formula is missing the die size", () => {
      attemptAdd("2d");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid add dice format. Use format NdX, e.g. 2d6 or 1d105."
      );
    });

    it("warns when the formula is missing the multiplier", () => {
      attemptAdd("d6");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid add dice format. Use format NdX, e.g. 2d6 or 1d105."
      );
    });

    it("warns when the formula contains special characters", () => {
      attemptAdd("2d!!");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid add dice format. Use format NdX, e.g. 2d6 or 1d105."
      );
    });

    it("warns when the formula contains a script injection attempt", () => {
      attemptAdd("<script>alert(1)</script>");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid add dice format. Use format NdX, e.g. 2d6 or 1d105."
      );
    });

    it("warns when a valid formula already exists", () => {
      attemptAdd("1d20");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: 1d20 already exists."
      );
    });

    it("does not warn when the formula is valid and new", () => {
      attemptAdd("1d105");
      expect(global.ui.notifications.warn).not.toHaveBeenCalled();
    });
  });

  describe("config dialog — layout tab", () => {
    function openLayout(flagOverrides = {}) {
      setupBar(flagOverrides);
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      html.find("[data-tab='layout']").trigger("click");
      return html;
    }

    it("shows the dice panel by default and hides layout and reset", () => {
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      expect(html.find("[data-panel='dice']").hasClass("sqd-tab-panel-hidden")).toBe(false);
      expect(html.find("[data-panel='layout']").hasClass("sqd-tab-panel-hidden")).toBe(true);
      expect(html.find("[data-panel='reset']").hasClass("sqd-tab-panel-hidden")).toBe(true);
    });

    it("renders a tile for each built-in die on the layout tab", () => {
      const html = openLayout();
      expect(html.find(".sqd-layout-tile")).toHaveLength(7);
    });

    it("renders the correct label on each layout tile", () => {
      const html = openLayout();
      const labels = [...html.find(".sqd-layout-tile")].map(el => el.textContent.trim());
      expect(labels).toContain("d4");
      expect(labels).toContain("d20");
    });

    it("renders a rows input showing the current row count", () => {
      const html = openLayout({ barGrid: [["1d4", "1d6"], ["1d8", "1d10"]] });
      expect(html.find(".sqd-rows-input").val()).toBe("2");
    });

    it("renders multiple rows when barGrid has multiple rows", () => {
      const html = openLayout({ barGrid: [["1d4", "1d6"], ["1d8", "1d10"]] });
      expect(html.find(".sqd-layout-row")).toHaveLength(2);
      expect(html.find(".sqd-layout-row").eq(0).find(".sqd-layout-tile")).toHaveLength(2);
      expect(html.find(".sqd-layout-row").eq(1).find(".sqd-layout-tile")).toHaveLength(2);
    });

    it("renders empty slots when dice do not fill the grid evenly", () => {
      // 7 dice, 2 rows → 4 cols → 8 slots → 1 empty slot
      const html = openLayout();
      html.find(".sqd-rows-input").val("2").trigger("change");
      expect(html.find(".sqd-layout-slot")).toHaveLength(1);
    });

    it("redistributes dice into new rows when the row count changes", () => {
      const html = openLayout();
      html.find(".sqd-rows-input").val("2").trigger("change");
      expect(html.find(".sqd-layout-row")).toHaveLength(2);
    });

    it("clamps row count to 1 when a value less than 1 is entered", () => {
      const html = openLayout();
      html.find(".sqd-rows-input").val("0").trigger("change");
      expect(html.find(".sqd-rows-input").val()).toBe("1");
    });

    it("clamps row count to number of dice when too large a value is entered", () => {
      const html = openLayout();
      html.find(".sqd-rows-input").val("99").trigger("change");
      expect(html.find(".sqd-rows-input").val()).toBe("7");
    });

    it("clamps row count to 1 when a non-numeric value is entered", () => {
      const html = openLayout();
      html.find(".sqd-rows-input").val("abc").trigger("change");
      expect(html.find(".sqd-rows-input").val()).toBe("1");
    });

    it("does not execute XSS in the rows input", () => {
      window.__xssRows = undefined;
      const html = openLayout();
      html.find(".sqd-rows-input").val("<script>window.__xssRows=true</script>").trigger("change");
      expect(window.__xssRows).toBeUndefined();
      expect(html.find(".sqd-rows-input").val()).toBe("1");
    });

    it("moves a die when dropped onto another slot", () => {
      const html = openLayout();
      // All 7 dice in 1 row; tiles have data-index 0–6
      const src = html.find(".sqd-layout-tile").eq(0); // d4, index 0
      const tgt = html.find(".sqd-layout-tile").eq(2); // d8, index 2

      $(src).trigger({ type: "dragstart", originalEvent: { dataTransfer: { effectAllowed: "" } } });
      $(tgt).trigger({ type: "dragover", preventDefault: () => {} });
      $(tgt).trigger({ type: "drop",     preventDefault: () => {} });

      // d4 removed from 0, adjusted target = 2-1=1, inserted at 1
      // result: d6, d4, d8, d10, d12, d20, d100
      expect(html.find(".sqd-layout-tile")).toHaveLength(7);
      const labels = [...html.find(".sqd-layout-tile")].map(el => el.textContent.trim());
      expect(labels[0]).toBe("d6");
      expect(labels[1]).toBe("d4");
    });

    it("saves barGrid flag on save", async () => {
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      const { options } = openDialogHtml();
      global.game.user.setFlag.mockClear();
      const container = document.createElement("div");
      container.innerHTML = options.content;
      await options.buttons.save.callback($(container));
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "barGrid", expect.any(Array)
      );
    });
  });

  describe("config dialog — reset tab", () => {
    let html;
    beforeEach(() => {
      global.game.user.setFlag.mockClear();
      global.game.user.unsetFlag.mockClear();
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      ({ html } = openDialogHtml());
    });

    it("switches to the reset panel when the Reset tab is clicked", () => {
      html.find("[data-tab='reset']").trigger("click");
      expect(html.find("[data-panel='reset']").hasClass("sqd-tab-panel-hidden")).toBe(false);
    });

    it("reset position button saves null barPosition flag", async () => {
      html.find(".sqd-reset-position-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));
      expect(global.game.user.setFlag).toHaveBeenCalledWith("star-quick-dice", "barPosition", null);
    });

    it("reset position button does not close the dialog", async () => {
      html.find(".sqd-reset-position-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));
      expect(global.Dialog.__lastInstance.close).not.toHaveBeenCalled();
    });

    it("reset dice button unsets customDice, barGrid, and diceVisibility flags", async () => {
      html.find(".sqd-reset-dice-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));
      expect(global.game.user.unsetFlag).toHaveBeenCalledWith("star-quick-dice", "customDice");
      expect(global.game.user.unsetFlag).toHaveBeenCalledWith("star-quick-dice", "barGrid");
      expect(global.game.user.unsetFlag).toHaveBeenCalledWith("star-quick-dice", "diceVisibility");
    });

    it("reset dice button does not close the dialog", async () => {
      html.find(".sqd-reset-dice-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));
      expect(global.Dialog.__lastInstance.close).not.toHaveBeenCalled();
    });

    it("reset dice button resets the layout tab to default order when layout is visible", async () => {
      setupBar({ barGrid: [["1d20"], ["1d4", "1d6"]] });
      document.querySelector(".sqd-config-btn").click();
      const { html, options } = openDialogHtml();
      // Switch to layout tab so it is visible
      html.find("[data-tab='layout']").trigger("click");
      expect(html.find(".sqd-layout-row")).toHaveLength(2);

      global.game.user.getFlag.mockReturnValue(undefined);
      html.find(".sqd-reset-dice-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));

      // Layout tab should now show a single row with 7 built-in dice
      expect(html.find(".sqd-layout-row")).toHaveLength(1);
      expect(html.find(".sqd-layout-tile")).toHaveLength(7);
    });

    it("reset dice button re-renders the bar with only built-in dice", async () => {
      setupBar({ customDice: [{ label: "d105", formula: "1d105" }] });
      document.querySelector(".sqd-config-btn").click();
      const { options } = openDialogHtml();
      global.game.user.getFlag.mockReturnValue(undefined);
      const container = document.createElement("div");
      container.innerHTML = options.content;
      const localHtml = $(container);
      options.render(localHtml);
      localHtml.find(".sqd-reset-dice-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));
      expect(document.querySelectorAll("button[data-roll]")).toHaveLength(7);
    });
  });

  describe("resilience", () => {
    beforeEach(() => { setupBar(); });

    it("does not throw when the DOM is empty", () => {
      document.body.innerHTML = "";
      expect(() => hookCallbacks["ready"]()).not.toThrow();
    });

    it("each click creates an independent Roll instance", async () => {
      global.Roll.mockClear();
      global.Roll.mockImplementation(() => ({
        evaluate: jest.fn().mockResolvedValue(undefined),
        toMessage: jest.fn(),
      }));
      document.querySelector('[data-roll="1d6"]').click();
      document.querySelector('[data-roll="1d6"]').click();
      await new Promise(r => setTimeout(r, 0));
      expect(global.Roll).toHaveBeenCalledTimes(2);
    });
  });
});
