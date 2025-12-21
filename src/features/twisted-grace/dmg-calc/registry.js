import { defaultDmgCalc } from "./default.js";

const REGISTRY = new Map([
  ["default", defaultDmgCalc]
]);

export function registerDmgCalc(id, fn) {
  REGISTRY.set(id, fn);
}

export function getDmgCalc() {
  const id = String(game.settings.get("DSR_HB", "chaoticBenedictionDmgCalc") ?? "default");
  return REGISTRY.get(id) ?? defaultDmgCalc;
}