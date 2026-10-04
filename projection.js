// Orthographic camera for the Bloch sphere.
// yaw turns the sphere about +Z; pitch tilts the north pole toward the viewer.
// Returns screen coordinates in a right-handed frame: right, up, and depth
// (positive = toward the viewer). The map (x,y,z) -> (right,up,depth) is a proper
// rotation (determinant +1), so the drawn axes obey the right-hand rule.
export const defaultView={yaw:-.7,pitch:.32};
export function projectBloch({x,y,z},yaw,pitch){const xx=x*Math.cos(yaw)-y*Math.sin(yaw),yy=x*Math.sin(yaw)+y*Math.cos(yaw);return {right:xx,up:z*Math.cos(pitch)+yy*Math.sin(pitch),depth:z*Math.sin(pitch)-yy*Math.cos(pitch)}}
