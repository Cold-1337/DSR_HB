import { applyHpViaSocket } from "../../../utils/socket.js";
import { resolveHealAmount } from "./staggering-grace.js";

// Homebrew-Name für das Foundry-Item (muss exakt übereinstimmen)
const SPELL_NAME = "Scattered Grace";

// true = immer DMG erzwingen (Debug)
const FORCE_ALWAYS_DAMAGE = false;

// MCW-Basis: 3d8, skaliert ab Level 5
const DEFAULT_EFFECT_FORMULA = "3d8";
const BASE_SPELL_LEVEL = 5;

export function registerScatteredGrace() {
  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    try {
      const item = workflow?.item;
      const actor = workflow?.actor;
      if (!item || !actor) return;
      if ((item.name ?? "").trim() !== SPELL_NAME) return;

      await runScatteredGrace({ workflow, actor, item });
    } catch (err) {
      console.error("DSR_HB | Scattered Grace error", err);
    }
  });
}

async function runScatteredGrace({ workflow, actor, item }) {
  const targets = getTargets(workflow);
  if (!targets.length) {
    await whisperToGM(`DSR-HB | ${SPELL_NAME}: No targets selected.`);
    return;
  }

  const chaosRoll = await new Roll("1d20").evaluate();

  // Upcasting: +1d8 pro Slot-Level über 5 (wie Standard-MCW)
  const castLevel = workflow.spellLevel ?? BASE_SPELL_LEVEL;
  const upcastLevels = Math.max(0, castLevel - BASE_SPELL_LEVEL);
  const scaledFormula = upcastLevels > 0
    ? DEFAULT_EFFECT_FORMULA.replace(/^(\d+)(d\d+)/, (_, count, die) => `${Number(count) + upcastLevels}${die}`)
    : DEFAULT_EFFECT_FORMULA;

  await whisperToGM(
    [
      `DSR-HB | ${SPELL_NAME}`,
      `Caster: ${actor.name}`,
      `Targets (${targets.length}): ${targets.map(t => t.name).join(", ")}`,
      `Chaos d20: ${chaosRoll.total}`,
      `Effect Formula: ${scaledFormula}${upcastLevels > 0 ? ` (upcast +${upcastLevels})` : ""}`
    ].join("\n")
  );

  const d20 = FORCE_ALWAYS_DAMAGE ? 1 : chaosRoll.total;

  // 1–5: Nekrotischer Schaden an ALLEN Zielen (gleicher Betrag)
  if (d20 <= 5) {
    const { roll, total } = await rollEffectAmount({ actor, formula: scaledFormula });

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `DSR-HB | ${SPELL_NAME} – SCATTERED DAMAGE (${scaledFormula}) an ${targets.length} Zielen`,
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });

    await applyDamageToTargets(targets, total);
    return;
  }

  // 6–17: Normale Heilung an ALLEN Zielen (gleicher Betrag)
  if (d20 <= 17) {
    const { roll, total, min, max } = await rollEffectAmount({ actor, formula: scaledFormula });

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `DSR-HB | ${SPELL_NAME} – HEAL (${scaledFormula}) an ${targets.length} Zielen`,
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });

    const healAmount = await resolveHealAmount({ targets, normal: total, min, max });
    await applyHealToTargets(targets, healAmount);
    return;
  }

  // 18–20: Vollheilung an allen + GM wählt ein Ziel für Hitogami-Bonus
  if (game.user.isGM) {
    await openGmDecisionDialog({ actor, targets, d20, effectFormula: scaledFormula });
  } else {
    // Heilung läuft sofort durch – GM-Dialog kümmert sich um den Bonus
    const { roll, total, min, max } = await rollEffectAmount({ actor, formula: scaledFormula });

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `DSR-HB | ${SPELL_NAME} – HEAL (${scaledFormula}) an ${targets.length} Zielen`,
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });

    const healAmount = await resolveHealAmount({ targets, normal: total, min, max });
    await applyHealToTargets(targets, healAmount);
    await whisperToGM(`DSR-HB | ${SPELL_NAME}: Result ${d20} => GM decision required (18–20). Heilung wurde bereits angewendet.`);
  }
}

