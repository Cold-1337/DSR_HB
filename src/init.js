import { registerDsrHbSettings } from "./settings.js";
import { registerTwistedGrace } from "./features/twisted-grace/index.js";

console.log("DSR_HB | init loaded");

Hooks.once("init", () => {
  registerDsrHbSettings();
});

Hooks.once("ready", () => {
  console.log("DSR_HB | ready");
  registerTwistedGrace();
});
