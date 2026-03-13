import { applyEffectViaSocket, removeEffectViaSocket } from "../../../utils/socket.js";

const SPELL_NAME = "Staggering Grace";
export const STAGGERING_GRACE_FLAG = "staggeringGrace";

export function registerStaggeringGrace() {
  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    try {
      const item = workflow?.item;
      const actor = workflow?.actor;
      if (!item || !actor) return;
      if ((item.name ?? "").trim() !== SPELL_NAME) return;

      await runStaggeringGrace({ workflow, actor, item });
    } catch (err) {
      console.error("DSR_HB | Staggering Grace error", err);
    }
  });
}

async function runStaggeringGrace({ workflow, actor, item }) {
  const targets = getTargets(workflow);
  if (!targets.length) {
    await whisperToGM(`DSR-HB | ${SPELL_NAME}: No targets selected.`);
    return;
  }

  const effectData = buildEffect(item);

  for (const t of targets) {
    const a = t.actor;
    // Bestehenden Effekt entfernen falls vorhanden (Re-Cast)
    await removeEffectViaSocket(a, STAGGERING_GRACE_FLAG);
    await applyEffectViaSocket(a, effectData);
  }

  await whisperToGM(
    [
      `DSR-HB | ${SPELL_NAME}`,
      `Caster: ${actor.name}`,
      `Targets (${targets.length}): ${targets.map(t => t.name).join(", ")}`,
      `Effekt aktiv – Vorteil auf WIS-Saves und Todesrettungswürfe.`,
      `Heilmodifikator (d4) greift bei Chaotic Benediction und Scattered Grace.`
    ].join("\n")
  );
}

function buildEffect(item) {
  return {
    name: "Staggering Grace",
    img: item.img ?? "icons/magic/holy/prayer-hands-glowing-yellow.webp",
    origin: item.uuid,
    duration: { seconds: 60, startTime: game.time.worldTime },
    flags: { DSR_HB: { [STAGGERING_GRACE_FLAG]: true } },
    changes: [
      // Vorteil auf Weisheits-Rettungswürfe (midi-qol)
      { key: "flags.midi-qol.advantage.ability.save.wis", mode: 5, value: "1", priority: 20 },
      // Vorteil auf Todesrettungswürfe (midi-qol)
      // Hinweis: Flag-Key ggf. in Foundry/midi-qol prüfen
      { key: "flags.midi-qol.advantage.deathSave", mode: 5, value: "1", priority: 20 }
    ]
  };
}

// --- Exports für Chaotic Benediction und Scattered Grace ---

/**
 * Prüft ob ein Actor aktuell unter Staggering Grace steht.
 */
export function hasStaggeringGrace(actor) {
  return actor.effects.some(
    e => !e.disabled && e.flags?.DSR_HB?.[STAGGERING_GRACE_FLAG] === true
  );
}

/**
 * Gibt den finalen Heilbetrag zurück – ggf. durch Staggering Grace modifiziert.
 * Wenn kein Ziel unter Staggering Grace steht, wird `normal` zurückgegeben.
 *
 * @param {{ targets: Token[], normal: number, min: number, max: number }} opts
 */
export async function resolveHealAmount({ targets, normal, min, max }) {
  const anyHasSG = targets.some(t => hasStaggeringGrace(t.actor));
  if (!anyHasSG) return normal;

  const d4 = await new Roll("1d4").evaluate();
  const result = d4.total;

  let finalAmount;
  let label;
  if (result === 1)      { finalAmount = min;    label = "Minimum"; }
  else if (result <= 3)  { finalAmount = normal;  label = "Normal";  }
  else                   { finalAmount = max;     label = "Maximum"; }

  await whisperToGM(
    `DSR-HB | Staggering Grace – Heilmodifikator\nd4: ${result} → ${label} (${finalAmount})`
  );

  return finalAmount;
}

// --- Helpers ---

function getTargets(workflow) {
  const set = workflow?.targets;
  if (!set) return [];
  return Array.from(set).filter(t => t?.actor);
}

async function whisperToGM(text) {
  const whisperEnabled = game.settings.get("DSR_HB", "gmWhisper");
  if (whisperEnabled === false) return;

  const gms = game.users.filter(u => u.isGM && u.active);
  if (!gms.length) return;

  await ChatMessage.create({
    content: `<pre>${escapeHtml(text)}</pre>`,
    whisper: gms.map(u => u.id)
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
