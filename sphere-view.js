// Canvas drawing of the Bloch sphere. Draws exactly the vector it is given; it holds no state.
//   scene.vector   the Bloch vector to draw (the exact state, or an animation frame)
//   scene.overlay  optional {from, axis, angle, label, progress} for the selected step:
//                  the state before it (faded) and, for a rotation, its axis, sense and path.
//                  progress (0..1) is how much of the path has been traced; 1 when not animating.
import {projectBloch} from './projection.js';
import {rotateAbout} from './gate-info.js';

export const OVERLAY_COLOR = '#c4a1ff';
const STATE_COLOR = '#ffcf69';

// Unit vectors e1, e2 with e1 × e2 = axis, so increasing t in cos t e1 + sin t e2 turns by the right-hand rule.
function perpendicularBasis([ux, uy, uz]) {
  const [ax, ay, az] = Math.abs(ux) < 0.9 ? [1, 0, 0] : [0, 1, 0], d = ax * ux + ay * uy + az * uz;
  let e1 = [ax - d * ux, ay - d * uy, az - d * uz];
  const n = Math.hypot(...e1);
  e1 = e1.map((c) => c / n);
  const e2 = [uy * e1[2] - uz * e1[1], uz * e1[0] - ux * e1[2], ux * e1[1] - uy * e1[0]];
  return [e1, e2];
}

export function drawBlochSphere(canvas, {yaw, pitch, vector, overlay}) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2, r = Math.min(W, H) * .365;
  ctx.clearRect(0, 0, W, H);
  const project = (v) => {
    const p = projectBloch(v, yaw, pitch);
    return {x: cx + r * p.right, y: cy - r * p.up, depth: p.depth};
  };
  const O = {x: 0, y: 0, z: 0}, origin = project(O);
  function line(a, b, color, width = 1.4, dash = []) {
    const A = project(a), B = project(b);
    ctx.beginPath(); ctx.setLineDash(dash); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([]);
  }
  function dot(p, radius, color, alpha = 1) {
    ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.fill(); ctx.globalAlpha = 1;
  }
  function polyline(points, color, width, alpha = 1, dash = []) {
    if (points.length < 2) return;
    ctx.beginPath(); points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.setLineDash(dash); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  function arrowHead(points, color, size = 13) {
    const [p1, p2] = points.slice(-2);
    if (!p1 || Math.hypot(p2.x - p1.x, p2.y - p1.y) <= .3) return;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    ctx.beginPath(); ctx.moveTo(p2.x, p2.y);
    ctx.lineTo(p2.x - size * Math.cos(angle - .45), p2.y - size * Math.sin(angle - .45));
    ctx.lineTo(p2.x - size * Math.cos(angle + .45), p2.y - size * Math.sin(angle + .45));
    ctx.closePath(); ctx.fillStyle = color; ctx.fill();
  }

  const glow = ctx.createRadialGradient(cx - r * .3, cy - r * .4, r * .05, cx, cy, r);
  glow.addColorStop(0, 'rgba(76,129,245,.21)'); glow.addColorStop(1, 'rgba(76,129,245,.045)');
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.fillStyle = glow; ctx.fill(); ctx.strokeStyle = '#5174ab'; ctx.lineWidth = 2; ctx.stroke();

  // Arcs on the far hemisphere are dashed and dimmed so the viewer can tell front from back (and hence handedness).
  function circle(plane, color) {
    const points = [];
    for (let i = 0; i <= 180; i++) points.push(project(plane(i * 2 * Math.PI / 180)));
    ctx.strokeStyle = color; ctx.lineWidth = 1.35;
    for (const back of [true, false]) {
      ctx.setLineDash(back ? [4, 5] : []); ctx.globalAlpha = back ? .45 : 1; ctx.beginPath();
      for (let i = 1; i < points.length; i++) {
        if ((points[i - 1].depth + points[i].depth < 0) !== back) continue;
        ctx.moveTo(points[i - 1].x, points[i - 1].y); ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  circle((t) => ({x: Math.cos(t), y: Math.sin(t), z: 0}), '#4971a6');
  circle((t) => ({x: Math.cos(t), y: 0, z: Math.sin(t)}), '#355980');
  circle((t) => ({x: 0, y: Math.cos(t), z: Math.sin(t)}), '#355980');

  for (const axis of [{v: {x: 1.2, y: 0, z: 0}, label: '+X'}, {v: {x: 0, y: 1.2, z: 0}, label: '+Y'}, {v: {x: 0, y: 0, z: 1.2}, label: '|0⟩'}, {v: {x: 0, y: 0, z: -1.2}, label: '|1⟩'}]) {
    line(O, axis.v, '#8099c0', 1.5, [4, 5]);
    const a = project(axis.v);
    ctx.fillStyle = '#dbeaff'; ctx.font = 'bold 18px system-ui'; ctx.fillText(axis.label, a.x + 5, a.y - 5);
  }

  if (overlay) {
    const {from, axis, angle = 0, label = '', progress = 1} = overlay;
    if (axis) {
      const [ux, uy, uz] = axis, at = (k) => ({x: k * ux, y: k * uy, z: k * uz});
      line(at(-1.25), at(1.25), OVERLAY_COLOR, 2.5, [8, 6]);
      // Rotation sense: a small arc around the +axis end, swept in the direction of the rotation.
      if (Math.abs(angle) > 1e-9) {
        const [e1, e2] = perpendicularBasis(axis), sweep = Math.sign(angle) * Math.min(Math.max(Math.abs(angle), Math.PI / 2), 1.8 * Math.PI);
        const ring = [];
        for (let i = 0; i <= 40; i++) {
          const t = sweep * i / 40, c = Math.cos(t) * .15, s = Math.sin(t) * .15;
          ring.push(project({x: 1.1 * ux + c * e1[0] + s * e2[0], y: 1.1 * uy + c * e1[1] + s * e2[1], z: 1.1 * uz + c * e1[2] + s * e2[2]}));
        }
        polyline(ring, OVERLAY_COLOR, 2.2);
        arrowHead(ring, OVERLAY_COLOR, 9);
      }
      const end = project(at(1.36));
      ctx.fillStyle = OVERLAY_COLOR; ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(label || 'rotation axis', end.x, end.y + 24); ctx.textAlign = 'start';
    }
    line(O, from, 'rgba(255,207,105,.38)', 3);
    dot(project(from), 6, STATE_COLOR, .4);
    if (axis && Math.abs(angle) > 1e-9) {
      const n = Math.max(48, Math.ceil(Math.abs(angle) / (Math.PI / 48)));
      const path = Array.from({length: n + 1}, (_, i) => project(rotateAbout(from, axis, angle * i / n)));
      const traced = path.slice(0, Math.max(1, Math.round(progress * n)) + 1);
      if (progress < 1) polyline(path, OVERLAY_COLOR, 2, .35, [3, 5]);
      polyline(traced, OVERLAY_COLOR, 2.5);
      if (progress >= 1) arrowHead(path, OVERLAY_COLOR);
    }
  }

  line(O, vector, STATE_COLOR, 5);
  const end = project(vector);
  dot(end, 8, STATE_COLOR, end.depth < -1e-9 ? .55 : 1);
  dot(origin, 3, '#cad9ff');
}
