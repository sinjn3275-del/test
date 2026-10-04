// 3D low-poly town for the "내 세상" tab (and lowpoly.html): my own 7x7 plot of dirt that
// can be paved tile by tile, bought items, avatar, tap-to-select/move via raycasting, day/night.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { itemModel, windowMat, textTexture } from "./models3d.js";
import { avatarModel } from "./avatar3d.js";

export const N = 7, RIVER_J = N - 1;
export const terrain = (i, j) => j === RIVER_J ? "water" : "land";
export const AVATAR_TILE = [3, 4];

// Floor materials bought per tile. Prices must match flex_floor_price() in supabase/flex-floor.sql.
export const FLOORS = [
  { id: "dirt", name: "흙", price: 0, color: "#9c6b43" },
  { id: "grass", name: "잔디", price: 1_000_000, color: "#6ab04c" },
  { id: "gravel", name: "자갈", price: 2_000_000, color: "#b5ada0" },
  { id: "concrete", name: "콘크리트", price: 3_000_000, color: "#a9aeb5" },
  { id: "brick", name: "보도블록", price: 5_000_000, color: "#c26a4f" },
  { id: "deck", name: "나무 데크", price: 8_000_000, color: "#a8743f" },
  { id: "marble", name: "대리석", price: 20_000_000, color: "#ece7df" },
  { id: "gold", name: "황금 타일", price: 100_000_000, color: "#e9c46a" },
];
export const FLOOR_BY_ID = Object.fromEntries(FLOORS.map(f => [f.id, f]));
export const AVATAR_KEY = "@me";

const mats = {};
const mat = (c, extra = {}) => {
  const k = c + JSON.stringify(extra);
  return mats[k] || (mats[k] = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85, ...extra }));
};
function mesh(geo, color, x = 0, y = 0, z = 0, extra) {
  const m = new THREE.Mesh(geo, typeof color === "string" ? mat(color, extra) : color);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
const box = (w, h, d, c, x, y, z, extra) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, extra);
const tileX = i => i - (N - 1) / 2, tileZ = j => j - (N - 1) / 2;

// Small seamless canvas texture per floor material so tiles read as grass/brick/wood, not flat color.
const floorMats = {};
function floorMat(id) {
  if (floorMats[id]) return floorMats[id];
  const f = FLOOR_BY_ID[id] || FLOOR_BY_ID.dirt, S = 64;
  const c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d");
  x.fillStyle = f.color; x.fillRect(0, 0, S, S);
  let seed = id.length * 97;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const specks = (n, colors, r) => { for (let k = 0; k < n; k++) { x.fillStyle = colors[k % colors.length]; x.fillRect(rnd() * S, rnd() * S, r, r); } };
  const lines = (color, w, pts) => { x.strokeStyle = color; x.lineWidth = w; x.beginPath(); for (const [a, b, c2, d] of pts) { x.moveTo(a, b); x.lineTo(c2, d); } x.stroke(); };
  if (id === "dirt") specks(140, ["#8a5d38", "#ad7a50", "#7a5232"], 2);
  else if (id === "grass") specks(260, ["#5c9e40", "#7cc35c", "#4f8f37"], 2);
  else if (id === "gravel") specks(220, ["#8f887c", "#d2ccc2", "#a29a8d"], 3);
  else if (id === "concrete") { specks(90, ["#9ca1a8", "#b8bcc2"], 2); lines("#8d9299", 2, [[0, 0, S, 0], [0, 0, 0, S]]); }
  else if (id === "brick") {
    for (let r = 0; r < 4; r++) lines("#8e4a36", 2, [[0, r * 16, S, r * 16]]);
    for (let r = 0; r < 4; r++) for (let q = 0; q < 2; q++) { const cx = q * 32 + (r % 2) * 16; lines("#8e4a36", 2, [[cx, r * 16, cx, r * 16 + 16]]); }
  } else if (id === "deck") { for (let r = 0; r < 4; r++) lines("#7a5128", 2, [[0, r * 16, S, r * 16]]); specks(40, ["#966532"], 2); }
  else if (id === "marble") { lines("#c9c2b6", 1.5, [[0, 20, 30, 34], [30, 34, 64, 26], [10, 64, 40, 44], [40, 44, 64, 52]]); lines("#d8d2c8", 2, [[0, 0, S, 0], [0, 0, 0, S]]); }
  else if (id === "gold") {
    const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, "#f7dc8a"); g.addColorStop(0.5, "#d4a73c"); g.addColorStop(1, "#f2cf6b");
    x.fillStyle = g; x.fillRect(0, 0, S, S); lines("#b88a22", 2, [[0, 0, S, 0], [0, 0, 0, S], [0, 32, S, 32], [32, 0, 32, S]]);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  const extra = id === "gold" ? { metalness: 0.6, roughness: 0.35 } : id === "marble" ? { roughness: 0.4 } : {};
  return floorMats[id] = new THREE.MeshStandardMaterial({ map: t, flatShading: true, roughness: 0.9, ...extra });
}

