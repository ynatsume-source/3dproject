/** Explicit integer approximation: Q128, 1024 linear half-life segments.
 * Tables are generated with integer square roots only; no floating exponent/root. */
export const INTEGER_HALF_LIFE_POLICY_ID='owner-assumption/integer-half-life/2026-10-15/v1' as const;
const Q=1n<<128n, SEGMENTS=1024n;
export function integerSqrt(n:bigint):bigint {
 if(typeof n!=='bigint'||n<0n)throw Error('integer sqrt: invalid-input');
 if(n<2n)return n;
 let x=1n<<((BigInt(n.toString(2).length)+1n)/2n);
 for(;;){const y=(x+n/x)/2n;if(y>=x)return x;x=y;}
}
const HALF_TABLE:readonly bigint[]=(()=>{
 let root=Q/2n;for(let j=0;j<10;j++)root=integerSqrt(root*Q);
 const t=[Q];for(let i=1;i<1024;i++)t.push(t[i-1]*root/Q);t.push(Q/2n);
 return Object.freeze(t);
})();
function powInteger(base:bigint,n:number):bigint {
 let result=1n,k=BigInt(n);
 while(k>0n){if(k%2n)result*=base;k/=2n;if(k)base*=base;}return result;
}
export function integerDecayStrength(base:number,elapsed:bigint,halfLife:bigint,abrasions:number):number {
 if(!Number.isSafeInteger(base)||base<0||typeof elapsed!=='bigint'||elapsed<0n||typeof halfLife!=='bigint'||halfLife<=0n||!Number.isSafeInteger(abrasions)||abrasions<0)throw Error('integer decay: invalid-input');
 if(abrasions>=4096)return 0;
 const whole=elapsed/halfLife;if(whole>=54n)return 0;
 const pos=(elapsed%halfLife)*SEGMENTS,k=Number(pos/halfLife),rem=pos%halfLife;
 const factor=(HALF_TABLE[k]*(halfLife-rem)+HALF_TABLE[k+1]*rem)/halfLife;
 return Number(BigInt(base)*factor*powInteger(99n,abrasions)/(Q*(1n<<whole)*powInteger(100n,abrasions)));
}
