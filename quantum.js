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
// Matrix-vector product U|psi> for any 2x2 complex matrix.
export function applyMatrix(state,m){return [add(mul(m[0][0],state[0]),mul(m[0][1],state[1])),add(mul(m[1][0],state[0]),mul(m[1][1],state[1]))]}
export function applyGate(state,name){const m=gates[name];if(!m)throw Error('Unsupported gate '+name);return applyMatrix(state,m)}
// A canonical representative removes unobservable global phase.
export function canonical(state){const [a,b]=state;const pivot=abs2(a)>1e-15?a:b;const length=Math.sqrt(abs2(pivot));const conjugate=C(pivot.re/length,-pivot.im/length);return [mul(a,conjugate),mul(b,conjugate)]}
// Floating-point trig leaves residues such as cos(pi/2) = 6.1e-17; snap them to exact zero
// so theta = pi gives exactly |1> and phi = 90 deg or 180 deg gives no spurious components.
const exact=v=>Math.abs(v)<1e-15?0:v;
export function fromAngles(theta,phi){const c=exact(Math.cos(theta/2)),s=exact(Math.sin(theta/2));return [C(c),C(exact(s*exact(Math.cos(phi))),exact(s*exact(Math.sin(phi))))]}
export function bloch(state){const [a,b]=state;return {x:2*(a.re*b.re+a.im*b.im),y:2*(a.re*b.im-a.im*b.re),z:abs2(a)-abs2(b)}}
export function angles(state){const {x,y,z}=bloch(state);return {theta:Math.acos(Math.max(-1,Math.min(1,z))),phi:((Math.atan2(y,x)+2*Math.PI)%(2*Math.PI))}}
export function probabilities(state){return [abs2(state[0]),abs2(state[1])]}
export const arg=a=>Math.atan2(a.im,a.re);
// Wraps an angle into [0, 2pi), snapping values within 1e-12 of 2pi to 0.
const wrapAngle=v=>{let t=v%(2*Math.PI);if(t<0)t+=2*Math.PI;return 2*Math.PI-t<1e-12?0:t};
// |psi> = e^{i gamma} (cos(theta/2)|0> + e^{i phi} sin(theta/2)|1>).
// gamma is the global phase (unobservable); phi is the relative phase (observable, the Bloch azimuth).
// At a pole phi is undefined (phiDefined = false) and reported as 0; gamma is then the phase of the nonzero amplitude.
export function decompose(state){const [a,b]=state,ra=Math.sqrt(abs2(a)),rb=Math.sqrt(abs2(b)),aZero=ra<1e-12,bZero=rb<1e-12;return {gamma:wrapAngle(aZero?arg(b):arg(a)),theta:2*Math.atan2(rb,ra),phi:aZero||bZero?0:wrapAngle(arg(b)-arg(a)),phiDefined:!aZero&&!bZero}}
// Row-by-row working of U|psi>, for step-by-step display: result_i = U_i0 * alpha + U_i1 * beta.
export function matrixVectorSteps(matrix,state){return matrix.map(row=>{const products=[mul(row[0],state[0]),mul(row[1],state[1])];return {entries:row,inputs:state,products,result:add(products[0],products[1])}})}
// Computational-basis measurement. `random` is a uniform sample in [0,1); passing it in keeps this testable.
export function measure(state,random=Math.random()){const outcome=random<probabilities(state)[0]?0:1;return {outcome,state:basisState(outcome)}}
// Inner product <u|v> = conj(u0) v0 + conj(u1) v1.
export function inner(u,v){return add(mul(C(u[0].re,-u[0].im),v[0]),mul(C(u[1].re,-u[1].im),v[1]))}
// For normalized states, |<u|v>| = 1 exactly when v = e^{i gamma} u: the same physical state.
// Returns that factor e^{i gamma} (so v = factor * u), or null when the states differ physically.
export function globalPhaseFactor(u,v,eps=1e-9){const c=inner(u,v);return Math.abs(Math.sqrt(abs2(c))-1)<eps?c:null}
