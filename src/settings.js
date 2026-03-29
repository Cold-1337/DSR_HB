export function registerDsrHbSettings() {
  game.settings.register("DSR_HB", "twistedGraceEnabled", {
    name: "DSR-HB: Twisted Grace aktiv",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("DSR_HB", "chaoticBenedictionSaveDC", {
    name: "DSR-HB: Chaotic Benediction DC",
    scope: "world",
    config: true,
    type: Number,
    default: 15
  });

  game.settings.register("DSR_HB", "gmWhisper", {
    name: "DSR-HB: Infos an GM als Whisper",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(“DSR_HB”, “hitogamiPactEnabled”, {
    name: “DSR-HB: Hitogami Pact aktiv”,
    scope: “world”,
    config: true,
    type: Boolean,
    default: true
  });

  // Optional: “Registry-Key” für austauschbare Damage-Funktion
  game.settings.register("DSR_HB", "chaoticBenedictionDmgCalc", {
    name: "DSR-HB: Damage Calc ID (interchangeable)",
    scope: "world",
    config: true,
    type: String,
    default: "default"
  });
}