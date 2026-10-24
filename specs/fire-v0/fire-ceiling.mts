import { pv } from '/tmp/claude-0/-home-user-3dproject/4db7e567-5529-5795-9b08-c7b02441b831/scratchpad/pr73/src/science/params.ts';
const dry = pv('woodLhvDry'), L = 2.256e6;
for (const w of [0.12, 0.2, 0.28]) {
  const lhv = (1 - w) * dry - w * L; // J/kg as-is (ash ignored)
  for (const [name, burn, frac, ua] of [['焚き火(本番)', 3, 0.2, 8], ['焚き火(土器検査)', 3, 0.2, 30]] as const) {
    const P = (burn / 3600) * lhv * frac;
    console.log(name, `water ${w*100}%`, `chamber ${(P/1000).toFixed(2)} kW`, `ceiling ΔT ${(P/ua).toFixed(0)} K`);
  }
}
console.log('woodLhvDry', dry);
