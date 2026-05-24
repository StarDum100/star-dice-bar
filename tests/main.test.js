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
  settings: {
    register: jest.fn(),
    get:      jest.fn().mockReturnValue(false),
    set:      jest.fn().mockResolvedValue(undefined),
  },
};
global.ui = {
  notifications: { warn: jest.fn() },
};
global.foundry = { applications: { api: { DialogV2: {} } } };
global.foundry.applications.api.DialogV2.wait = jest.fn().mockImplementation((options) => {
  global.foundry.applications.api.DialogV2.__lastOptions = options;
  const instance = { render: jest.fn(), close: jest.fn(), element: document.createElement("div") };
  global.foundry.applications.api.DialogV2.__lastInstance = instance;
  let resolveDialog;
  global.foundry.applications.api.DialogV2.__resolveDialog = (val) => resolveDialog(val);
  return new Promise(r => { resolveDialog = r; });
});

require("../scripts/main.js");

// ── Helpers ───────────────────────────────────────────────────────────────

function openDialogHtml() {
  const options = global.foundry.applications.api.DialogV2.__lastOptions;
  const instance = global.foundry.applications.api.DialogV2.__lastInstance;
  const container = document.createElement("div");
  container.innerHTML = options.content;
  instance.element = container;
  options.render(new Event("render"), instance);
  const html = $(container);
  return { html, options };
}

function setupBar(flagOverrides = {}) {
  const { barHidden, ...flagsOnly } = flagOverrides;
  global.game.user.getFlag.mockImplementation((ns, key) => flagsOnly[key] ?? undefined);
  global.game.settings.get.mockImplementation((ns, key) => key === "barHidden" ? (barHidden ?? false) : false);
  document.body.innerHTML = "";
  hookCallbacks["ready"]();
}


// ── Star Quick Dice (integration) ────────────────────────────────────────

