import { registerChaoticBenediction } from "./spells/chaotic-benediction.js";
import { registerScatteredGrace } from "./spells/scattered-grace.js";
import { registerStaggeringGrace } from "./spells/staggering-grace.js";

export function registerTwistedGrace() {
  if (!game.settings.get("DSR_HB", "twistedGraceEnabled")) return;
  registerChaoticBenediction();
  registerScatteredGrace();
  registerStaggeringGrace();
}
