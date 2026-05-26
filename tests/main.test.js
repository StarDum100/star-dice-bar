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
global.requestAnimationFrame = cb => cb();

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

// There are no built-in dice; the bar is empty until the user adds custom dice. Tests that
// need a populated bar seed this representative set via setupBarWithDice().
const DEFAULT_DICE = ["1d4", "1d6", "1d8", "1d10", "1d12", "1d20", "1d100"]
  .map(formula => ({ formula, label: "" }));

function setupBarWithDice(extra = {}) {
  setupBar({ customDice: DEFAULT_DICE, ...extra });
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
      setupBarWithDice();
    });

    it("appends the dice bar to body", () => {
      expect(document.querySelector(".sqd-dice-bar")).not.toBeNull();
    });

    it("renders no dice buttons by default (empty bar)", () => {
      setupBar();
      expect(document.querySelectorAll("button[data-roll]")).toHaveLength(0);
    });

    it("shows the empty-state hint when there are no dice", () => {
      setupBar();
      expect(document.querySelector(".sqd-empty-hint")).not.toBeNull();
    });

    it("hides the empty-state hint once dice exist", () => {
      expect(document.querySelector(".sqd-empty-hint")).toBeNull();
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
        setupBarWithDice({ barGrid: [["1d20", "1d4", "1d6", "1d8", "1d10", "1d12", "1d100"]] });
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
        setupBarWithDice({ barGrid: [["1d4", "1d6"], ["1d8", "1d10"]] });
        expect(document.querySelectorAll(".sqd-bar-row")).toHaveLength(2);
        expect(document.querySelectorAll("button[data-roll]")).toHaveLength(4);
      });

      it("ignores unknown formulas in barGrid without crashing", () => {
        setupBarWithDice({ barGrid: [["1d999", "1d4"]] });
        expect(() => {}).not.toThrow();
        expect(document.querySelectorAll("button[data-roll]")).toHaveLength(1);
      });

      it("adds sqd-bar-multirow class when barGrid has multiple rows", () => {
        setupBarWithDice({ barGrid: [["1d4", "1d6"], ["1d8", "1d10"]] });
        expect(document.querySelector(".sqd-dice-bar").classList.contains("sqd-bar-multirow")).toBe(true);
      });

      it("does not add sqd-bar-multirow class for a single-row barGrid", () => {
        setupBarWithDice();
        expect(document.querySelector(".sqd-dice-bar").classList.contains("sqd-bar-multirow")).toBe(false);
      });
    });

    describe("custom dice", () => {
      it("renders custom dice from saved flags", () => {
        setupBar({ customDice: [{ formula: "1d105", label: "" }] });
        expect(document.querySelector('[data-roll="1d105"]')).not.toBeNull();
      });

      it("renders one button when one custom die is saved", () => {
        setupBar({ customDice: [{ formula: "2d6", label: "" }] });
        expect(document.querySelectorAll("button[data-roll]")).toHaveLength(1);
      });
    });

    describe("visibility", () => {
      it("hides dice buttons saved as not visible", () => {
        setupBarWithDice({ diceVisibility: { "1d4": false } });
        expect(document.querySelector('[data-roll="1d4"]').style.display).toBe("none");
      });

      it("shows dice buttons saved as visible", () => {
        setupBarWithDice({ diceVisibility: { "1d20": true } });
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

    it("defers position calculation to requestAnimationFrame so outerWidth is accurate", () => {
      let rafCb;
      global.requestAnimationFrame = cb => { rafCb = cb; };
      try {
        setupBar();
        // RAF scheduled but not yet fired — position not yet applied
        const bar = document.querySelector(".sqd-dice-bar");
        expect(bar.style.left).toBe("");
        expect(bar.style.top).toBe("");
        // After RAF fires, default position is applied
        rafCb();
        expect(bar.style.top).toBe("10px");
      } finally {
        global.requestAnimationFrame = cb => cb();
      }
    });

    it("barHidden hide is also deferred so the bar is visible when outerWidth is measured", () => {
      let rafCb;
      global.requestAnimationFrame = cb => { rafCb = cb; };
      try {
        setupBar({ barHidden: true });
        // Bar should still be visible before RAF fires (so layout can be measured)
        expect(document.querySelector(".sqd-dice-bar").style.display).not.toBe("none");
        rafCb();
        // After RAF: position applied and bar hidden
        expect(document.querySelector(".sqd-dice-bar").style.display).toBe("none");
      } finally {
        global.requestAnimationFrame = cb => cb();
      }
    });

    it("computes default center position after dice buttons are rendered", () => {
      // outerWidth() is used for centering math; capture the DOM state at the
      // moment it is first called on the bar so we can assert renderBar ran first.
      let diceCountAtPositionCalc = null;
      const original = $.fn.outerWidth;
      $.fn.outerWidth = function () {
        if (diceCountAtPositionCalc === null && this.hasClass && this.hasClass("sqd-dice-bar")) {
          diceCountAtPositionCalc = document.querySelectorAll("button[data-roll]").length;
        }
        return original.apply(this, arguments);
      };
      try {
        setupBarWithDice();
      } finally {
        $.fn.outerWidth = original;
      }
      expect(diceCountAtPositionCalc).toBeGreaterThan(0);
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
      setupBar({ customDice: [{ formula, label: "" }] });
      const btn = document.querySelector(`[data-roll="${formula}"]`);
      expect(btn).not.toBeNull();
      expect(btn.textContent.trim()).toBe(formula);
    });

    describe("invalid saved formula values", () => {
      it("renders without crashing when saved formula has no digits", () => {
        expect(() => setupBar({ customDice: [{ formula: "abc", label: "" }] })).not.toThrow();
      });

      it("renders without crashing when saved formula is empty", () => {
        expect(() => setupBar({ customDice: [{ formula: "", label: "" }] })).not.toThrow();
      });

      it("renders without crashing when saved formula contains special characters", () => {
        expect(() => setupBar({ customDice: [{ formula: "!@#$%^&*()", label: "" }] })).not.toThrow();
      });

      it("renders without crashing when saved formula has a negative multiplier", () => {
        expect(() => setupBar({ customDice: [{ formula: "-1d6", label: "" }] })).not.toThrow();
      });

      it("renders without crashing when saved formula has a negative die size", () => {
        expect(() => setupBar({ customDice: [{ formula: "1d-6", label: "" }] })).not.toThrow();
      });

      it("renders without crashing when saved formula contains arithmetic", () => {
        expect(() => setupBar({ customDice: [{ formula: "2d6-1", label: "" }] })).not.toThrow();
      });

      it("does not execute a script tag injected as a saved formula", () => {
        window.__xssLabel = undefined;
        setupBar({ customDice: [{ formula: '<script>window.__xssLabel = true</script>', label: "" }] });
        expect(window.__xssLabel).toBeUndefined();
      });

      it("does not execute an event handler injected as a saved formula", () => {
        window.__xssFormula = undefined;
        setupBar({ customDice: [{ formula: '1d6" onmouseover="window.__xssFormula=true', label: "" }] });
        expect(window.__xssFormula).toBeUndefined();
      });

      it("does not execute an img onerror payload injected as a saved formula", () => {
        window.__xssImg = undefined;
        setupBar({ customDice: [{ formula: '<img src=x onerror="window.__xssImg=true">', label: "" }] });
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
      ["high dice count and face value", "100d9000"],
    ];

    describe("bar rendering", () => {
      it.each(LARGE_FORMULAS)(
        "renders without crashing when saved formula has %s",
        (_, formula) => {
          expect(() => setupBar({ customDice: [{ formula, label: "" }] })).not.toThrow();
        }
      );

      it.each(LARGE_FORMULAS)(
        "displays the full formula on the button when saved formula has %s",
        (_, formula) => {
          setupBar({ customDice: [{ formula, label: "" }] });
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

    describe("large number of custom dice", () => {
      const MANY_DICE = Array.from({ length: 1000 }, (_, i) => ({ formula: `1d${i + 2}`, label: "" }));

      it("renders without crashing when 1000 custom dice are saved", () => {
        expect(() => setupBar({ customDice: MANY_DICE })).not.toThrow();
      });

      it("renders all 1000 buttons when 1000 custom dice are saved", () => {
        setupBar({ customDice: MANY_DICE });
        expect(document.querySelectorAll("button[data-roll]")).toHaveLength(1000);
      });
    });
  });

  describe("config dialog — add button warnings", () => {
    let html;
    beforeEach(() => {
      global.ui.notifications.warn.mockClear();
      setupBarWithDice();
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
        "Star Quick Dice: Invalid dice formula. Use dice with +/- numbers, e.g. 1d20, 2d6+3, 1d8+1d6."
      );
    });

    it("warns when the formula has no digits", () => {
      attemptAdd("abc");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid dice formula. Use dice with +/- numbers, e.g. 1d20, 2d6+3, 1d8+1d6."
      );
    });

    it("warns when the formula is missing the die size", () => {
      attemptAdd("2d");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid dice formula. Use dice with +/- numbers, e.g. 1d20, 2d6+3, 1d8+1d6."
      );
    });

    it("warns when the formula is missing the multiplier", () => {
      attemptAdd("d6");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid dice formula. Use dice with +/- numbers, e.g. 1d20, 2d6+3, 1d8+1d6."
      );
    });

    it("warns when the formula contains special characters", () => {
      attemptAdd("2d!!");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid dice formula. Use dice with +/- numbers, e.g. 1d20, 2d6+3, 1d8+1d6."
      );
    });

    it("warns when the formula contains a script injection attempt", () => {
      attemptAdd("<script>alert(1)</script>");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid dice formula. Use dice with +/- numbers, e.g. 1d20, 2d6+3, 1d8+1d6."
      );
    });

    it("warns when the formula has a negative multiplier", () => {
      attemptAdd("-1d6");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid dice formula. Use dice with +/- numbers, e.g. 1d20, 2d6+3, 1d8+1d6."
      );
    });

    it("warns when the formula has a negative die size", () => {
      attemptAdd("1d-6");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: Invalid dice formula. Use dice with +/- numbers, e.g. 1d20, 2d6+3, 1d8+1d6."
      );
    });

    it("accepts a formula containing arithmetic", () => {
      attemptAdd("2d6-1");
      expect(global.ui.notifications.warn).not.toHaveBeenCalled();
      expect(html.find('tr[data-formula="2d6-1"]').length).toBe(1);
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
      setupBar({ customDice: [{ formula: '<script>window.__xssDialogScript = true</script>', label: "" }] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      expect(window.__xssDialogScript).toBeUndefined();
    });

    it("does not execute an event handler injected as a saved formula", () => {
      window.__xssDialogAttr = undefined;
      setupBar({ customDice: [{ formula: '1d6" onmouseover="window.__xssDialogAttr=true', label: "" }] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      expect(window.__xssDialogAttr).toBeUndefined();
    });

    it("does not execute an img onerror payload injected as a saved formula", () => {
      window.__xssDialogImg = undefined;
      setupBar({ customDice: [{ formula: '<img src=x onerror="window.__xssDialogImg=true">', label: "" }] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      expect(window.__xssDialogImg).toBeUndefined();
    });

    it("displays a formula containing HTML characters as literal text in the table", () => {
      setupBar({ customDice: [{ formula: '<b>1d6</b>', label: "" }] });
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      const input = html.find("tbody .sqd-formula-cell-input").filter((_, el) => el.value === "<b>1d6</b>");
      expect(input.length).toBe(1);
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
      setupBar({ customDice: DEFAULT_DICE, ...flagOverrides });
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

    it("renders a tile for each die on the layout tab", () => {
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

    it("clear dice button does not immediately write any flags", () => {
      html.find(".sqd-clear-dice-btn").trigger("click");
      expect(global.game.user.unsetFlag).not.toHaveBeenCalled();
      expect(global.game.user.setFlag).not.toHaveBeenCalled();
    });

    it("clear dice button saves an empty bar when Save is clicked", async () => {
      setupBar({ customDice: [{ formula: "1d105", label: "" }] });
      document.querySelector(".sqd-config-btn").click();
      const { options } = openDialogHtml();
      const instance = global.foundry.applications.api.DialogV2.__lastInstance;
      $(instance.element).find(".sqd-clear-dice-btn").trigger("click");
      global.game.user.setFlag.mockClear();
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: instance.element });
      expect(global.game.user.setFlag).toHaveBeenCalledWith("star-quick-dice", "customDice", []);
      expect(global.game.user.setFlag).toHaveBeenCalledWith("star-quick-dice", "barGrid", [[]]);
    });

    it("clear dice button saves empty diceVisibility when Save is clicked", async () => {
      setupBar({ customDice: [{ formula: "2d6", label: "" }], diceVisibility: { "2d6": false } });
      document.querySelector(".sqd-config-btn").click();
      const { options } = openDialogHtml();
      const instance = global.foundry.applications.api.DialogV2.__lastInstance;
      $(instance.element).find(".sqd-clear-dice-btn").trigger("click");
      global.game.user.setFlag.mockClear();
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: instance.element });
      expect(global.game.user.setFlag).toHaveBeenCalledWith("star-quick-dice", "diceVisibility", {});
    });

    it("clear dice button empties the bar immediately", () => {
      setupBar({ customDice: [{ formula: "1d105", label: "" }] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
      localHtml.find(".sqd-clear-dice-btn").trigger("click");
      expect(document.querySelectorAll("button[data-roll]")).toHaveLength(0);
    });

    it("clear dice button shows the empty-state hint on the bar", () => {
      setupBar({ customDice: [{ formula: "1d105", label: "" }] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
      localHtml.find(".sqd-clear-dice-btn").trigger("click");
      expect(document.querySelector(".sqd-empty-hint")).not.toBeNull();
    });

    it("clear dice button removes all rows from the dice table", () => {
      setupBar({ customDice: [{ formula: "1d105", label: "" }] });
      document.querySelector(".sqd-config-btn").click();
      const { html: localHtml } = openDialogHtml();
      expect(localHtml.find("tbody tr[data-formula='1d105']").length).toBe(1);
      localHtml.find(".sqd-clear-dice-btn").trigger("click");
      expect(localHtml.find("tbody tr").length).toBe(0);
    });

    it("clear dice button restores original bar dice when dialog is closed without Save", async () => {
      setupBar({ customDice: [{ formula: "1d105", label: "" }] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      const localHtml = $(global.foundry.applications.api.DialogV2.__lastInstance.element);
      localHtml.find(".sqd-clear-dice-btn").trigger("click");
      global.foundry.applications.api.DialogV2.__resolveDialog(null);
      await new Promise(r => setTimeout(r, 0));
      expect(document.querySelectorAll("button[data-roll]")).toHaveLength(1);
    });

    it("clear dice button does not close the dialog", () => {
      html.find(".sqd-clear-dice-btn").trigger("click");
      expect(global.foundry.applications.api.DialogV2.__lastInstance.close).not.toHaveBeenCalled();
    });

    it("clear dice button empties the layout tab when layout is visible", async () => {
      setupBar({ barGrid: [["1d20"], ["1d4", "1d6"]] });
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      html.find("[data-tab='layout']").trigger("click");
      expect(html.find(".sqd-layout-row")).toHaveLength(2);

      html.find(".sqd-clear-dice-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));

      expect(html.find(".sqd-layout-tile")).toHaveLength(0);
    });
  });

  describe("config dialog — single instance guard", () => {
    it("does not open a second dialog when config button is clicked while one is already open", () => {
      setupBar();
      global.foundry.applications.api.DialogV2.wait.mockClear();
      document.querySelector(".sqd-config-btn").click(); // opens dialog (promise pending)
      document.querySelector(".sqd-config-btn").click(); // should be ignored
      expect(global.foundry.applications.api.DialogV2.wait).toHaveBeenCalledTimes(1);
    });

    it("allows opening a new dialog after the previous one closes", async () => {
      setupBar();
      global.foundry.applications.api.DialogV2.wait.mockClear();
      document.querySelector(".sqd-config-btn").click();
      global.foundry.applications.api.DialogV2.__resolveDialog(null);
      await new Promise(r => setTimeout(r, 0));
      document.querySelector(".sqd-config-btn").click();
      expect(global.foundry.applications.api.DialogV2.wait).toHaveBeenCalledTimes(2);
    });
  });

  describe("resilience", () => {
    beforeEach(() => { setupBarWithDice(); });

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

  describe("formula custom dice", () => {
    let html;
    beforeEach(() => {
      global.ui.notifications.warn.mockClear();
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      ({ html } = openDialogHtml());
    });

    function addDie(formula, nick) {
      html.find(".sqd-formula-input").val(formula);
      if (nick !== undefined) html.find(".sqd-nick-input").val(nick);
      html.find(".sqd-add-btn").trigger("click");
    }

    it("accepts a flat-modifier formula (1d6+2)", () => {
      addDie("1d6+2");
      expect(global.ui.notifications.warn).not.toHaveBeenCalled();
      expect(html.find('tr[data-formula="1d6+2"]').length).toBe(1);
    });

    it("accepts a multi-dice formula (1d6+2d6)", () => {
      addDie("1d6+2d6");
      expect(global.ui.notifications.warn).not.toHaveBeenCalled();
      expect(html.find('tr[data-formula="1d6+2d6"]').length).toBe(1);
    });

    it("strips spaces from the entered formula", () => {
      addDie("1d6 + 2");
      expect(html.find('tr[data-formula="1d6+2"]').length).toBe(1);
    });

    it("rejects a bare die size (d6)", () => {
      addDie("d6");
      expect(global.ui.notifications.warn).toHaveBeenCalled();
    });

    it("rejects a leading sign (-1d6)", () => {
      addDie("-1d6");
      expect(global.ui.notifications.warn).toHaveBeenCalled();
    });

    it("rejects a formula with no dice (5+3)", () => {
      addDie("5+3");
      expect(global.ui.notifications.warn).toHaveBeenCalled();
    });
  });

  describe("case-insensitive dice (D and d)", () => {
    beforeEach(() => { global.ui.notifications.warn.mockClear(); });

    it("accepts an uppercase D in the add form and stores it lowercase", () => {
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      html.find(".sqd-formula-input").val("1D6");
      html.find(".sqd-add-btn").trigger("click");
      expect(global.ui.notifications.warn).not.toHaveBeenCalled();
      expect(html.find('tr[data-formula="1d6"]').length).toBe(1);
    });

    it("normalizes uppercase D across a multi-term formula", () => {
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      html.find(".sqd-formula-input").val("2D6+1D4");
      html.find(".sqd-add-btn").trigger("click");
      expect(html.find('tr[data-formula="2d6+1d4"]').length).toBe(1);
    });
  });

  describe("roll modes (advantage / disadvantage)", () => {
    let mockRoll;
    beforeEach(() => {
      mockRoll = { evaluate: jest.fn().mockResolvedValue(undefined), toMessage: jest.fn() };
      global.Roll.mockClear();
      global.Roll.mockImplementation(() => mockRoll);
      setupBarWithDice();
    });

    it("defaults to Normal mode", () => {
      expect(document.querySelector(".sqd-mode-btn").textContent.trim()).toBe("Normal");
    });

    it("cycles Normal -> Adv -> Dis -> Normal on click", () => {
      const btn = document.querySelector(".sqd-mode-btn");
      btn.click();
      expect(btn.textContent.trim()).toBe("Adv");
      expect(btn.classList.contains("sqd-mode-advantage")).toBe(true);
      btn.click();
      expect(btn.textContent.trim()).toBe("Dis");
      expect(btn.classList.contains("sqd-mode-disadvantage")).toBe(true);
      btn.click();
      expect(btn.textContent.trim()).toBe("Normal");
      expect(btn.classList.contains("sqd-mode-normal")).toBe(true);
    });

    it("rolls the formula unchanged in Normal mode", () => {
      document.querySelector('[data-roll="1d20"]').click();
      expect(global.Roll).toHaveBeenCalledWith("1d20");
    });

    it("doubles each die and keeps highest in Advantage mode", () => {
      document.querySelector(".sqd-mode-btn").click();
      document.querySelector('[data-roll="1d20"]').click();
      expect(global.Roll).toHaveBeenCalledWith("2d20kh1");
    });

    it("doubles each die and keeps lowest in Disadvantage mode", () => {
      document.querySelector(".sqd-mode-btn").click();
      document.querySelector(".sqd-mode-btn").click();
      document.querySelector('[data-roll="1d6"]').click();
      expect(global.Roll).toHaveBeenCalledWith("2d6kl1");
    });

    it("leaves flat modifiers untouched while doubling dice in Advantage mode", () => {
      setupBar({ customDice: [{ formula: "2d6+3", label: "" }] });
      global.Roll.mockClear();
      document.querySelector(".sqd-mode-btn").click();
      document.querySelector('[data-roll="2d6+3"]').click();
      expect(global.Roll).toHaveBeenCalledWith("4d6kh2+3");
    });

    it("notes Advantage in the chat flavor", async () => {
      document.querySelector(".sqd-mode-btn").click();
      document.querySelector('[data-roll="1d20"]').click();
      await new Promise(r => setTimeout(r, 0));
      expect(mockRoll.toMessage).toHaveBeenCalledWith(
        expect.objectContaining({ flavor: "Quick Roll: 1d20 — Advantage" })
      );
    });

    it("notes Disadvantage in the chat flavor", async () => {
      document.querySelector(".sqd-mode-btn").click();
      document.querySelector(".sqd-mode-btn").click();
      document.querySelector('[data-roll="1d20"]').click();
      await new Promise(r => setTimeout(r, 0));
      expect(mockRoll.toMessage).toHaveBeenCalledWith(
        expect.objectContaining({ flavor: "Quick Roll: 1d20 — Disadvantage" })
      );
    });
  });

  describe("custom dice nicknames", () => {
    it("shows the nickname as the button label with the formula as tooltip", () => {
      setupBar({ customDice: [{ formula: "2d6+3", label: "Fireball" }] });
      const btn = document.querySelector('[data-roll="2d6+3"]');
      expect(btn).not.toBeNull();
      expect(btn.textContent.trim()).toBe("Fireball");
      expect(btn.getAttribute("title")).toBe("2d6+3");
    });

    it("falls back to the formula when no nickname is set", () => {
      setupBar({ customDice: [{ formula: "2d6+3", label: "" }] });
      expect(document.querySelector('[data-roll="2d6+3"]').textContent.trim()).toBe("2d6+3");
    });

    it("renders a die with no nickname using the formula as the button label", () => {
      setupBar({ customDice: [{ formula: "1d105", label: "" }] });
      const btn = document.querySelector('[data-roll="1d105"]');
      expect(btn).not.toBeNull();
      expect(btn.textContent.trim()).toBe("1d105");
    });

    it("includes the nickname and formula in the chat flavor", async () => {
      const mockRoll = { evaluate: jest.fn().mockResolvedValue(undefined), toMessage: jest.fn() };
      global.Roll.mockImplementation(() => mockRoll);
      setupBar({ customDice: [{ formula: "2d6+3", label: "Fireball" }] });
      document.querySelector('[data-roll="2d6+3"]').click();
      await new Promise(r => setTimeout(r, 0));
      expect(mockRoll.toMessage).toHaveBeenCalledWith(
        expect.objectContaining({ flavor: "Quick Roll: Fireball (2d6+3)" })
      );
    });

    it("shows the nickname in the config table Name column", () => {
      setupBar({ customDice: [{ formula: "2d6+3", label: "Fireball" }] });
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      expect(html.find('tr[data-formula="2d6+3"] .sqd-nick-cell-input').val()).toBe("Fireball");
    });

    it("persists a nickname entered in the add form on Save", async () => {
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      const { options } = openDialogHtml();
      const instance = global.foundry.applications.api.DialogV2.__lastInstance;
      const localHtml = $(instance.element);
      localHtml.find(".sqd-formula-input").val("2d6+3");
      localHtml.find(".sqd-nick-input").val("Fireball");
      localHtml.find(".sqd-add-btn").trigger("click");
      global.game.user.setFlag.mockClear();
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: instance.element });
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "customDice",
        expect.arrayContaining([{ formula: "2d6+3", label: "Fireball" }])
      );
    });
  });

  describe("nickname XSS", () => {
    it("does not execute a script tag injected as a nickname (config table)", () => {
      window.__xssNickScript = undefined;
      setupBar({ customDice: [{ formula: "1d6+2", label: '<script>window.__xssNickScript=true</script>' }] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      expect(window.__xssNickScript).toBeUndefined();
    });

    it("does not execute an event-handler payload injected as a nickname (config table)", () => {
      window.__xssNickAttr = undefined;
      setupBar({ customDice: [{ formula: "1d6+2", label: '" onmouseover="window.__xssNickAttr=true' }] });
      document.querySelector(".sqd-config-btn").click();
      openDialogHtml();
      expect(window.__xssNickAttr).toBeUndefined();
    });

    it("does not execute an img onerror payload injected as a nickname (bar button)", () => {
      window.__xssNickImg = undefined;
      setupBar({ customDice: [{ formula: "1d6+2", label: '<img src=x onerror="window.__xssNickImg=true">' }] });
      expect(window.__xssNickImg).toBeUndefined();
    });

    it("renders an HTML-character nickname as literal text in the table", () => {
      setupBar({ customDice: [{ formula: "1d6+2", label: '<b>boom</b>' }] });
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      expect(html.find('tr[data-formula="1d6+2"] .sqd-nick-cell-input').val()).toBe('<b>boom</b>');
    });
  });

  describe("config dialog — dice tab inline editing", () => {
    function openDiceTab(flagOverrides = {}) {
      setupBar(flagOverrides);
      document.querySelector(".sqd-config-btn").click();
      return openDialogHtml();
    }

    async function saveDialog(options) {
      const instance = global.foundry.applications.api.DialogV2.__lastInstance;
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: instance.element });
    }

    it("formula cell is pre-filled with the saved formula", () => {
      const { html } = openDiceTab({ customDice: [{ formula: "1d6", label: "" }] });
      expect(html.find('tr[data-formula="1d6"] .sqd-formula-cell-input').val()).toBe("1d6");
    });

    it("nickname cell is pre-filled with the saved nickname", () => {
      const { html } = openDiceTab({ customDice: [{ formula: "1d6", label: "Sword" }] });
      expect(html.find('tr[data-formula="1d6"] .sqd-nick-cell-input').val()).toBe("Sword");
    });

    it("saves the new formula when a formula is edited before saving", async () => {
      const { html, options } = openDiceTab({ customDice: [{ formula: "1d6", label: "" }] });
      html.find('tr[data-formula="1d6"] .sqd-formula-cell-input').val("1d8");
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "customDice",
        expect.arrayContaining([expect.objectContaining({ formula: "1d8" })])
      );
    });

    it("saves the new nickname when a nickname is edited before saving", async () => {
      const { html, options } = openDiceTab({ customDice: [{ formula: "1d6", label: "Sword" }] });
      html.find('tr[data-formula="1d6"] .sqd-nick-cell-input').val("Great Sword");
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "customDice",
        expect.arrayContaining([expect.objectContaining({ formula: "1d6", label: "Great Sword" })])
      );
    });

    it("updates barGrid to use the new formula after saving an edit", async () => {
      const { html, options } = openDiceTab({ customDice: [{ formula: "1d6", label: "" }] });
      html.find('tr[data-formula="1d6"] .sqd-formula-cell-input').val("1d8");
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "barGrid",
        expect.arrayContaining([expect.arrayContaining(["1d8"])])
      );
    });

    it("normalizes uppercase D in an edited formula to lowercase on save", async () => {
      const { html, options } = openDiceTab({ customDice: [{ formula: "1d6", label: "" }] });
      html.find('tr[data-formula="1d6"] .sqd-formula-cell-input').val("1D8");
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "customDice",
        expect.arrayContaining([expect.objectContaining({ formula: "1d8" })])
      );
    });

    it("warns and reverts the invalid row when a formula is edited to an invalid value", async () => {
      const { html, options } = openDiceTab({ customDice: [{ formula: "1d6", label: "" }] });
      html.find('tr[data-formula="1d6"] .sqd-formula-cell-input').val("abc");
      global.game.user.setFlag.mockClear();
      global.ui.notifications.warn.mockClear();
      await saveDialog(options);
      expect(global.ui.notifications.warn).toHaveBeenCalled();
      // Save still proceeds; invalid row keeps its original formula.
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "customDice",
        expect.arrayContaining([expect.objectContaining({ formula: "1d6" })])
      );
    });

    it("warns and keeps original formula when a formula is edited to a duplicate value", async () => {
      const { html, options } = openDiceTab({
        customDice: [{ formula: "1d6", label: "" }, { formula: "1d8", label: "" }],
      });
      html.find('tr[data-formula="1d8"] .sqd-formula-cell-input').val("1d6");
      global.game.user.setFlag.mockClear();
      global.ui.notifications.warn.mockClear();
      await saveDialog(options);
      expect(global.ui.notifications.warn).toHaveBeenCalled();
      // Save proceeds; the duplicate row reverts to its original formula.
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "customDice",
        expect.arrayContaining([expect.objectContaining({ formula: "1d8" })])
      );
    });

    it("saves valid edits when one of multiple formula edits is invalid", async () => {
      const { html, options } = openDiceTab({
        customDice: [{ formula: "1d6", label: "" }, { formula: "1d8", label: "" }],
      });
      html.find('tr[data-formula="1d6"] .sqd-formula-cell-input').val("abc");
      html.find('tr[data-formula="1d8"] .sqd-formula-cell-input').val("1d10");
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "customDice",
        expect.arrayContaining([
          expect.objectContaining({ formula: "1d6" }),  // invalid edit reverted
          expect.objectContaining({ formula: "1d10" }), // valid edit applied
        ])
      );
    });

    it("does not edit a formula to another existing formula when that other die has an invalid edit", async () => {
      // Row A wants 1d4→1d6; row B (currently 1d6) has an invalid edit.
      // 1d6 is kept by row B, so row A's edit must be blocked.
      const { html, options } = openDiceTab({
        customDice: [{ formula: "1d4", label: "" }, { formula: "1d6", label: "" }],
      });
      html.find('tr[data-formula="1d4"] .sqd-formula-cell-input').val("1d6");
      html.find('tr[data-formula="1d6"] .sqd-formula-cell-input').val("bad");
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "customDice",
        expect.arrayContaining([
          expect.objectContaining({ formula: "1d4" }), // blocked (1d6 is occupied)
          expect.objectContaining({ formula: "1d6" }), // reverted (invalid edit)
        ])
      );
    });

    it("visibility is keyed by the new formula after a formula edit", async () => {
      const { html, options } = openDiceTab({ customDice: [{ formula: "1d6", label: "" }] });
      html.find('tr[data-formula="1d6"] .sqd-formula-cell-input').val("1d8");
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      const visibilityCall = global.game.user.setFlag.mock.calls.find(c => c[1] === "diceVisibility");
      expect(Object.keys(visibilityCall[2])).toContain("1d8");
      expect(Object.keys(visibilityCall[2])).not.toContain("1d6");
    });
  });

  describe("duplicate formula support", () => {
    function openDiceTab(flagOverrides = {}) {
      setupBar(flagOverrides);
      document.querySelector(".sqd-config-btn").click();
      return openDialogHtml();
    }

    async function saveDialog(options) {
      const instance = global.foundry.applications.api.DialogV2.__lastInstance;
      const saveBtn = options.buttons.find(b => b.action === "save");
      await saveBtn.callback(null, null, { element: instance.element });
    }

    it("allows adding the same formula with a different nickname", () => {
      global.ui.notifications.warn.mockClear();
      setupBarWithDice();
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      html.find(".sqd-formula-input").val("1d20");
      html.find(".sqd-nick-input").val("Fire Attack");
      html.find(".sqd-add-btn").trigger("click");
      expect(global.ui.notifications.warn).not.toHaveBeenCalled();
    });

    it("renders two buttons with the same formula but different labels", () => {
      setupBar({ customDice: [
        { formula: "1d6", label: "Fire" },
        { formula: "1d6", label: "Ice" },
      ]});
      const buttons = [...document.querySelectorAll("button[data-roll='1d6']")];
      expect(buttons).toHaveLength(2);
      const labels = buttons.map(b => b.textContent.trim());
      expect(labels).toContain("Fire");
      expect(labels).toContain("Ice");
    });

    it("warns when the same formula and nickname combination already exists", () => {
      global.ui.notifications.warn.mockClear();
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      html.find(".sqd-formula-input").val("1d6");
      html.find(".sqd-nick-input").val("Fire");
      html.find(".sqd-add-btn").trigger("click");
      global.ui.notifications.warn.mockClear();
      html.find(".sqd-formula-input").val("1d6");
      html.find(".sqd-nick-input").val("Fire");
      html.find(".sqd-add-btn").trigger("click");
      expect(global.ui.notifications.warn).toHaveBeenCalledWith(
        "Star Quick Dice: 1d6 (Fire) already exists."
      );
    });

    it("allows the same formula with an empty nickname and with a nickname", () => {
      global.ui.notifications.warn.mockClear();
      setupBar();
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      html.find(".sqd-formula-input").val("1d6");
      html.find(".sqd-add-btn").trigger("click");
      html.find(".sqd-formula-input").val("1d6");
      html.find(".sqd-nick-input").val("Fire");
      html.find(".sqd-add-btn").trigger("click");
      expect(global.ui.notifications.warn).not.toHaveBeenCalled();
      expect(html.find("tbody tr[data-formula='1d6']")).toHaveLength(2);
    });

    it("layout tile shows label instead of composite key for a labelled die", () => {
      setupBar({ customDice: [{ formula: "1d6", label: "Fire" }] });
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      html.find("[data-tab='layout']").trigger("click");
      const tileText = html.find(".sqd-layout-tile").first().text().trim();
      expect(tileText).toBe("Fire");
      expect(tileText).not.toContain("|");
    });

    it("layout tile shows formula when die has no label", () => {
      setupBar({ customDice: [{ formula: "1d6", label: "" }] });
      document.querySelector(".sqd-config-btn").click();
      const { html } = openDialogHtml();
      html.find("[data-tab='layout']").trigger("click");
      expect(html.find(".sqd-layout-tile").first().text().trim()).toBe("1d6");
    });

    it("saves two dice with the same formula but different labels as distinct entries", async () => {
      const { options } = openDiceTab({ customDice: [
        { formula: "1d6", label: "Fire" },
        { formula: "1d6", label: "Ice" },
      ]});
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "customDice",
        expect.arrayContaining([
          expect.objectContaining({ formula: "1d6", label: "Fire" }),
          expect.objectContaining({ formula: "1d6", label: "Ice" }),
        ])
      );
    });

    it("inline edit: changing label creates a new unique key", async () => {
      const { html, options } = openDiceTab({ customDice: [{ formula: "1d6", label: "Fire" }] });
      html.find('tr[data-formula="1d6"] .sqd-nick-cell-input').val("Ice");
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "customDice",
        expect.arrayContaining([expect.objectContaining({ formula: "1d6", label: "Ice" })])
      );
    });

    it("visibility is keyed by composite key for a labelled die", async () => {
      const { options } = openDiceTab({ customDice: [{ formula: "1d6", label: "Fire" }] });
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      const visibilityCall = global.game.user.setFlag.mock.calls.find(c => c[1] === "diceVisibility");
      expect(Object.keys(visibilityCall[2])).toContain("1d6|Fire");
      expect(Object.keys(visibilityCall[2])).not.toContain("1d6");
    });

    it("barGrid stores composite keys for labelled dice", async () => {
      const { options } = openDiceTab({ customDice: [{ formula: "1d6", label: "Fire" }] });
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "barGrid",
        expect.arrayContaining([expect.arrayContaining(["1d6|Fire"])])
      );
    });

    it("barGrid stores plain formula for unlabelled dice (backwards compatible)", async () => {
      const { options } = openDiceTab({ customDice: [{ formula: "1d6", label: "" }] });
      global.game.user.setFlag.mockClear();
      await saveDialog(options);
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "barGrid",
        expect.arrayContaining([expect.arrayContaining(["1d6"])])
      );
    });
  });
});
