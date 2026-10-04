// Low-poly 3D models shared by the shop (index.html) and the 3D town (lowpoly.html).
import * as THREE from "three";

const mats = {};
const mat = (c, extra = {}) => {
  const k = c + JSON.stringify(extra);
  return mats[k] || (mats[k] = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85, ...extra }));
};
function mesh(geo, color, x = 0, y = 0, z = 0, extra) {
  const m = new THREE.Mesh(geo, mat(color, extra));
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
const box = (w, h, d, c, x = 0, y = 0, z = 0, extra) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, extra);

// Side profile (z = length, y = height) extruded across the car's width.
function profile(points, width, color, extra) {
  const s = new THREE.Shape();
  points.forEach(([z, y], k) => k ? s.lineTo(z, y) : s.moveTo(z, y));
  const geo = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: false });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(-Math.PI / 2);   // shape x → world z (length), extrusion → world x (width)
  return mesh(geo, color, 0, 0, 0, extra);
}

export const CAR_COLORS = { "car-mini": "#7fd1ae", "car-sedan": "#c9d3e0", "car-suv": "#3a4a55", "car-sports": "#e63946", "car-super": "#ffb703", "car-hyper": "#2b2f38" };

// Car facing +z, wheels on y = 0, about 1 unit long.
export function carModel(id) {
  const color = CAR_COLORS[id];
  if (!color) return null;
  const v = id.split("-")[1];
  const paint = { metalness: 0.45, roughness: 0.35 };
  const glass = { metalness: 0.6, roughness: 0.15 };
  const g = new THREE.Group();
  const L = { mini: 0.62, sedan: 0.9, suv: 0.92, sports: 0.92, super: 0.98, hyper: 1.02 }[v];
  const W = { mini: 0.38, sedan: 0.42, suv: 0.46, sports: 0.44, super: 0.48, hyper: 0.5 }[v];
  const r = v === "suv" ? 0.11 : v === "mini" ? 0.075 : 0.085;   // wheel radius
  const h = L / 2;
  // Body + cabin silhouettes, rear (-h) to front (+h).
  const shapes = {
    mini:   [[-h, .07], [h, .07], [h, .2], [h - .1, .24], [h - .17, .38], [-h + .06, .39], [-h, .3]],
    sedan:  [[-h, .07], [h, .07], [h, .19], [h - .2, .23], [h - .34, .36], [-h + .24, .36], [-h + .1, .25], [-h, .23]],
    suv:    [[-h, .09], [h, .09], [h, .27], [h - .14, .31], [h - .25, .48], [-h + .03, .48], [-h, .42]],
    sports: [[-h, .07], [h, .07], [h, .14], [h - .26, .19], [h - .44, .3], [-h + .22, .29], [-h + .04, .19], [-h, .18]],
    super:  [[-h, .06], [h, .06], [h, .11], [h - .3, .17], [h - .47, .27], [-h + .3, .25], [-h + .02, .17], [-h, .17]],
    hyper:  [[-h, .05], [h, .05], [h, .1], [h - .32, .16], [h - .5, .25], [-h + .34, .23], [-h + .02, .16], [-h, .16]],
  }[v];
  g.add(profile(shapes, W, color, paint));
  // Glass band: same silhouette, slightly narrower and taller-trimmed, only the cabin part.
  const cab = shapes.filter(([, y]) => y > (v === "suv" ? .3 : .17));
  if (cab.length >= 2) {
    const zs = cab.map(p => p[0]), top = Math.max(...cab.map(p => p[1]));
    const z0 = Math.min(...zs) + .03, z1 = Math.max(...zs) - .03, yb = top - (v === "suv" ? .14 : .1);
    g.add(profile([[z0, yb], [z1, yb], [z1 - .04, top - .015], [z0 + .03, top - .015]], W + 0.004, "#1e2b3d", glass));
  }
  // Wheels with rims.
  const rim = v === "hyper" || v === "super" ? "#d4af37" : "#ced4da";
  for (const z of [h - .18 * L / .9, -h + .17 * L / .9]) for (const s of [1, -1]) {
    const tire = mesh(new THREE.CylinderGeometry(r, r, .07, 12), "#15171c", s * (W / 2 - .02), r, z);
    tire.rotation.z = Math.PI / 2; g.add(tire);
    const hub = mesh(new THREE.CylinderGeometry(r * .55, r * .55, .075, 6), rim, s * (W / 2 - .02), r, z, { metalness: .8, roughness: .3 });
    hub.rotation.z = Math.PI / 2; g.add(hub);
  }
  // Lights.
  const front = shapes[2][1] - .04, back = shapes[shapes.length - 1][1] - .04;
  for (const s of [1, -1]) {
    g.add(box(.09, .03, .01, "#fff8d6", s * (W / 2 - .07), front, h + .002, { emissive: "#fff3b0", emissiveIntensity: .6 }));
    g.add(box(.09, .03, .01, "#ff3b30", s * (W / 2 - .07), back, -h - .002, { emissive: "#ff3b30", emissiveIntensity: .5 }));
  }
  // Extras by grade.
  if (v === "suv") g.add(box(W * .8, .02, L * .55, "#22252b", 0, .485, -.04));                      // roof rails
  if (v === "sports" || v === "super" || v === "hyper") g.add(box(W + .02, .02, .07, "#14161b", 0, shapes[shapes.length - 1][1] + .06, -h + .05));
  if (v === "super" || v === "hyper") for (const s of [1, -1]) g.add(box(.02, .06, .02, "#14161b", s * W * .35, shapes[shapes.length - 1][1], -h + .05));
  if (v === "hyper") g.add(box(.05, .003, L * .92, "#d4af37", 0, shapes[shapes.length - 2][1] + .002, 0, { metalness: .8, roughness: .25 }));
  return g;
}

// ---------- Studio renderer (one shared WebGL context) ----------
let studio = null;
function getStudio() {
  if (studio) return studio;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 4, 3); key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1 });
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9ec5ff, 1.0);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.1, 20);
  camera.position.set(1.1, 0.68, 1.25);
  camera.lookAt(0, 0.15, 0);
  studio = { renderer, scene, camera, holder: new THREE.Group() };
  scene.add(studio.holder);
  return studio;
}
function stage(id, angle) {
  const s = getStudio();
  s.holder.clear();
  const m = carModel(id);
  if (!m) return null;
  m.rotation.y = angle;
  s.holder.add(m);
  return s;
}

const thumbs = {};
// Still image of a car for shop cards (rendered once, then cached).
export function carThumb(id, w = 320, h = 240) {
  if (thumbs[id]) return thumbs[id];
  const s = stage(id, 0);
  if (!s) return null;
  s.renderer.setSize(w, h, false);
  s.camera.aspect = w / h; s.camera.updateProjectionMatrix();
  s.renderer.render(s.scene, s.camera);
  return (thumbs[id] = s.renderer.domElement.toDataURL("image/png"));
}

// Live turntable inside `el`; returns a stop function.
export function carSpin(el, id) {
  const s = stage(id, 0);
  if (!s) return () => {};
  const cv = s.renderer.domElement;
  const w = el.clientWidth || 300, h = el.clientHeight || 225;
  s.renderer.setSize(w, h, false);
  s.camera.aspect = w / h; s.camera.updateProjectionMatrix();
  cv.style.width = "100%"; cv.style.height = "100%"; cv.style.display = "block";
  el.replaceChildren(cv);
  let raf, t0 = performance.now();
  const loop = now => {
    s.holder.rotation.y = (now - t0) / 1000 * 0.9;
    s.renderer.render(s.scene, s.camera);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); s.holder.rotation.y = 0; cv.remove(); };
}
