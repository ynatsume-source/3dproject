import { woodEmc } from './pr73/src/science/step/firewood.ts';
for (const T of [20, 25, 28]) console.log(T, [0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95].map((h) => `${h * 100}%:${(woodEmc(T, h)! * 100).toFixed(1)}`).join(' '));
