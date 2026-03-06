import { registerChaoticBenediction } from "./spells/chaotic-benediction.js";
import { registerScatteredGrace } from "./spells/scattered-grace.js";

export function registerTwistedGrace() {
  if (!game.settings.get("DSR_HB", "twistedGraceEnabled")) return;
  registerChaoticBenediction();
  registerScatteredGrace();
}