describe("Star Quick Dice", () => {
  describe("init hook", () => {
    it("registers an init hook", () => {
      expect(global.Hooks.once).toHaveBeenCalledWith("init", expect.any(Function));
    });

    it("registers the barHidden setting with client scope and correct defaults", () => {
      global.game.settings.register.mockClear();
      hookCallbacks["init"]();
      expect(global.game.settings.register).toHaveBeenCalledWith(
        "star-quick-dice",
        "barHidden",
        expect.objectContaining({ scope: "client", config: true, type: Boolean, default: false })
      );
    });

    describe("barHidden onChange", () => {
      let onChange;
      beforeEach(() => {
        global.game.settings.register.mockClear();
        hookCallbacks["init"]();
        onChange = global.game.settings.register.mock.calls
          .find(c => c[1] === "barHidden")[2].onChange;
      });

      it("hides the bar when called with true", () => {
        setupBar();
        onChange(true);
        expect(document.querySelector(".sqd-dice-bar").style.display).toBe("none");
      });

      it("shows the bar when called with false", () => {
        setupBar({ barHidden: true });
        onChange(false);
        expect(document.querySelector(".sqd-dice-bar").style.display).not.toBe("none");
      });
    });
  });

  describe("ready hook", () => {
    beforeEach(() => {
      setupBar();
    });

    it("appends the dice bar to body", () => {
      expect(document.querySelector(".sqd-dice-bar")).not.toBeNull();
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
      ["1d4", "1d4"], ["1d6", "1d6"], ["1d8", "1d8"], ["1d10", "1d10"],
      ["1d12", "1d12"], ["1d20", "1d20"], ["1d100", "1d100"],
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
        expect(document.querySelectorAll(".sqd-bar-row")).toHaveLength(2);
        expect(document.querySelectorAll("button[data-roll]")).toHaveLength(4);
      });

      it("ignores unknown formulas in barGrid without crashing", () => {
        setupBar({ barGrid: [["1d999", "1d4"]] });
        expect(() => {}).not.toThrow();
        expect(document.querySelectorAll("button[data-roll]")).toHaveLength(1);
      });

      it("adds sqd-bar-multirow class when barGrid has multiple rows", () => {
        setupBar({ barGrid: [["1d4", "1d6"], ["1d8", "1d10"]] });
        expect(document.querySelector(".sqd-dice-bar").classList.contains("sqd-bar-multirow")).toBe(true);
      });

      it("does not add sqd-bar-multirow class for a single-row barGrid", () => {
        setupBar();
        expect(document.querySelector(".sqd-dice-bar").classList.contains("sqd-bar-multirow")).toBe(false);
      });
    });

    describe("custom dice", () => {
      it("renders custom dice from saved flags", () => {
        setupBar({ customDice: ["1d105"] });
        expect(document.querySelector('[data-roll="1d105"]')).not.toBeNull();
      });

      it("renders 8 buttons when one custom die is saved", () => {
        setupBar({ customDice: ["2d6"] });
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
      const bar = document.querySelector(".sqd-dice-bar");
      expect(bar.style.left).toBe("200px");
      expect(bar.style.top).toBe("150px");
    });

    it("applies a default top of 10px when no barPosition flag is set", () => {
      setupBar();
      expect(document.querySelector(".sqd-dice-bar").style.top).toBe("10px");
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

  describe("custom dice display", () => {
    it.each([
      ["1d4"], ["1d105"], ["2d6"], ["3d8"],
    ])("saved formula %s displays as its own label", (formula) => {
      setupBar({ customDice: [formula] });
      const btn = document.querySelector(`[data-roll="${formula}"]`);
      expect(btn).not.toBeNull();
      expect(btn.textContent.trim()).toBe(formula);
    });

    describe("invalid saved formula values", () => {
      it("renders without crashing when saved formula has no digits", () => {
        expect(() => setupBar({ customDice: ["abc"] })).not.toThrow();
      });

      it("renders without crashing when saved formula is empty", () => {
        expect(() => setupBar({ customDice: [""] })).not.toThrow();
      });

      it("renders without crashing when saved formula contains special characters", () => {
        expect(() => setupBar({ customDice: ["!@#$%^&*()"] })).not.toThrow();
      });

      it("renders without crashing when saved formula has a negative multiplier", () => {
        expect(() => setupBar({ customDice: ["-1d6"] })).not.toThrow();
      });

      it("renders without crashing when saved formula has a negative die size", () => {
        expect(() => setupBar({ customDice: ["1d-6"] })).not.toThrow();
      });

      it("renders without crashing when saved formula contains arithmetic", () => {
        expect(() => setupBar({ customDice: ["2d6-1"] })).not.toThrow();
      });

      it("does not execute a script tag injected as a saved formula", () => {
        window.__xssLabel = undefined;
        setupBar({ customDice: ['<script>window.__xssLabel = true</script>'] });
        expect(window.__xssLabel).toBeUndefined();
      });

      it("does not execute an event handler injected as a saved formula", () => {
        window.__xssFormula = undefined;
        setupBar({ customDice: ['1d6" onmouseover="window.__xssFormula=true'] });
        expect(window.__xssFormula).toBeUndefined();
      });

      it("does not execute an img onerror payload injected as a saved formula", () => {
        window.__xssImg = undefined;
        setupBar({ customDice: ['<img src=x onerror="window.__xssImg=true">'] });
        expect(window.__xssImg).toBeUndefined();
      });
    });
  });

  describe("large dice values", () => {
    const LARGE_FORMULAS = [
      ["10-digit die size",    "1d" + "1".repeat(10)],
      ["20-digit die size",    "1d" + "1".repeat(20)],
      ["30-digit die size",    "1d" + "1".repeat(30)],
      ["20-digit multiplier",  "1".repeat(20) + "d6"],
    ];

    describe("bar rendering", () => {
      it.each(LARGE_FORMULAS)(
        "renders without crashing when saved formula has %s",
        (_, formula) => {
          expect(() => setupBar({ customDice: [formula] })).not.toThrow();
        }
      );

      it.each(LARGE_FORMULAS)(
        "displays the full formula on the button when saved formula has %s",
        (_, formula) => {
          setupBar({ customDice: [formula] });
          const btn = document.querySelector(`[data-roll="${formula}"]`);
          expect(btn).not.toBeNull();
          expect(btn.textContent.trim()).toBe(formula);
        }
      );
    });

    describe("config dialog add button", () => {
      let html;
      beforeEach(() => {
        global.ui.notifications.warn.mockClear();
        setupBar();
        document.querySelector(".sqd-config-btn").click();
        ({ html } = openDialogHtml());
      });

      it.each(LARGE_FORMULAS)(
        "accepts a formula with %s without warning",
        (_, formula) => {
          html.find(".sqd-formula-input").val(formula);
          html.find(".sqd-add-btn").trigger("click");
          expect(global.ui.notifications.warn).not.toHaveBeenCalled();
        }
      );

      it.each(LARGE_FORMULAS)(
        "adds the row to the dice table when formula has %s",
        (_, formula) => {
          html.find(".sqd-formula-input").val(formula);
          html.find(".sqd-add-btn").trigger("click");
          expect(html.find(`tr[data-formula="${formula}"]`).length).toBe(1);
        }
      );
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

    it("warns when the formula has a negative multiplier", () => {
      attemptAdd("-1d6");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid add dice format. Use format NdX, e.g. 2d6 or 1d105."
      );
    });

    it("warns when the formula has a negative die size", () => {
      attemptAdd("1d-6");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid add dice format. Use format NdX, e.g. 2d6 or 1d105."
      );
    });

    it("warns when the formula contains arithmetic", () => {
      attemptAdd("2d6-1");
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

  describe("config dialog — XSS in dice table", () => {
    it("does not execute a script tag injected as a saved formula", () => {
      window.__xssDialogScript = undefined;
      setupBar({ customDice: ['<script>window.__xssDialogScript = true</script>'] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      expect(window.__xssDialogScript).toBeUndefined();
    });

    it("does not execute an event handler injected as a saved formula", () => {
      window.__xssDialogAttr = undefined;
      setupBar({ customDice: ['1d6" onmouseover="window.__xssDialogAttr=true'] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      expect(window.__xssDialogAttr).toBeUndefined();
    });

    it("does not execute an img onerror payload injected as a saved formula", () => {
      window.__xssDialogImg = undefined;
      setupBar({ customDice: ['<img src=x onerror="window.__xssDialogImg=true">'] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      expect(window.__xssDialogImg).toBeUndefined();
    });

    it("displays a formula containing HTML characters as literal text in the table", () => {
      setupBar({ customDice: ['<b>1d6</b>'] });
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      const td = html.find("tbody td").filter((_, el) => el.textContent === "<b>1d6</b>");
      expect(td.length).toBe(1);
    });
  });

  describe("config dialog — tab navigation", () => {
    let html;
    beforeEach(() => {
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      ({ html } = openDialogHtml());
    });

    function visiblePanel() {
      return ["dice", "layout", "reset", "extra"].find(
        name => !html.find(`[data-panel="${name}"]`).hasClass("sqd-tab-panel-hidden")
      );
    }

    function activeTab() {
      return html.find(".sqd-tab.sqd-tab-active").data("tab");
    }

    describe("initial state", () => {
      it("dice tab is active on open", () => {
        expect(activeTab()).toBe("dice");
      });

      it("layout, reset, and extra tabs are not active on open", () => {
        expect(html.find("[data-tab='layout']").hasClass("sqd-tab-active")).toBe(false);
        expect(html.find("[data-tab='reset']").hasClass("sqd-tab-active")).toBe(false);
        expect(html.find("[data-tab='extra']").hasClass("sqd-tab-active")).toBe(false);
      });

      it("only the dice panel is visible on open", () => {
        expect(visiblePanel()).toBe("dice");
      });
    });

    describe("clicking Layout tab", () => {
      beforeEach(() => { html.find("[data-tab='layout']").trigger("click"); });

      it("shows the layout panel", () => {
        expect(html.find("[data-panel='layout']").hasClass("sqd-tab-panel-hidden")).toBe(false);
      });

      it("hides the dice, reset, and extra panels", () => {
        expect(html.find("[data-panel='dice']").hasClass("sqd-tab-panel-hidden")).toBe(true);
        expect(html.find("[data-panel='reset']").hasClass("sqd-tab-panel-hidden")).toBe(true);
        expect(html.find("[data-panel='extra']").hasClass("sqd-tab-panel-hidden")).toBe(true);
      });

      it("marks the layout tab active", () => {
        expect(activeTab()).toBe("layout");
      });

      it("removes active class from dice, reset, and extra tabs", () => {
        expect(html.find("[data-tab='dice']").hasClass("sqd-tab-active")).toBe(false);
        expect(html.find("[data-tab='reset']").hasClass("sqd-tab-active")).toBe(false);
        expect(html.find("[data-tab='extra']").hasClass("sqd-tab-active")).toBe(false);
      });
    });

    describe("clicking Reset tab", () => {
      beforeEach(() => { html.find("[data-tab='reset']").trigger("click"); });

      it("shows the reset panel", () => {
        expect(html.find("[data-panel='reset']").hasClass("sqd-tab-panel-hidden")).toBe(false);
      });

      it("hides the dice, layout, and extra panels", () => {
        expect(html.find("[data-panel='dice']").hasClass("sqd-tab-panel-hidden")).toBe(true);
        expect(html.find("[data-panel='layout']").hasClass("sqd-tab-panel-hidden")).toBe(true);
        expect(html.find("[data-panel='extra']").hasClass("sqd-tab-panel-hidden")).toBe(true);
      });

      it("marks the reset tab active", () => {
        expect(activeTab()).toBe("reset");
      });

      it("removes active class from dice, layout, and extra tabs", () => {
        expect(html.find("[data-tab='dice']").hasClass("sqd-tab-active")).toBe(false);
        expect(html.find("[data-tab='layout']").hasClass("sqd-tab-active")).toBe(false);
        expect(html.find("[data-tab='extra']").hasClass("sqd-tab-active")).toBe(false);
      });
    });

    describe("clicking Dice tab after navigating away", () => {
      beforeEach(() => {
        html.find("[data-tab='layout']").trigger("click");
        html.find("[data-tab='dice']").trigger("click");
      });

      it("shows the dice panel", () => {
        expect(html.find("[data-panel='dice']").hasClass("sqd-tab-panel-hidden")).toBe(false);
      });

      it("hides the layout and reset panels", () => {
        expect(html.find("[data-panel='layout']").hasClass("sqd-tab-panel-hidden")).toBe(true);
        expect(html.find("[data-panel='reset']").hasClass("sqd-tab-panel-hidden")).toBe(true);
      });

      it("marks the dice tab active", () => {
        expect(activeTab()).toBe("dice");
      });
    });

    it("cycles through all four tabs correctly", () => {
      html.find("[data-tab='layout']").trigger("click");
      expect(visiblePanel()).toBe("layout");

      html.find("[data-tab='reset']").trigger("click");
      expect(visiblePanel()).toBe("reset");

      html.find("[data-tab='extra']").trigger("click");
      expect(visiblePanel()).toBe("extra");

      html.find("[data-tab='dice']").trigger("click");
      expect(visiblePanel()).toBe("dice");
    });

    it("exactly one panel is visible at all times", () => {
      for (const tab of ["layout", "reset", "extra", "dice", "layout"]) {
        html.find(`[data-tab='${tab}']`).trigger("click");
        const visibleCount = ["dice", "layout", "reset", "extra"].filter(
          name => !html.find(`[data-panel="${name}"]`).hasClass("sqd-tab-panel-hidden")
        ).length;
        expect(visibleCount).toBe(1);
      }
    });

    describe("clicking Extra tab", () => {
      beforeEach(() => { html.find("[data-tab='extra']").trigger("click"); });

      it("shows the extra panel", () => {
        expect(html.find("[data-panel='extra']").hasClass("sqd-tab-panel-hidden")).toBe(false);
      });

      it("hides the dice, layout, and reset panels", () => {
        expect(html.find("[data-panel='dice']").hasClass("sqd-tab-panel-hidden")).toBe(true);
        expect(html.find("[data-panel='layout']").hasClass("sqd-tab-panel-hidden")).toBe(true);
        expect(html.find("[data-panel='reset']").hasClass("sqd-tab-panel-hidden")).toBe(true);
      });

      it("marks the extra tab active", () => {
        expect(activeTab()).toBe("extra");
      });

      it("removes active class from dice, layout, and reset tabs", () => {
        expect(html.find("[data-tab='dice']").hasClass("sqd-tab-active")).toBe(false);
        expect(html.find("[data-tab='layout']").hasClass("sqd-tab-active")).toBe(false);
        expect(html.find("[data-tab='reset']").hasClass("sqd-tab-active")).toBe(false);
      });
    });
  });

  describe("config dialog — extra tab", () => {
    function openExtra(flagOverrides = {}) {
      setupBar(flagOverrides);
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      html.find("[data-tab='extra']").trigger("click");
      return html;
    }

    it("checkbox is unchecked when barHidden flag is not set", () => {
      const html = openExtra();
      expect(html.find(".sqd-hide-bar-checkbox").prop("checked")).toBe(false);
    });

    it("checkbox is checked when barHidden flag is true", () => {
      const html = openExtra({ barHidden: true });
      expect(html.find(".sqd-hide-bar-checkbox").prop("checked")).toBe(true);
    });

    it("checking the checkbox does not immediately save the setting", () => {
      const html = openExtra();
      global.game.settings.set.mockClear();
      html.find(".sqd-hide-bar-checkbox").prop("checked", true).trigger("change");
      expect(global.game.settings.set).not.toHaveBeenCalled();
    });

    it("checking the checkbox hides the bar immediately for preview", () => {
      const html = openExtra();
      html.find(".sqd-hide-bar-checkbox").prop("checked", true).trigger("change");
      expect(document.querySelector(".sqd-dice-bar").style.display).toBe("none");
    });

    it("unchecking the checkbox shows the bar immediately for preview", () => {
      const html = openExtra({ barHidden: true });
      html.find(".sqd-hide-bar-checkbox").prop("checked", false).trigger("change");
      expect(document.querySelector(".sqd-dice-bar").style.display).not.toBe("none");
    });

    it("Cancel restores the bar to visible when checkbox was checked but not saved", async () => {
      const html = openExtra();
      html.find(".sqd-hide-bar-checkbox").prop("checked", true).trigger("change");
      expect(document.querySelector(".sqd-dice-bar").style.display).toBe("none");
      global.foundry.applications.api.DialogV2.__resolveDialog(null);
      await new Promise(r => setTimeout(r, 0));
      expect(document.querySelector(".sqd-dice-bar").style.display).not.toBe("none");
    });

    it("Save saves barHidden as true when checkbox is checked", async () => {
      const html = openExtra();
      html.find(".sqd-hide-bar-checkbox").prop("checked", true);
      global.game.settings.set.mockClear();
      const options = global.foundry.applications.api.DialogV2.__lastOptions;
      const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: container });
      expect(global.game.settings.set).toHaveBeenCalledWith("star-quick-dice", "barHidden", true);
    });

    it("Save saves barHidden as false when checkbox is unchecked", async () => {
      const html = openExtra({ barHidden: true });
      html.find(".sqd-hide-bar-checkbox").prop("checked", false);
      global.game.settings.set.mockClear();
      const options = global.foundry.applications.api.DialogV2.__lastOptions;
      const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: container });
      expect(global.game.settings.set).toHaveBeenCalledWith("star-quick-dice", "barHidden", false);
    });

    it("Save hides the bar when checkbox is checked", async () => {
      const html = openExtra();
      html.find(".sqd-hide-bar-checkbox").prop("checked", true);
      const options = global.foundry.applications.api.DialogV2.__lastOptions;
      const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: container });
      expect(document.querySelector(".sqd-dice-bar").style.display).toBe("none");
    });

    it("Save shows the bar when checkbox is unchecked", async () => {
      setupBar({ barHidden: true });
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      html.find("[data-tab='extra']").trigger("click");
      html.find(".sqd-hide-bar-checkbox").prop("checked", false);
      const options = global.foundry.applications.api.DialogV2.__lastOptions;
      const container = global.foundry.applications.api.DialogV2.__lastInstance.element;
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: container });
      expect(document.querySelector(".sqd-dice-bar").style.display).not.toBe("none");
    });

    it("hides the bar on load when barHidden flag is true", () => {
      setupBar({ barHidden: true });
      expect(document.querySelector(".sqd-dice-bar").style.display).toBe("none");
    });

    it("shows the bar on load when barHidden flag is not set", () => {
      setupBar();
      expect(document.querySelector(".sqd-dice-bar").style.display).not.toBe("none");
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
      expect(labels).toContain("1d4");
      expect(labels).toContain("1d20");
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
      expect(labels[0]).toBe("1d6");
      expect(labels[1]).toBe("1d4");
    });

    it("saves barGrid flag on save", async () => {
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      const { options } = openDialogHtml();
      global.game.user.setFlag.mockClear();
      const container = document.createElement("div");
      container.innerHTML = options.content;
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: container });
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "barGrid", expect.any(Array)
      );
    });

    it("save does not store an empty-string key in diceVisibility", async () => {
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      const { options } = openDialogHtml();
      global.game.user.setFlag.mockClear();
      const container = document.createElement("div");
      container.innerHTML = options.content;
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: container });
      const visibilityCall = global.game.user.setFlag.mock.calls.find(c => c[1] === "diceVisibility");
      expect(Object.keys(visibilityCall[2])).not.toContain("");
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

    it("reset position button does not immediately save the barPosition flag", () => {
      html.find(".sqd-reset-position-btn").trigger("click");
      expect(global.game.user.setFlag).not.toHaveBeenCalledWith("star-quick-dice", "barPosition", expect.anything());
    });

    it("reset position button applies default position immediately for preview", () => {
      setupBar({ barPosition: { left: 200, top: 150 } });
      document.querySelector(".sqd-config-btn").click();
      const { html: localHtml } = openDialogHtml();
      localHtml.find(".sqd-reset-position-btn").trigger("click");
      const bar = document.querySelector(".sqd-dice-bar");
      expect(bar.style.left).not.toBe("200px");
      expect(bar.style.top).not.toBe("150px");
    });

    it("reset position unsets the barPosition flag when Save is clicked", async () => {
      html.find(".sqd-reset-position-btn").trigger("click");
      global.game.user.setFlag.mockClear();
      global.game.user.unsetFlag.mockClear();
      const container = document.createElement("div");
      const options = global.foundry.applications.api.DialogV2.__lastOptions;
      container.innerHTML = options.content;
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: container });
      expect(global.game.user.unsetFlag).toHaveBeenCalledWith("star-quick-dice", "barPosition");
    });

    it("reset position does not save barPosition flag when Save is clicked without reset", async () => {
      global.game.user.setFlag.mockClear();
      global.game.user.unsetFlag.mockClear();
      const container = document.createElement("div");
      const options = global.foundry.applications.api.DialogV2.__lastOptions;
      container.innerHTML = options.content;
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: container });
      expect(global.game.user.setFlag).not.toHaveBeenCalledWith("star-quick-dice", "barPosition", expect.anything());
      expect(global.game.user.unsetFlag).not.toHaveBeenCalledWith("star-quick-dice", "barPosition");
    });

    it("reset position restores original bar position when dialog is closed without Save", async () => {
      setupBar({ barPosition: { left: 200, top: 150 } });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
      localHtml.find(".sqd-reset-position-btn").trigger("click");
      global.foundry.applications.api.DialogV2.__resolveDialog(null);
      await new Promise(r => setTimeout(r, 0));
      expect(document.querySelector(".sqd-dice-bar").style.left).toBe("200px");
      expect(document.querySelector(".sqd-dice-bar").style.top).toBe("150px");
    });

    it("reset position button does not close the dialog", () => {
      html.find(".sqd-reset-position-btn").trigger("click");
      expect(global.foundry.applications.api.DialogV2.__lastInstance.close).not.toHaveBeenCalled();
    });

    it("reset dice button does not immediately write any flags", () => {
      html.find(".sqd-reset-dice-btn").trigger("click");
      expect(global.game.user.unsetFlag).not.toHaveBeenCalled();
      expect(global.game.user.setFlag).not.toHaveBeenCalled();
    });

    it("reset dice button saves reset state when Save is clicked", async () => {
      setupBar({ customDice: ["1d105"] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
      localHtml.find(".sqd-reset-dice-btn").trigger("click");
      global.game.user.setFlag.mockClear();
      const options = global.foundry.applications.api.DialogV2.__lastOptions;
      const container = document.createElement("div");
      container.innerHTML = options.content;
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: container });
      expect(global.game.user.setFlag).toHaveBeenCalledWith("star-quick-dice", "customDice", []);
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "barGrid", [["1d4","1d6","1d8","1d10","1d12","1d20","1d100"]]
      );
    });

    it("reset dice button saves all-visible diceVisibility when Save is clicked after reset", async () => {
      setupBar({ diceVisibility: { "1d4": false, "1d6": false } });
      document.querySelector(".sqd-config-btn").click();
      const { options } = openDialogHtml();
      const instance = global.foundry.applications.api.DialogV2.__lastInstance;
      const localHtml = $(instance.element);
      localHtml.find(".sqd-reset-dice-btn").trigger("click");
      global.game.user.setFlag.mockClear();
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: instance.element });
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice",
        "diceVisibility",
        Object.fromEntries(["1d4","1d6","1d8","1d10","1d12","1d20","1d100"].map(f => [f, true]))
      );
    });

    it("reset dice button previews built-in dice only on the bar immediately", () => {
      setupBar({ customDice: ["1d105"] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
      localHtml.find(".sqd-reset-dice-btn").trigger("click");
      expect(document.querySelectorAll("button[data-roll]")).toHaveLength(7);
    });

    it("reset dice button removes custom die rows from the dice table", () => {
      setupBar({ customDice: ["1d105"] });
      document.querySelector(".sqd-config-btn").click();
      const { html: localHtml } = openDialogHtml();
      expect(localHtml.find("tbody tr[data-formula='1d105']").length).toBe(1);
      localHtml.find(".sqd-reset-dice-btn").trigger("click");
      expect(localHtml.find("tbody tr[data-formula='1d105']").length).toBe(0);
    });

    it("reset dice button restores original bar dice when dialog is closed without Save", async () => {
      setupBar({ customDice: ["1d105"] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
      localHtml.find(".sqd-reset-dice-btn").trigger("click");
      global.foundry.applications.api.DialogV2.__resolveDialog(null);
      await new Promise(r => setTimeout(r, 0));
      expect(document.querySelectorAll("button[data-roll]")).toHaveLength(8);
    });

    it("reset dice button does not close the dialog", () => {
      html.find(".sqd-reset-dice-btn").trigger("click");
      expect(global.foundry.applications.api.DialogV2.__lastInstance.close).not.toHaveBeenCalled();
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
      setupBar({ customDice: ["1d105"] });
      document.querySelector(".sqd-config-btn").click();
      const { options } = openDialogHtml();
      global.game.user.getFlag.mockReturnValue(undefined);
      const container = document.createElement("div");
      container.innerHTML = options.content;
      const instance = global.foundry.applications.api.DialogV2.__lastInstance;
      instance.element = container;
      options.render(null, instance);
      const localHtml = $(container);
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
