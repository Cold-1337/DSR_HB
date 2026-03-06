import { registerChaoticBenediction } from "./spells/chaotic-benediction.js";

export function registerTwistedGrace() {
  if (!game.settings.get("DSR_HB", "twistedGraceEnabled")) return;
  registerChaoticBenediction();
}
