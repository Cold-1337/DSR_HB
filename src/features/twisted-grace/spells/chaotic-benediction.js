const SPELL_NAME = "Chaotic Benediction";

// true = immer DMG erzwingen
const FORCE_ALWAYS_DAMAGE = false;

// Standardformel, falls kein Flag gesetzt ist:
const DEFAULT_EFFECT_FORMULA = "1d8";

export function registerChaoticBenediction() {
  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    try {
      const item = workflow?.item;
      const actor = workflow?.actor;
      if (!item || !actor) return;
      if ((item.name ?? "").trim() !== SPELL_NAME) return;

      await runChaoticBenediction({ workflow, actor, item });
    } catch (err) {
      console.error("DSR_HB | Chaotic Benediction error", err);
    }
  });
}

async function runChaoticBenediction({ workflow, actor, item }) {
  const targets = getTargets(workflow);
  if (!targets.length) {
    await whisperToGM(`DSR-HB | ${SPELL_NAME}: No targets selected.`);
    return;
  }

  const chaosRoll = await (new Roll("1d20")).evaluate({ async: true });

  const effectFormula = item.flags?.DSR_HB?.effectFormula ?? DEFAULT_EFFECT_FORMULA;

  await whisperToGM(
    [
      `DSR-HB | ${SPELL_NAME}`,
      `Caster: ${actor.name}`,
      `Targets: ${targets.map(t => t.name).join(", ")}`,
      `Chaos d20: ${chaosRoll.total}`,
      `Effect Formula: ${effectFormula}`,
      `TEST Force DMG: ${FORCE_ALWAYS_DAMAGE ? "ON" : "OFF"}`
    ].join("\n")
  );

  const d20 = FORCE_ALWAYS_DAMAGE ? 1 : chaosRoll.total;

  // 1–3: DMG
  if (d20 <= 3) {
    const { roll, total } = await rollEffectAmountDetailed({ actor, formula: effectFormula });

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `DSR-HB | ${SPELL_NAME} – DAMAGE (${effectFormula})`,
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });

    await applyDamageToTargets(targets, total);

    return;
  }

  // 4–17: HEAL
  if (d20 <= 17) {
    const { roll, total } = await rollEffectAmountDetailed({ actor, formula: effectFormula });

    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `DSR-HB | ${SPELL_NAME} – HEAL (${effectFormula})`,
      whisper: game.users.filter(u => u.isGM).map(u => u.id)
    });

    await applyHealToTargets(targets, total);

    return;
  }

  // 18–20: GM Entscheidung
  if (game.user.isGM) {
    await openGmDecisionDialog({ actor, targets, d20, effectFormula });
  } else {
    await whisperToGM(`DSR-HB | ${SPELL_NAME}: Result ${d20} => GM decision required (18–20).`);
  }
}

async function openGmDecisionDialog({ actor, targets, d20, effectFormula }) {
  const content = `
    <div>
      <p><strong>Chaotic Benediction (18–20)</strong></p>
      <p>Caster: ${escapeHtml(actor.name)}</p>
      <p>Targets: ${escapeHtml(targets.map(t => t.name).join(", "))}</p>
      <p>Chaos d20: <strong>${d20}</strong></p>
      <p>Effect Formula: <strong>${escapeHtml(effectFormula)}</strong></p>
      <hr/>
      <label>Nebenwirkung (DM wählt):</label>
      <textarea name="sideEffect" rows="3" style="width:100%;"></textarea>
    </div>
  `;

  return new Dialog({
    title: "DSR-HB | Chaotic Benediction",
    content,
    buttons: {
      dmg: {
        label: "DMG auslösen",
        callback: async (html) => {
          const sideEffect = html.find('textarea[name="sideEffect"]').val()?.trim() ?? "";

          const { roll, total } = await rollEffectAmountDetailed({ actor, formula: effectFormula });

          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `DSR-HB | ${SPELL_NAME} – GM chose DAMAGE (${effectFormula})`,
            whisper: game.users.filter(u => u.isGM).map(u => u.id)
          });

          await applyDamageToTargets(targets, total);
        }
      },
      heal: {
        label: "HEAL auslösen",
        callback: async (html) => {
          const sideEffect = html.find('textarea[name="sideEffect"]').val()?.trim() ?? "";

          const { roll, total } = await rollEffectAmountDetailed({ actor, formula: effectFormula });

          await roll.toMessage({
            speaker: ChatMessage.getSpeaker({ actor }),
            flavor: `DSR-HB | ${SPELL_NAME} – GM chose HEAL (${effectFormula})`,
            whisper: game.users.filter(u => u.isGM).map(u => u.id)
          });

          await applyHealToTargets(targets, total);
        }
      }
    },
    default: "heal"
  }).render(true);
}

async function rollEffectAmountDetailed({ actor, formula }) {
  const rollData = actor.getRollData?.() ?? {};
  const roll = await (new Roll(formula, rollData)).evaluate({ async: true });
  const total = Math.max(0, Number(roll.total ?? 0));
  return { roll, total };
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
    await a.update({ "system.attributes.hp.value": Math.min(hp.max, hp.value + heal) });
  }
}

async function applyDamageToTargets(targetTokens, amount) {
  const dmg = Math.max(0, Number(amount ?? 0));
  for (const t of targetTokens) {
    const a = t.actor;
    const hp = a.system?.attributes?.hp;
    if (!hp) continue;
    await a.update({ "system.attributes.hp.value": Math.max(0, hp.value - dmg) });
  }
}

// GM whisper

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