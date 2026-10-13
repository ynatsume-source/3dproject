// Read-only diagnostic boundary; deliberately not imported by the application.
// Accepts either a serialized residents save or the live residents debug object.
export function readFirewoodState(source, renderedFire = null) {
  const { lab, village } = source;
  const lots = Object.values(lab.lots).filter(l => l.materialId === 'firewood' && l.location === 'shelf');
  const shelfMg = lots.reduce((n, l) => n + l.amount.value, 0);
  const active = (id) => village.labRuns.map(x => lab.runs[x.runId])
    .find(r => r?.processId === id && ['starting', 'running', 'needs-input'].includes(r.status));
  const firing = active('p13y_pot_pit_fire'), boiling = active('p31x_coconut_oil_boil');
  return {
    shelfMg, shelfKg: shelfMg / 1e6,
    roofExists: !!lab.equipment['eq:firewood_stack'],
    logModelLimit: 15,
    visibleLogModels: lab.equipment['eq:firewood_stack'] ? Math.min(15, Math.ceil(shelfMg / 3e6)) : 0,
    // Reserved lots remain physically on the shelf. No reservation visual is implied.
    lots: lots.map(l => ({ id: l.lotId, mg: l.amount.value, waterPpm: l.quality?.water_ppm ?? null })),
    felled: (village.felled ?? []).filter(f => Math.hypot(f.x - 61, f.z + 145) <= 25)
      .map(f => ({ x: f.x, z: f.z, kind: f.kind, height: f.h, at: f.at })),
    // Legacy saplings use trees[] in a save; these are separate from forest felled[].
    saplingDown: source.trees ? [...source.trees] : null,
    firing: firing ? { id: firing.runId, status: firing.status, kilnC: firing.state?.data?.kilnC ?? 30 } : null,
    boiling: !!boiling, heapVisible: !!firing, boilVisible: !!boiling && !firing,
    renderedFire, // U.uFire.w is rendered intensity, not fuel mass or a consumed-wood counter.
  };
}
