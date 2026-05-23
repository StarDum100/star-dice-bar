const $ = require("jquery");

const hookCallbacks = {};

global.$ = $;
global.Hooks = {
  once: jest.fn((event, cb) => {
    hookCallbacks[event] = cb;
  }),
};
global.Roll = jest.fn();
global.ChatMessage = {
  getSpeaker: jest.fn().mockReturnValue({ alias: "Tester" }),
};
global.game = {
  user: {
    getFlag: jest.fn().mockReturnValue(undefined),
    setFlag: jest.fn().mockResolvedValue(undefined),
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

describe("Star Quick Dice", () => {
  describe("init hook", () => {
    it("registers an init hook", () => {
      expect(global.Hooks.once).toHaveBeenCalledWith(
        "init",
        expect.any(Function)
      );
    });
  });

  describe("ready hook", () => {
    beforeEach(() => {
      global.game.user.getFlag.mockReturnValue(undefined);
      document.body.innerHTML = '<div id="ui-top"></div>';
      hookCallbacks["ready"]();
    });

    it("appends the dice bar to #ui-top", () => {
      expect(document.querySelector(".quick-dice-bar")).not.toBeNull();
    });

    it("renders 7 dice buttons", () => {
      const buttons = document.querySelectorAll(".quick-dice-bar button[data-roll]");
      expect(buttons).toHaveLength(7);
    });

    it("renders a config button", () => {
      expect(document.querySelector(".sqd-config-btn")).not.toBeNull();
    });

    it.each([
      ["d4", "1d4"],
      ["d6", "1d6"],
      ["d8", "1d8"],
      ["d10", "1d10"],
      ["d12", "1d12"],
      ["d20", "1d20"],
      ["d100", "1d100"],
    ])("%s button has correct label and data-roll", (label, formula) => {
      const btn = document.querySelector(`[data-roll="${formula}"]`);
      expect(btn).not.toBeNull();
      expect(btn.textContent.trim()).toBe(label);
    });

    describe("ordering", () => {
      it("renders buttons in saved order from diceOrder flag", () => {
        global.game.user.getFlag.mockImplementation((ns, key) => {
          if (key === "diceOrder") return ["1d20", "1d4", "1d6", "1d8", "1d10", "1d12", "1d100"];
          return undefined;
        });
        document.body.innerHTML = '<div id="ui-top"></div>';
        hookCallbacks["ready"]();
        const buttons = [...document.querySelectorAll(".quick-dice-bar button[data-roll]")];
        expect(buttons[0].dataset.roll).toBe("1d20");
        expect(buttons[1].dataset.roll).toBe("1d4");
      });

      it("renders buttons in default order when no diceOrder flag is set", () => {
        document.body.innerHTML = '<div id="ui-top"></div>';
        hookCallbacks["ready"]();
        const buttons = [...document.querySelectorAll(".quick-dice-bar button[data-roll]")];
        expect(buttons[0].dataset.roll).toBe("1d4");
        expect(buttons[6].dataset.roll).toBe("1d100");
      });

      it("appends dice not present in the saved order at the end", () => {
        global.game.user.getFlag.mockImplementation((ns, key) => {
          if (key === "diceOrder") return ["1d20", "1d4"];
          return undefined;
        });
        document.body.innerHTML = '<div id="ui-top"></div>';
        hookCallbacks["ready"]();
        const buttons = [...document.querySelectorAll(".quick-dice-bar button[data-roll]")];
        expect(buttons[0].dataset.roll).toBe("1d20");
        expect(buttons[1].dataset.roll).toBe("1d4");
        // remaining dice appended in original order
        expect(buttons[2].dataset.roll).toBe("1d6");
      });

      it("ignores unknown formulas in the saved order without crashing", () => {
        global.game.user.getFlag.mockImplementation((ns, key) => {
          if (key === "diceOrder") return ["1d999", "1d4", "1d6"];
          return undefined;
        });
        document.body.innerHTML = '<div id="ui-top"></div>';
        expect(() => hookCallbacks["ready"]()).not.toThrow();
        // 1d999 is unknown so only 7 built-in dice render
        const buttons = document.querySelectorAll(".quick-dice-bar button[data-roll]");
        expect(buttons).toHaveLength(7);
      });
    });

    describe("custom dice", () => {
      it("renders custom dice from saved flags", () => {
        global.game.user.getFlag.mockImplementation((ns, key) => {
          if (key === "customDice") return [{ label: "d105", formula: "1d105" }];
          return undefined;
        });
        document.body.innerHTML = '<div id="ui-top"></div>';
        hookCallbacks["ready"]();
        expect(document.querySelector('[data-roll="1d105"]')).not.toBeNull();
      });

      it("renders 8 dice buttons when one custom die is saved", () => {
        global.game.user.getFlag.mockImplementation((ns, key) => {
          if (key === "customDice") return [{ label: "2d6", formula: "2d6" }];
          return undefined;
        });
        document.body.innerHTML = '<div id="ui-top"></div>';
        hookCallbacks["ready"]();
        const buttons = document.querySelectorAll(".quick-dice-bar button[data-roll]");
        expect(buttons).toHaveLength(8);
      });
    });

    describe("visibility", () => {
      it("hides dice buttons that are saved as not visible", () => {
        global.game.user.getFlag.mockImplementation((ns, key) => {
          if (key === "diceVisibility") return { "1d4": false };
          return undefined;
        });
        document.body.innerHTML = '<div id="ui-top"></div>';
        hookCallbacks["ready"]();
        const d4 = document.querySelector('[data-roll="1d4"]');
        expect(d4.style.display).toBe("none");
      });

      it("shows dice buttons that are saved as visible", () => {
        global.game.user.getFlag.mockImplementation((ns, key) => {
          if (key === "diceVisibility") return { "1d20": true };
          return undefined;
        });
        document.body.innerHTML = '<div id="ui-top"></div>';
        hookCallbacks["ready"]();
        const d20 = document.querySelector('[data-roll="1d20"]');
        expect(d20.style.display).not.toBe("none");
      });
    });

    describe("on button click", () => {
      let mockRollInstance;

      beforeEach(() => {
        mockRollInstance = {
          evaluate: jest.fn().mockResolvedValue(undefined),
          toMessage: jest.fn(),
        };
        global.Roll.mockClear();
        global.Roll.mockImplementation(() => mockRollInstance);
      });

      it("creates a Roll with the correct formula", () => {
        document.querySelector('[data-roll="1d20"]').click();
        expect(global.Roll).toHaveBeenCalledWith("1d20");
      });

      it("evaluates the roll", async () => {
        document.querySelector('[data-roll="1d6"]').click();
        await Promise.resolve();
        expect(mockRollInstance.evaluate).toHaveBeenCalled();
      });

      it("sends to chat with correct flavor text", async () => {
        document.querySelector('[data-roll="1d8"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(mockRollInstance.toMessage).toHaveBeenCalledWith(
          expect.objectContaining({ flavor: "Quick Roll: 1d8" })
        );
      });

      it("includes the current speaker in the message", async () => {
        document.querySelector('[data-roll="1d4"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(mockRollInstance.toMessage).toHaveBeenCalledWith(
          expect.objectContaining({ speaker: { alias: "Tester" } })
        );
      });
    });
  });

  describe("formulaToLabel", () => {
    function renderWithLabel(formula, label) {
      global.game.user.getFlag.mockImplementation((ns, key) => {
        if (key === "customDice") return [{ label, formula }];
        return undefined;
      });
      document.body.innerHTML = '<div id="ui-top"></div>';
      hookCallbacks["ready"]();
    }

    const validCases = [
      ["1d4",   "d4"  ],
      ["1d105", "d105"],
      ["2d6",   "2d6" ],
      ["3d8",   "3d8" ],
    ];

    it.each(validCases)("formulaToLabel(%s) === %s", (formula, expected) => {
      renderWithLabel(formula, expected);
      const btn = document.querySelector(`[data-roll="${formula}"]`);
      expect(btn).not.toBeNull();
      expect(btn.textContent.trim()).toBe(expected);
    });

    describe("invalid label values", () => {
      it("renders without crashing when label has no digits", () => {
        expect(() => renderWithLabel("1d999", "abc")).not.toThrow();
        expect(document.querySelector('[data-roll="1d999"]')).not.toBeNull();
      });

      it("renders without crashing when label is empty", () => {
        expect(() => renderWithLabel("1d999", "")).not.toThrow();
        expect(document.querySelector('[data-roll="1d999"]')).not.toBeNull();
      });

      it("renders without crashing when label contains special characters", () => {
        expect(() => renderWithLabel("1d999", "!@#$%^&*()")).not.toThrow();
        expect(document.querySelector('[data-roll="1d999"]')).not.toBeNull();
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
      global.game.user.getFlag.mockReturnValue(undefined);
      global.ui.notifications.warn.mockClear();
      document.body.innerHTML = '<div id="ui-top"></div>';
      hookCallbacks["ready"]();

      // Open the config dialog and call the render callback with the dialog content
      document.querySelector(".sqd-config-btn").click();
      const options = global.Dialog.__lastOptions;
      const container = document.createElement("div");
      container.innerHTML = options.content;
      html = $(container);
      options.render(html);
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

  describe("bar positioning", () => {
    beforeEach(() => {
      global.game.user.getFlag.mockReturnValue(undefined);
    });

    it("applies saved position from barPosition flag", () => {
      global.game.user.getFlag.mockImplementation((ns, key) => {
        if (key === "barPosition") return { left: 200, top: 150 };
        return undefined;
      });
      document.body.innerHTML = "";
      hookCallbacks["ready"]();
      const bar = document.querySelector(".quick-dice-bar");
      expect(bar.style.left).toBe("200px");
      expect(bar.style.top).toBe("150px");
    });

    it("applies default position when no barPosition flag is set", () => {
      document.body.innerHTML = "";
      hookCallbacks["ready"]();
      const bar = document.querySelector(".quick-dice-bar");
      expect(bar.style.top).toBe("10px");
      expect(bar.style.left).toMatch(/^\d+px$/);
    });

    it("appends the bar to body", () => {
      document.body.innerHTML = "";
      hookCallbacks["ready"]();
      expect(document.body.querySelector(".quick-dice-bar")).not.toBeNull();
    });

    it("renders a drag handle", () => {
      document.body.innerHTML = "";
      hookCallbacks["ready"]();
      expect(document.querySelector(".sqd-bar-handle")).not.toBeNull();
    });

    it("saves position to flag on drag end", () => {
      document.body.innerHTML = "";
      hookCallbacks["ready"]();
      global.game.user.setFlag.mockClear();

      const handle = document.querySelector(".sqd-bar-handle");
      $(handle).trigger({ type: "mousedown", clientX: 50, clientY: 50, preventDefault: () => {} });
      $(document).trigger({ type: "mousemove.sqd-drag", clientX: 80, clientY: 70 });
      $(document).trigger("mouseup.sqd-drag");

      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice",
        "barPosition",
        expect.objectContaining({ left: expect.any(Number), top: expect.any(Number) })
      );
    });
  });

  describe("config dialog — reset tab", () => {
    let html;

    beforeEach(() => {
      global.game.user.getFlag.mockReturnValue(undefined);
      global.game.user.setFlag.mockClear();
      document.body.innerHTML = "";
      hookCallbacks["ready"]();
      document.querySelector(".sqd-config-btn").click();
      const options = global.Dialog.__lastOptions;
      const container = document.createElement("div");
      container.innerHTML = options.content;
      html = $(container);
      options.render(html);
    });

    it("shows the dice panel by default and hides the reset panel", () => {
      expect(html.find("[data-panel='dice']").hasClass("sqd-tab-panel-hidden")).toBe(false);
      expect(html.find("[data-panel='reset']").hasClass("sqd-tab-panel-hidden")).toBe(true);
    });

    it("switches to the reset panel when the Reset tab is clicked", () => {
      html.find("[data-tab='reset']").trigger("click");
      expect(html.find("[data-panel='reset']").hasClass("sqd-tab-panel-hidden")).toBe(false);
      expect(html.find("[data-panel='dice']").hasClass("sqd-tab-panel-hidden")).toBe(true);
    });

    it("switches back to the dice panel when the Dice tab is clicked", () => {
      html.find("[data-tab='reset']").trigger("click");
      html.find("[data-tab='dice']").trigger("click");
      expect(html.find("[data-panel='dice']").hasClass("sqd-tab-panel-hidden")).toBe(false);
      expect(html.find("[data-panel='reset']").hasClass("sqd-tab-panel-hidden")).toBe(true);
    });

    it("reset position button saves null barPosition flag", async () => {
      html.find(".sqd-reset-position-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));
      expect(global.game.user.setFlag).toHaveBeenCalledWith(
        "star-quick-dice", "barPosition", null
      );
    });

    it("reset position button closes the dialog", async () => {
      html.find(".sqd-reset-position-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));
      expect(global.Dialog.__lastInstance.close).toHaveBeenCalled();
    });

    it("reset dice button clears customDice, diceOrder, and diceVisibility flags", async () => {
      html.find(".sqd-reset-dice-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));
      expect(global.game.user.setFlag).toHaveBeenCalledWith("star-quick-dice", "customDice", []);
      expect(global.game.user.setFlag).toHaveBeenCalledWith("star-quick-dice", "diceOrder", []);
      expect(global.game.user.setFlag).toHaveBeenCalledWith("star-quick-dice", "diceVisibility", {});
    });

    it("reset dice button closes the dialog", async () => {
      html.find(".sqd-reset-dice-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));
      expect(global.Dialog.__lastInstance.close).toHaveBeenCalled();
    });

    it("reset dice button re-renders the bar with only built-in dice", async () => {
      global.game.user.getFlag.mockImplementation((ns, key) => {
        if (key === "customDice") return [{ label: "d105", formula: "1d105" }];
        return undefined;
      });
      document.body.innerHTML = "";
      hookCallbacks["ready"]();
      document.querySelector(".sqd-config-btn").click();
      const options = global.Dialog.__lastOptions;
      const container = document.createElement("div");
      container.innerHTML = options.content;
      const localHtml = $(container);
      global.game.user.getFlag.mockReturnValue(undefined);
      options.render(localHtml);
      localHtml.find(".sqd-reset-dice-btn").trigger("click");
      await new Promise(r => setTimeout(r, 0));
      const buttons = document.querySelectorAll(".quick-dice-bar button[data-roll]");
      expect(buttons).toHaveLength(7);
    });
  });

  describe("resilience", () => {
    beforeEach(() => {
      global.game.user.getFlag.mockReturnValue(undefined);
    });

    it("does not throw when #ui-top is absent from the DOM", () => {
      document.body.innerHTML = "";
      expect(() => hookCallbacks["ready"]()).not.toThrow();
    });

    it("each click creates an independent Roll instance with no shared state", async () => {
      document.body.innerHTML = '<div id="ui-top"></div>';
      hookCallbacks["ready"]();

      global.Roll.mockClear();
      global.Roll.mockImplementation(() => ({
        evaluate: jest.fn().mockResolvedValue(undefined),
        toMessage: jest.fn(),
      }));

      document.querySelector('[data-roll="1d6"]').click();
      document.querySelector('[data-roll="1d6"]').click();

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(global.Roll).toHaveBeenCalledTimes(2);
    });
  });
});
