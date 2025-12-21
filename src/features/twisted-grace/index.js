import { registerChaoticBenedictionHooks } from "./chaotic-benediction.js";

export function registerTwistedGrace() {
  if (!game.settings.get("DSR_HB", "twistedGraceEnabled")) return;
  registerChaoticBenedictionHooks();
}