// ---------- Items ----------
function tent() {
  const g = new THREE.Group();
  const t = mesh(new THREE.ConeGeometry(0.42, 0.55, 4), "#e07a4a", 0, 0.28, 0);
  t.rotation.y = Math.PI / 4; g.add(t);
  return g;
}

// Items as placed in the town: cars a bit smaller and angled.
function townModel(id) {
  const m = itemModel(id);
  if (!m || !id.startsWith("car-")) return m;
  const g = new THREE.Group();
  m.scale.setScalar(0.8);
  m.rotation.y = 0.4;
  g.add(m);
  return g;
}

// el: container. onTap(key) is called with "i,j" when a tile or item is tapped (not dragged).
export function townViewer(el, { onTap } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
  el.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.42;
  controls.minDistance = 5;
  controls.maxDistance = 40;
  camera.position.set(1, 0.85, 1);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x6b8f71, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(8, 14, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
  scene.add(sun);

  // Ground tiles (each tagged with its key for tapping).
  const tiles = [];
  const ground = new THREE.Group();
  scene.add(ground);
  ground.add(box(N + 0.6, 0.6, N + 0.6, "#7f5539", 0, -0.6, 0));
  const waters = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = tileX(i), z = tileZ(j);
    let m;
    if (terrain(i, j) === "water") { m = box(1, 0.06, 1, "#48cae4", x, -0.02, z, { transparent: true, opacity: 0.9, roughness: 0.2, metalness: 0.1 }); waters.push(m); }
    else m = box(0.98, 0.1, 0.98, floorMat("dirt"), x, 0, z);
    m.userData.key = i + "," + j;
    tiles.push(m); ground.add(m);
  }

  const clouds = [];
  for (let k = 0; k < 4; k++) {
    const c = new THREE.Group();
    for (let p = 0; p < 3; p++) { const m = mesh(new THREE.IcosahedronGeometry(0.35 + p * 0.08, 0), "#ffffff", p * 0.4 - 0.4, 0, (p % 2) * 0.2); m.castShadow = false; c.add(m); }
    c.position.set(-10 + k * 5, 7 + (k % 2), -9 + (k % 2) * 3);
    scene.add(c); clouds.push(c);
  }

  // Everything that changes with the save lives in `dyn` and is rebuilt on update().
  let dyn = new THREE.Group();
  scene.add(dyn);
  let animated = [], selGroup = null, items = [], me = null, meFrom = null, meAt = 0, lastPos = null, wasMoving = false;
  const hl = (key, color, opacity) => {
    const [i, j] = key.split(",").map(Number);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.02, 0.96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.position.set(tileX(i), terrain(i, j) === "water" ? 0.06 : 0.115, tileZ(j));
    m.userData.key = key;
    return m;
  };

  // place: { itemId: "i,j" }, selected: itemId | "@me" | null, targets: ["i,j"], avatar: cfg (avatar.pos = "i,j"), watch: color | null,
  // floor: { "i,j": material } (missing = dirt)
  const sprite = (lines, opts, sx, sy) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(lines, opts), depthTest: false }));
    s.scale.set(sx, sy, 1); s.renderOrder = 10;
    return s;
  };
  // banner: 현수막 text over the back of the island; bubble: 말풍선 over the avatar.
  function update({ place = {}, selected = null, targets = [], avatar = {}, watch = null, showTent = false, banner = null, bubble = null, floor = {} } = {}) {
    for (const m of tiles) if (terrain(...m.userData.key.split(",").map(Number)) === "land") m.material = floorMat(floor[m.userData.key] || "dirt");
    scene.remove(dyn);
    dyn = new THREE.Group();
    animated = []; selGroup = null; items = []; me = null;
    const taken = new Set(Object.values(place));
    for (const [id, key] of Object.entries(place)) {
      const [i, j] = key.split(",").map(Number);
      const g = townModel(id);
      if (!g) continue;
      g.position.set(tileX(i), terrain(i, j) === "water" ? 0 : 0.1, tileZ(j));
      g.userData.base = g.position.y;
      g.traverse(o => { o.userData.key = key; });
      dyn.add(g); items.push(g);
      if (g.userData.spin || g.userData.bob || g.userData.float) animated.push(g);
      if (id === selected) selGroup = g;
    }
    if (showTent && !taken.has("1,4")) { const t = tent(); t.position.set(tileX(1), 0.1, tileZ(4)); t.traverse(o => { o.userData.key = "1,4"; }); dyn.add(t); }
    for (const key of targets) dyn.add(hl(key, 0xe7c26a, 0.45));
    if (selected && place[selected]) dyn.add(hl(place[selected], 0xffd166, 0.8));
    // The avatar stands on its own tile (avatar.pos) and walks there when it changes.
    const pos = /^[0-6],[0-6]$/.test(avatar.pos || "") ? avatar.pos : AVATAR_TILE.join(",");
    const [ai, aj] = pos.split(",").map(Number);
    me = avatarModel(avatar, watch);
    me.scale.setScalar(0.42);
    me.position.set(tileX(ai) + (taken.has(pos) ? 0.25 : 0), 0.1, tileZ(aj));
    me.rotation.y = 0.6;
    me.userData.base = me.position.y;
    me.userData.to = me.position.clone();
    // Walk only after the player moved it, not when a viewer switches to another user's town.
    if (wasMoving && lastPos && lastPos.key !== pos) {
      meFrom = lastPos.v.clone(); meAt = performance.now();
      const d = me.userData.to.clone().sub(meFrom);
      me.rotation.y = Math.atan2(d.x, d.z);
      me.position.copy(meFrom);
    } else if (meFrom) me.position.copy(meFrom);
    lastPos = { key: pos, v: me.userData.to.clone() };
    wasMoving = selected === AVATAR_KEY;
    // Invisible, bigger tap target: the little avatar is hard to hit with a finger.
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.4, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.position.y = 1.7;
    me.add(hit);
    me.traverse(o => { o.userData.key = AVATAR_KEY; });
    dyn.add(me);
    if (selected === AVATAR_KEY) { selGroup = me; dyn.add(hl(pos, 0xffd166, 0.8)); }
    if (bubble) {
      const b = sprite([bubble], { w: 640, h: 128, bg: "#ffffff", fg: "#1d2433", size: 46 }, 2.6, 0.52);
      b.position.set(me.position.x, 1.35, me.position.z);
      dyn.add(b);
    }
    if (banner) {
      const b = sprite([banner, "현수막"], { w: 768, h: 170, bg: "#b8860b", fg: "#1b1b1f", accent: "#fff3b0", size: 66 }, 5.4, 1.2);
      b.position.set(-0.5, 2.6, -3.2);
      dyn.add(b);
    }
    scene.add(dyn);
  }

  let night = false;
  function setNight(v) {
    night = v;
    const sky = night ? "#0b1430" : "#6cc3f5";
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(sky, 25, 60);
    sun.intensity = night ? 0.25 : 1.6;
    sun.color.set(night ? "#9db4ff" : "#ffffff");
    hemi.intensity = night ? 0.35 : 0.9;
    windowMat.emissive.set(night ? "#ffd166" : "#000000");
    windowMat.color.set(night ? "#ffd166" : "#a8dadc");
  }

  // Tap (pointer that barely moved) → raycast to a tile/item key.
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener("pointerdown", e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) { down = null; return; }
    down = null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    // The avatar and bought items win over the ground.
    const hit = ray.intersectObjects(me ? [me, ...items] : items, true)[0] || ray.intersectObjects(tiles, false)[0];
    if (hit && onTap) onTap(hit.object.userData.key);
  });

  function resize() {
    const w = el.clientWidth || 300, h = el.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Back off on narrow screens so the whole island fits.
    camera.position.setLength(12.2 * Math.max(1, 1.15 / camera.aspect));
  }

  const clock = new THREE.Clock();
  let raf = 0;
  const loop = () => {
    const t = clock.getElapsedTime();
    for (const g of animated) {
      if (g.userData.spin) g.userData.spin.rotation.y = t * 12;
      if (g.userData.bob) { g.position.y = Math.sin(t * 1.5) * 0.03; g.rotation.z = Math.sin(t * 1.1) * 0.04; }
      if (g.userData.float) g.userData.float.position.y = 0.55 + Math.sin(t * 0.8) * 0.12;
    }
    if (me && meFrom) {
      const k = Math.min(1, (performance.now() - meAt) / 600);
      me.position.lerpVectors(meFrom, me.userData.to, k);
      me.position.y = me.userData.base + Math.abs(Math.sin(k * Math.PI * 3)) * 0.06;
      if (k === 1) meFrom = null;
    }
    if (selGroup) selGroup.position.y = selGroup.userData.base + 0.08 + Math.sin(t * 5) * 0.05;
    waters.forEach((w, k) => w.position.y = 0.01 + Math.sin(t * 1.2 + k) * 0.015);
    clouds.forEach(c => { c.position.x += 0.004; if (c.position.x > 10) c.position.x = -10; });
    controls.update();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
  };
  return {
    update, setNight, resize,
    get night() { return night; },
    start() { if (!raf) { resize(); raf = requestAnimationFrame(loop); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}
