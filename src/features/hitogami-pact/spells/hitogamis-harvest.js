import { applyTempHpViaSocket } from "../../../utils/socket.js";

const FEATURE_NAME = "Hitogamis Harvest";

export function registerHitogamisHarvest() {
  Hooks.on("midi-qol.RollComplete", async (workflow) => {
    try {
      const actor = workflow?.actor;
      if (!actor) return;

      // Nur der kontrollierende Spieler handelt – GM nur als Fallback wenn kein Spieler online
      const nonGmOwnerOnline = game.users.some(
        u => !u.isGM && u.active && actor.testUserPermission(u, "OWNER")
      );
      if (game.user.isGM && nonGmOwnerOnline) return;
      if (!actor.isOwner) return;

      // Actor muss das Feature besitzen
      const hasFeature = actor.items.some(i => (i.name ?? "").trim() === FEATURE_NAME);
      if (!hasFeature) return;

      // Schaden muss angewendet worden sein
      if (!workflow.damageTotal || workflow.damageTotal <= 0) return;

      // Mindestens ein Ziel muss auf 0 HP reduziert worden sein
      const targets = workflow.targets ? Array.from(workflow.targets) : [];
      const killed = targets.filter(t => (t.actor?.system?.attributes?.hp?.value ?? 1) === 0);
      if (!killed.length) return;

      await runHitogamisHarvest({ actor });
    } catch (err) {
      console.error("DSR_HB | Hitogamis Harvest error", err);
    }
  });
}

async function runHitogamisHarvest({ actor }) {
  const wisMod = actor.system?.abilities?.wis?.mod ?? 0;
  const warlockLevel = getWarlockLevel(actor);
  const amount = wisMod + warlockLevel;

  if (amount <= 0) return;

  const casterToken = getCasterToken(actor);
  const allies = getAlliesInRange(casterToken, 30);

  // Optionen: Caster selbst + Allies innerhalb 30 ft
  const options = [
    { uuid: actor.uuid, name: `${actor.name} (Du)` },
    ...allies.map(t => ({ uuid: t.actor.uuid, name: t.name }))
  ];

  await openHarvestDialog({ actor, options, amount });
}

async function openHarvestDialog({ actor, options, amount }) {
  const optionsHtml = options
    .map(o => `<option value="${escapeHtml(o.uuid)}">${escapeHtml(o.name)}</option>`)
    .join("");

  const content = `
    <div>
      <p><strong>Hitogamis Harvest</strong></p>
      <p>Wähle ein Ziel für <strong>${amount} Temporary HP</strong>:</p>
      <select name="target" style="width:100%; margin-top:4px;">${optionsHtml}</select>
    </div>
  `;

  return new Dialog({
    title: "DSR-HB | Hitogamis Harvest",
    content,
    buttons: {
      confirm: {
        label: "Bestätigen",
        callback: async (html) => {
          const targetUuid = html.find('select[name="target"]').val();
          const target = await fromUuid(targetUuid);
          if (!target) return;

          // Nicht stacken – nur anwenden wenn höher als vorhandene TempHP
          const existing = target.system?.attributes?.hp?.temp ?? 0;
          if (amount <= existing) {
            await whisperToGM(
              `DSR-HB | ${FEATURE_NAME}: ${target.name} hat bereits ${existing} TempHP – kein Update.`
            );
            return;
          }

          await applyTempHpViaSocket(target, amount);

          await ChatMessage.create({
            content: `<strong>Hitogamis Harvest:</strong> ${escapeHtml(target.name)} erhält ${amount} Temporary HP.`,
            speaker: ChatMessage.getSpeaker({ actor })
          });
        }
      }
    },
    default: "confirm"
  }).render(true);
}

// --- Hilfsfunktionen ---

function getWarlockLevel(actor) {
  const warlockClass = actor.items.find(
    i => i.type === "class" && (i.name ?? "").toLowerCase() === "warlock"
  );
  return warlockClass?.system?.levels ?? 1;
}

function getCasterToken(actor) {
  return canvas.tokens?.placeables?.find(t => t.actor?.uuid === actor.uuid) ?? null;
}

function getAlliesInRange(casterToken, rangeFt) {
  if (!casterToken) return [];

  return canvas.tokens.placeables.filter(t => {
    if (t.id === casterToken.id) return false;
    if (!t.actor) return false;
    if (t.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) return false;
    return getDistanceFt(casterToken, t) <= rangeFt;
  });
}

function getDistanceFt(tokenA, tokenB) {
  try {
    const origin = tokenA.center ?? { x: tokenA.x, y: tokenA.y };
    const dest = tokenB.center ?? { x: tokenB.x, y: tokenB.y };
    return canvas.grid.measurePath([origin, dest])?.distance ?? Infinity;
  } catch {
    // Fallback: Pixel-basiert
    const dx = (tokenA.x ?? 0) - (tokenB.x ?? 0);
    const dy = (tokenA.y ?? 0) - (tokenB.y ?? 0);
    const pixels = Math.sqrt(dx * dx + dy * dy);
    return (pixels / (canvas.dimensions?.size ?? 100)) * (canvas.dimensions?.distance ?? 5);
  }
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
