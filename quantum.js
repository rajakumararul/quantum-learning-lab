// Pure state-vector operations. Convention |psi> = alpha|0> + beta|1>.
export const C = (re,im=0)=>({re,im});
export const add=(a,b)=>C(a.re+b.re,a.im+b.im);
export const mul=(a,b)=>C(a.re*b.re-a.im*b.im,a.re*b.im+a.im*b.re);
export const scale=(a,s)=>C(a.re*s,a.im*s);
export const abs2=a=>a.re*a.re+a.im*a.im;
export const initial=()=>[C(1),C(0)];
// Exact computational-basis states |0> and |1>.
export const basisState=k=>k===0?[C(1),C(0)]:[C(0),C(1)];
const SQ=Math.SQRT1_2;
export const gates={
 X:[[C(0),C(1)],[C(1),C(0)]],
 Y:[[C(0),C(0,-1)],[C(0,1),C(0)]],
 Z:[[C(1),C(0)],[C(0),C(-1)]],
 H:[[C(SQ),C(SQ)],[C(SQ),C(-SQ)]],
 S:[[C(1),C(0)],[C(0),C(0,1)]],
 T:[[C(1),C(0)],[C(0),C(SQ,SQ)]]
};
export function applyGate(state,name){const m=gates[name];if(!m)throw Error('Unsupported gate '+name);return [add(mul(m[0][0],state[0]),mul(m[0][1],state[1])),add(mul(m[1][0],state[0]),mul(m[1][1],state[1]))]}
// A canonical representative removes unobservable global phase.
export function canonical(state){const [a,b]=state;const pivot=abs2(a)>1e-15?a:b;const length=Math.sqrt(abs2(pivot));const conjugate=C(pivot.re/length,-pivot.im/length);return [mul(a,conjugate),mul(b,conjugate)]}
// Floating-point trig leaves residues such as cos(pi/2) = 6.1e-17; snap them to exact zero
// so theta = pi gives exactly |1> and phi = 90 deg or 180 deg gives no spurious components.
const exact=v=>Math.abs(v)<1e-15?0:v;
export function fromAngles(theta,phi){const c=exact(Math.cos(theta/2)),s=exact(Math.sin(theta/2));return [C(c),C(exact(s*exact(Math.cos(phi))),exact(s*exact(Math.sin(phi))))]}
export function bloch(state){const [a,b]=state;return {x:2*(a.re*b.re+a.im*b.im),y:2*(a.re*b.im-a.im*b.re),z:abs2(a)-abs2(b)}}
export function angles(state){const {x,y,z}=bloch(state);return {theta:Math.acos(Math.max(-1,Math.min(1,z))),phi:((Math.atan2(y,x)+2*Math.PI)%(2*Math.PI))}}
export function probabilities(state){return [abs2(state[0]),abs2(state[1])]}
// Computational-basis measurement. `random` is a uniform sample in [0,1); passing it in keeps this testable.
export function measure(state,random=Math.random()){const outcome=random<probabilities(state)[0]?0:1;return {outcome,state:basisState(outcome)}}
