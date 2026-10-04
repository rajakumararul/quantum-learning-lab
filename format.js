// Display formatting for amplitudes. Values are shown to 3 decimals; a value is
// treated as zero exactly when it rounds to 0.000, so "-0.000" is never shown.
// Negative signs use the typographic minus (U+2212) consistently.
export const MINUS='−';
const DIGITS=3;
const roundsToZero=v=>Number(Math.abs(v).toFixed(DIGITS))===0;
export function formatReal(v){const text=Math.abs(v).toFixed(DIGITS);return v<0&&!roundsToZero(v)?MINUS+text:text}
export function formatComplex(c){const reZero=roundsToZero(c.re),imZero=roundsToZero(c.im);if(imZero)return formatReal(reZero?0:c.re);if(reZero)return `${formatReal(c.im)}i`;return `(${formatReal(c.re)} ${c.im<0?MINUS:'+'} ${Math.abs(c.im).toFixed(DIGITS)}i)`}
// Writes |psi> = a|0> + b|1>, folding a leading minus on b into the operator: "0.707 |0⟩ − 0.707 |1⟩".
export function formatStateEquation(a,b){const second=formatComplex(b),negative=second.startsWith(MINUS);return `|ψ⟩ = ${formatComplex(a)} |0⟩ ${negative?MINUS:'+'} ${negative?second.slice(1):second} |1⟩`}
