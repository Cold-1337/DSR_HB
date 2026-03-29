import { registerHitogamisHarvest } from "./spells/hitogamis-harvest.js";

export function registerHitogamiPact() {
  if (!game.settings.get("DSR_HB", "hitogamiPactEnabled")) return;
  registerHitogamisHarvest();
}
