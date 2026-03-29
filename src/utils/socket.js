const SOCKET_NAME = "module.DSR_HB";

/**
 * Registriert den GM-seitigen Socket-Handler.
 * Muss im "ready"-Hook aufgerufen werden.
 */
export function registerSocket() {
  game.socket.on(SOCKET_NAME, async (data) => {
    // Nur der GM führt die eigentliche Änderung aus
    if (!game.user.isGM) return;

    if (data.action === "applyHp") {
      const actor = await fromUuid(data.actorUuid);
      if (!actor) {
        console.warn(`DSR_HB | Socket: Actor nicht gefunden für UUID ${data.actorUuid}`);
        return;
      }
      await actor.update({ "system.attributes.hp.value": data.value });
    }

    if (data.action === "applyEffect") {
      const actor = await fromUuid(data.actorUuid);
      if (!actor) {
        console.warn(`DSR_HB | Socket: Actor nicht gefunden für UUID ${data.actorUuid}`);
        return;
      }
      await actor.createEmbeddedDocuments("ActiveEffect", [data.effectData]);
    }

    if (data.action === "applyTempHp") {
      const actor = await fromUuid(data.actorUuid);
      if (!actor) {
        console.warn(`DSR_HB | Socket: Actor nicht gefunden für UUID ${data.actorUuid}`);
        return;
      }
      await actor.update({ "system.attributes.hp.temp": data.value });
    }

    if (data.action === "removeEffect") {
      const actor = await fromUuid(data.actorUuid);
      if (!actor) return;
      const effect = actor.effects.find(
        e => e.flags?.DSR_HB?.[data.flagKey] === true
      );
      if (effect) await effect.delete();
    }
  });
}

/**
 * Setzt den HP-Wert eines Actors.
 * GM: direktes update(). Spieler: Anfrage via Socket an GM delegieren.
 */
export async function applyHpViaSocket(actor, value) {
  if (game.user.isGM) {
    await actor.update({ "system.attributes.hp.value": value });
  } else {
    game.socket.emit(SOCKET_NAME, {
      action: "applyHp",
      actorUuid: actor.uuid,
      value
    });
  }
}

/**
 * Setzt die Temporary HP eines Actors.
 * GM: direktes update(). Spieler: Anfrage via Socket an GM delegieren.
 */
export async function applyTempHpViaSocket(actor, value) {
  if (game.user.isGM) {
    await actor.update({ "system.attributes.hp.temp": value });
  } else {
    game.socket.emit(SOCKET_NAME, {
      action: "applyTempHp",
      actorUuid: actor.uuid,
      value
    });
  }
}

/**
 * Wendet einen Active Effect auf einen Actor an.
 * GM: direkt. Spieler: via Socket.
 */
export async function applyEffectViaSocket(actor, effectData) {
  if (game.user.isGM) {
    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  } else {
    game.socket.emit(SOCKET_NAME, {
      action: "applyEffect",
      actorUuid: actor.uuid,
      effectData
    });
  }
}

/**
 * Entfernt einen Active Effect anhand eines DSR_HB-Flag-Keys.
 * GM: direkt. Spieler: via Socket.
 */
export async function removeEffectViaSocket(actor, flagKey) {
  if (game.user.isGM) {
    const effect = actor.effects.find(
      e => e.flags?.DSR_HB?.[flagKey] === true
    );
    if (effect) await effect.delete();
  } else {
    game.socket.emit(SOCKET_NAME, {
      action: "removeEffect",
      actorUuid: actor.uuid,
      flagKey
    });
  }
}
