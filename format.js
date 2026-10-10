// Display formatting for amplitudes. Values are shown to 3 decimals; a value is
// treated as zero exactly when it rounds to 0.000, so "-0.000" is never shown.
// Negative signs use the typographic minus (U+2212) consistently.
export const MINUS='−';
const DIGITS=3;
const roundsToZero=v=>Number(Math.abs(v).toFixed(DIGITS))===0;
export function formatReal(v){const text=Math.abs(v).toFixed(DIGITS);return v<0&&!roundsToZero(v)?MINUS+text:text}
export function formatComplex(c){const reZero=roundsToZero(c.re),imZero=roundsToZero(c.im);if(imZero)return formatReal(reZero?0:c.re);if(reZero)return `${formatReal(c.im)}i`;return `(${formatReal(c.re)} ${c.im<0?MINUS:'+'} ${Math.abs(c.im).toFixed(DIGITS)}i)`}
// Joins two formatted terms, folding a leading minus on the second into the operator: "a − b" rather than "a + −b".
const joinSigned=(first,second)=>{const negative=second.startsWith(MINUS);return `${first} ${negative?MINUS:'+'} ${negative?second.slice(1):second}`};
export function formatSum(a,b){return joinSigned(formatComplex(a),formatComplex(b))}
export function formatKet(a,b){return joinSigned(`${formatComplex(a)} |0⟩`,`${formatComplex(b)} |1⟩`)}
// Writes |psi> = a|0> + b|1>, folding a leading minus on b into the operator: "0.707 |0⟩ − 0.707 |1⟩".
export function formatStateEquation(a,b){return `|ψ⟩ = ${formatKet(a,b)}`}
// Angles: degrees rounded to 0.01 with trailing zeros dropped; radians as a multiple of pi when exact.
export function formatDegrees(rad){const d=Math.round(rad*180/Math.PI*100)/100;return `${d===0?0:d}°`.replace('-',MINUS)}
const PI_DENOMINATORS=[1,2,3,4,6,8,12];
export function formatRadians(rad){if(Math.abs(rad)<1e-12)return '0';for(const d of PI_DENOMINATORS){const n=rad*d/Math.PI,k=Math.round(n);if(Math.abs(n-k)<1e-9){if(k===0)return '0';const numerator=k===1?'π':k===-1?`${MINUS}π`:`${k}π`.replace('-',MINUS);return d===1?numerator:`${numerator}/${d}`}}return formatReal(rad)}
export function formatAngle(rad){const exact=formatRadians(rad),decimal=formatReal(rad);if(exact==='0')return `${formatDegrees(rad)} = 0 rad`;return exact===decimal?`${formatDegrees(rad)} = ${decimal} rad`:`${formatDegrees(rad)} = ${exact} rad ≈ ${decimal}`}
// Rotation labels for the circuit and history: "Rx(90°)", and "Rx(π/2)" or "Rx(0.017 rad)".
export function formatRotation(gate,theta){return `${gate}(${formatDegrees(theta)})`}
export function formatRotationRadians(gate,theta){const exact=formatRadians(theta);return `${gate}(${exact===formatReal(theta)?`${exact} rad`:exact})`}
// A unit-modulus factor e^{iγ}, written exactly when γ is a simple multiple of π: "1", "−1", "i", "e^{iπ/4}".
export function formatPhaseFactor(c){const g=Math.atan2(c.im,c.re),r=formatRadians(g);if(r==='0')return '1';if(r==='π'||r===`${MINUS}π`)return `${MINUS}1`;if(r==='π/2')return 'i';if(r===`${MINUS}π/2`)return `${MINUS}i`;return `e^{${r.startsWith(MINUS)?MINUS:''}i·${r.replace(MINUS,'')}}`}
