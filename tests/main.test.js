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
    const cases = [
      ["1d4",   "d4"  ],
      ["1d105", "d105"],
      ["2d6",   "2d6" ],
      ["3d8",   "3d8" ],
    ];

    it.each(cases)("formulaToLabel(%s) === %s", (formula, expected) => {
      global.game.user.getFlag.mockImplementation((ns, key) => {
        if (key === "customDice") return [{ label: expected, formula }];
        return undefined;
      });
      document.body.innerHTML = '<div id="ui-top"></div>';
      hookCallbacks["ready"]();
      const btn = document.querySelector(`[data-roll="${formula}"]`);
      expect(btn).not.toBeNull();
      expect(btn.textContent.trim()).toBe(expected);
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

    it("does not render the dice bar when #ui-top is absent", () => {
      document.body.innerHTML = "";
      hookCallbacks["ready"]();
      expect(document.querySelector(".quick-dice-bar")).toBeNull();
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
