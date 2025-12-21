export async function defaultDmgCalc({ actor, item, chaosD20, saveRoll, saveSuccess }) {
  const base = Number(saveRoll?.total ?? 0);

  return saveSuccess ? 0 : Math.max(1, base);
}