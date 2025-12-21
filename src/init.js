import { registerDsrHbSettings } from "./settings.js";
import { registerTwistedGrace } from "./features/twisted-grace/index.js";

Hooks.once("init", () => {
  registerDsrHbSettings();
});

Hooks.once("ready", () => {
  registerTwistedGrace();
});