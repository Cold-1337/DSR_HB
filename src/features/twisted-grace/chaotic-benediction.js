import { getDmgCalc } from "./dmg-calc/registry.js";

const SPELL_NAME = "Chaotic Benediction";

export function registerChaoticBenedictionHooks() {
  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    try {
      await onWorkflowRollComplete(workflow);
    } catch (err) {
      console.error("DSR-HB | Chaotic Benediction error:", err);
    }
  });
}

async function onWorkflowRollComplete(workflow) {
  const item = workflow?.item;
  const actor = workflow?.actor;
  if (!item || !actor) return;
  if (item.system?.actionType !== "heal") return;

  if ((item.name ?? "").trim() !== SPELL_NAME) return;

  // 3) Zusätzlicher d20 Wurf
  const chaosRoll = await (new Roll("1d20")).evaluate({ async: true });

  const wisMod = Number(actor.system?.abilities?.wis?.mod ?? 0);
  const saveRoll = await (new Roll("1d20 + @wis", { wis: wisMod })).evaluate({ async: true });

  const dc = Number(game.settings.get("DSR_HB", "chaoticBenedictionSaveDC") ?? 15);
  const saveSuccess = saveRoll.total >= dc;

  // 5) DM Info (Roll + Save-Ergebnis)
  await whisperToGmIfEnabled(buildGmInfoMsg(actor, item, chaosRoll.total, saveRoll.total, dc, saveSuccess));

  const d20 = chaosRoll.total;

  if (d20 >= 1 && d20 <= 3) {
    await applyDmgOutcome({ workflow, actor, item, chaosD20: d20, saveRoll, saveSuccess });
    return;
  }

  if (d20 >= 4 && d20 <= 17) {
    await applyHealOutcome({ workflow, actor, item, chaosD20: d20 });
    return;
  }

  // 18–20: Popup für GM
  await openGmDecisionDialog({ workflow, actor, item, chaosD20: d20, saveRoll, saveSuccess });
}

async function applyDmgOutcome({ workflow, actor, item, chaosD20, saveRoll, saveSuccess }) {
  const dmgCalc = getDmgCalc();
  const dmgValue = await dmgCalc({ actor, item, chaosD20, saveRoll, saveSuccess });

  await whisperToGmIfEnabled(`DSR-HB | ${SPELL_NAME}: Ergebnis ${chaosD20} ⇒ DMG ${dmgValue}`);
}

async function applyHealOutcome({ workflow, actor, item, chaosD20 }) {
  await whisperToGmIfEnabled(`DSR-HB | ${SPELL_NAME}: Ergebnis ${chaosD20} ⇒ HEAL (normaler Heal des Spells)`);
}

async function openGmDecisionDialog({ workflow, actor, item, chaosD20, saveRoll, saveSuccess }) {
  if (!game.user.isGM) return;

  const html = await renderTemplate("modules/DSR_HB/src/ui/dialogs/chaotic-benediction-gm.hbs", {
    spellName: item.name,
    casterName: actor.name,
    chaosD20,
    saveTotal: saveRoll.total,
    saveSuccess
  });

  return new Dialog({
    title: `DSR-HB | ${SPELL_NAME} (18–20)`,
    content: html,
    buttons: {
      dmg: {
        label: "DMG auslösen",
        callback: async (dlgHtml) => {
          const sideEffect = dlgHtml.find('textarea[name="sideEffect"]').val()?.trim() ?? "";
          await whisperToGmIfEnabled(`DSR-HB | ${SPELL_NAME}: GM wählt DMG. Nebenwirkung: ${sideEffect || "—"}`);

          const dmgCalc = getDmgCalc();
          const dmgValue = await dmgCalc({ actor, item, chaosD20, saveRoll, saveSuccess });
          await whisperToGmIfEnabled(`DSR-HB | ${SPELL_NAME}: DMG Wert = ${dmgValue}`);
        }
      },
      heal: {
        label: "HEAL auslösen",
        callback: async (dlgHtml) => {
          const sideEffect = dlgHtml.find('textarea[name="sideEffect"]').val()?.trim() ?? "";
          await whisperToGmIfEnabled(`DSR-HB | ${SPELL_NAME}: GM wählt HEAL. Nebenwirkung: ${sideEffect || "—"}`);
        }
      }
    },
    default: "heal"
  }).render(true);
}

function buildGmInfoMsg(actor, item, chaosD20, saveTotal, dc, saveSuccess) {
  return [
    `DSR-HB | ${SPELL_NAME}`,
    `Caster: ${actor.name}`,
    `Spell: ${item.name}`,
    `Extra d20: ${chaosD20}`,
    `WIS-Check: ${saveTotal} vs DC ${dc} ⇒ ${saveSuccess ? "SUCCESS" : "FAIL"}`
  ].join("\n");
}

async function whisperToGmIfEnabled(content) {
  if (!game.settings.get("DSR_HB", "gmWhisper")) return;

  const gmUsers = game.users.filter(u => u.isGM && u.active);
  if (!gmUsers.length) return;

  await ChatMessage.create({
    content: `<pre>${escapeHtml(content)}</pre>`,
    whisper: gmUsers.map(u => u.id)
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}