async function openGmDecisionDialog({ actor, targets, d20, effectFormula }) {
  // Heilung sofort anwenden – Bonus wird im Dialog entschieden
  const { roll, total, min, max } = await rollEffectAmount({ actor, formula: effectFormula });

  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `DSR-HB | ${SPELL_NAME} – SCATTERED GRACE HEAL (${effectFormula}) an ${targets.length} Zielen`,
    whisper: game.users.filter(u => u.isGM).map(u => u.id)
  });

  const healAmount = await resolveHealAmount({ targets, normal: total, min, max });
  await applyHealToTargets(targets, healAmount);

  // Dropdown für Zielauswahl
  const targetOptions = targets
    .map((t, i) => `<option value="${i}">${escapeHtml(t.name)}</option>`)
    .join("");

  const content = `
    <div>
      <p><strong>Scattered Grace (18–20)</strong></p>
      <p>Caster: ${escapeHtml(actor.name)}</p>
      <p>Alle Ziele wurden geheilt (${escapeHtml(effectFormula)}).</p>
      <p>Chaos d20: <strong>${d20}</strong></p>
      <hr/>
      <p><strong>Hitogami wählt ein Ziel für einen Bonus-Effekt:</strong></p>
      <label>Ziel:</label>
      <select name="bonusTarget" style="width:100%; margin-bottom:8px;">
        ${targetOptions}
      </select>
      <label>Hitogami-Effekt (DM beschreibt):</label>
      <textarea name="sideEffect" rows="3" style="width:100%;"></textarea>
    </div>
  `;

  return new Dialog({
    title: "DSR-HB | Scattered Grace",
    content,
    buttons: {
      confirm: {
        label: "Effekt anwenden",
        callback: async (html) => {
          const targetIndex = Number(html.find('select[name="bonusTarget"]').val() ?? 0);
          const sideEffect = html.find('textarea[name="sideEffect"]').val()?.trim() ?? "";
          const chosenTarget = targets[targetIndex];

          if (sideEffect && chosenTarget) {
            await whisperToGM(
              `DSR-HB | ${SPELL_NAME} – Hitogami-Bonus\nZiel: ${chosenTarget.name}\nEffekt: ${sideEffect}`
            );
          }
        }
      },
      skip: {
        label: "Kein Bonus",
        callback: () => {}
      }
    },
    default: "confirm"
  }).render(true);
}

async function rollEffectAmount({ actor, formula }) {
  const rollData = actor.getRollData?.() ?? {};
  const roll = await new Roll(formula, rollData).evaluate();
  const total = Math.max(0, Number(roll.total ?? 0));
  const maxRoll = await new Roll(formula, rollData).evaluate({ maximize: true });
  const minRoll = await new Roll(formula, rollData).evaluate({ minimize: true });
  return {
    roll,
    total,
    min: Math.max(0, Number(minRoll.total ?? 0)),
    max: Math.max(0, Number(maxRoll.total ?? 0))
  };
}

// Targets / HP Apply

function getTargets(workflow) {
  const set = workflow?.targets;
  if (!set) return [];
  return Array.from(set).filter(t => t?.actor);
}

async function applyHealToTargets(targetTokens, amount) {
  const heal = Math.max(0, Number(amount ?? 0));
  for (const t of targetTokens) {
    const a = t.actor;
    const hp = a.system?.attributes?.hp;
    if (!hp) continue;
    await applyHpViaSocket(a, Math.min(hp.max, hp.value + heal));
  }
}

async function applyDamageToTargets(targetTokens, amount) {
  const dmg = Math.max(0, Number(amount ?? 0));
  for (const t of targetTokens) {
    const a = t.actor;
    const hp = a.system?.attributes?.hp;
    if (!hp) continue;
    await applyHpViaSocket(a, Math.max(0, hp.value - dmg));
  }
}

// GM Whisper

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
