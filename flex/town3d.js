// 3D low-poly town for the "내 세상" tab (and lowpoly.html): tiles, bought items, avatar,
// tap-to-select/move via raycasting, day/night.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { carModel } from "./models3d.js";
import { avatarModel } from "./avatar3d.js";

export const N = 7, ROAD_I = 3, RIVER_J = N - 1;
export const terrain = (i, j) => j === RIVER_J ? "water" : i === ROAD_I ? "road" : "land";
const AVATAR_TILE = [ROAD_I, 4];

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
const windowMat = mat("#a8dadc", { emissive: "#000000" });
const lampMat = mat("#fff3b0", { emissive: "#000000" });

function windows(g, w, h, d, floors, y0 = 0) {
  for (let f = 0; f < floors; f++) {
    const y = y0 + (f + 0.5) * (h / floors);
    for (const side of [1, -1]) {
      const pane = mesh(new THREE.BoxGeometry(w * 0.8, h / floors * 0.45, 0.02), windowMat, 0, y, side * (d / 2 + 0.01));
      pane.castShadow = false;
      g.add(pane);
      const pane2 = mesh(new THREE.BoxGeometry(0.02, h / floors * 0.45, d * 0.8), windowMat, side * (w / 2 + 0.01), y, 0);
      pane2.castShadow = false;
      g.add(pane2);
    }
  }
}

function tree(x, z, s = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.3 * s, 5), "#6b4f3a", 0, 0.15 * s, 0));
  g.add(mesh(new THREE.ConeGeometry(0.28 * s, 0.6 * s, 6), "#40916c", 0, 0.55 * s, 0));
  g.add(mesh(new THREE.ConeGeometry(0.2 * s, 0.4 * s, 6), "#52b788", 0, 0.85 * s, 0));
  g.position.set(x, 0.1, z);
  return g;
}

// ---------- Items ----------
function building(id) {
  const g = new THREE.Group();
  switch (id) {
    case "house-oneroom":
      g.add(box(0.6, 0.7, 0.6, "#e9d8a6")); windows(g, 0.6, 0.7, 0.6, 2);
      g.add(box(0.66, 0.06, 0.66, "#9b2226", 0, 0.7, 0)); break;
    case "house-villa":
      g.add(box(0.8, 1.1, 0.7, "#f1faee")); windows(g, 0.8, 1.1, 0.7, 3);
      g.add(box(0.86, 0.08, 0.76, "#457b9d", 0, 1.1, 0)); break;
    case "house-apt":
      g.add(box(0.75, 2.4, 0.75, "#dfe7ef")); windows(g, 0.75, 2.4, 0.75, 8);
      g.add(box(0.8, 0.1, 0.8, "#1d3557", 0, 2.4, 0)); break;
    case "house-penthouse":
      g.add(box(0.8, 3.4, 0.8, "#2b2d42", 0, 0, 0, { metalness: 0.3 })); windows(g, 0.8, 3.4, 0.8, 11);
      g.add(box(0.6, 0.35, 0.6, "#d4af37", 0, 3.4, 0, { metalness: 0.3, roughness: 0.4 }));
      g.add(box(0.3, 0.04, 0.3, "#48cae4", 0.12, 3.75, 0.12)); break;   // rooftop pool
    case "house-mansion": {
      g.add(box(0.95, 0.04, 0.95, "#74c69d"));                         // lawn
      g.add(box(0.75, 0.6, 0.5, "#fefae0", 0, 0.04, -0.1)); windows(g, 0.75, 0.6, 0.5, 2, 0.04);
      const roof = mesh(new THREE.ConeGeometry(0.58, 0.35, 4), "#bc6c25", 0, 0.82, -0.1);
      roof.rotation.y = Math.PI / 4; roof.scale.z = 0.7; g.add(roof);
      g.add(box(0.3, 0.02, 0.18, "#48cae4", 0.22, 0.04, 0.32));         // pool
      for (const x of [-0.3, 0.3]) g.add(box(0.06, 0.45, 0.06, "#fefae0", x, 0.04, 0.17)); break;
    }
    case "house-castle":
      g.add(box(0.7, 0.8, 0.7, "#adb5bd")); windows(g, 0.7, 0.8, 0.7, 2);
      for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) {
        g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.2, 6), "#ced4da", x, 0.6, z));
        g.add(mesh(new THREE.ConeGeometry(0.17, 0.35, 6), "#9b2226", x, 1.37, z));
      } break;
    case "sp-heli": {
      g.add(box(0.85, 0.03, 0.85, "#495057"));                          // pad
      g.add(mesh(new THREE.TorusGeometry(0.25, 0.02, 4, 16), "#f8f9fa", 0, 0.04, 0)).rotation.x = Math.PI / 2;
      const body = mesh(new THREE.SphereGeometry(0.2, 7, 5), "#e63946", 0, 0.28, 0);
      body.scale.set(1.4, 0.9, 0.9); g.add(body);
      g.add(box(0.45, 0.05, 0.05, "#e63946", -0.35, 0.25, 0));
      const rotor = new THREE.Group(); rotor.position.y = 0.48;
      rotor.add(box(1.0, 0.015, 0.05, "#22252b")); rotor.add(box(0.05, 0.015, 1.0, "#22252b"));
      g.add(rotor); g.userData.spin = rotor;
      for (const z of [-0.14, 0.14]) g.add(box(0.5, 0.02, 0.03, "#22252b", 0, 0.08, z)); break;
    }
    case "sp-jet": {
      const body = mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.1, 8), "#f8f9fb", 0, 0.3, 0);
      body.rotation.x = Math.PI / 2; g.add(body);
      const nose = mesh(new THREE.ConeGeometry(0.11, 0.25, 8), "#f8f9fb", 0, 0.3, 0.67);
      nose.rotation.x = Math.PI / 2; g.add(nose);
      g.add(box(1.1, 0.03, 0.25, "#9aa5b4", 0, 0.27, 0));               // wings
      g.add(box(0.03, 0.3, 0.18, "#1d3557", 0, 0.38, -0.48));           // tail
      g.add(box(0.4, 0.03, 0.12, "#9aa5b4", 0, 0.5, -0.5));
      g.add(box(0.23, 0.03, 1.12, "#d4af37", 0, 0.24, 0, { metalness: 0.3, roughness: 0.4 }));
      for (const z of [0.3, -0.25]) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 5), "#22252b", 0, 0.1, z)); break;
    }
    case "sp-yacht": {
      const hull = mesh(new THREE.CylinderGeometry(0.22, 0.1, 0.18, 6), "#f8f9fb", 0, 0.12, 0);
      hull.scale.set(1, 1, 3.2); g.add(hull);
      g.add(box(0.28, 0.16, 0.55, "#f8f9fb", 0, 0.21, -0.05));
      g.add(box(0.29, 0.06, 0.4, "#1d3557", 0, 0.29, -0.03));
      g.add(box(0.2, 0.12, 0.25, "#f8f9fb", 0, 0.37, -0.1));
      g.userData.bob = true; break;
    }
    default: {
      const car = carModel(id);
      if (!car) return null;
      car.scale.setScalar(0.8);
      car.rotation.y = 0.4;
      g.add(car);
    }
  }
  return g;
}


function tent() {
  const g = new THREE.Group();
  const t = mesh(new THREE.ConeGeometry(0.42, 0.55, 4), "#e07a4a", 0, 0.28, 0);
  t.rotation.y = Math.PI / 4; g.add(t);
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
    const t = terrain(i, j), x = tileX(i), z = tileZ(j);
    let m;
    if (t === "water") { m = box(1, 0.06, 1, "#48cae4", x, -0.02, z, { transparent: true, opacity: 0.9, roughness: 0.2, metalness: 0.1 }); waters.push(m); }
    else if (t === "road") { m = box(1, 0.1, 1, "#495057", x, 0, z); ground.add(box(0.06, 0.005, 0.4, "#f8f9fa", x, 0.1, z)); }
    else m = box(0.98, 0.1, 0.98, (i + j) % 2 ? "#74c69d" : "#6ab88f", x, 0, z);
    m.userData.key = i + "," + j;
    tiles.push(m); ground.add(m);
  }
  for (const j of [0, 2, 4]) {
    const x = tileX(ROAD_I) + 0.45, z = tileZ(j);
    ground.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 5), "#343a40", x, 0.4, z));
    ground.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), lampMat, x, 0.72, z));
  }

  const traffic = carModel("car-sedan");
  traffic.scale.setScalar(0.7);
  traffic.position.set(tileX(ROAD_I) - 0.2, 0.1, 0);
  scene.add(traffic);

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
  let animated = [], selGroup = null, items = [];
  const hl = (key, color, opacity) => {
    const [i, j] = key.split(",").map(Number);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.02, 0.96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    m.position.set(tileX(i), terrain(i, j) === "water" ? 0.06 : 0.115, tileZ(j));
    m.userData.key = key;
    return m;
  };

  // place: { itemId: "i,j" }, selected: itemId | null, targets: ["i,j"], avatar: cfg, watch: color | null
  function update({ place = {}, selected = null, targets = [], avatar = {}, watch = null, showTent = false } = {}) {
    scene.remove(dyn);
    dyn = new THREE.Group();
    animated = []; selGroup = null; items = [];
    const taken = new Set(Object.values(place));
    for (const [id, key] of Object.entries(place)) {
      const [i, j] = key.split(",").map(Number);
      const g = building(id);
      if (!g) continue;
      g.position.set(tileX(i), terrain(i, j) === "water" ? 0 : 0.1, tileZ(j));
      g.userData.base = g.position.y;
      g.traverse(o => { o.userData.key = key; });
      dyn.add(g); items.push(g);
      if (g.userData.spin || g.userData.bob) animated.push(g);
      if (id === selected) selGroup = g;
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const key = i + "," + j;
      if (terrain(i, j) !== "land" || taken.has(key)) continue;
      if (showTent && i === 1 && j === 4) { const t = tent(); t.position.set(tileX(i), 0.1, tileZ(j)); t.traverse(o => { o.userData.key = key; }); dyn.add(t); continue; }
      if ((i * 3 + j * 5) % 7) continue;
      for (const [dx, dz, s] of [[-0.2, -0.15, 0.9], [0.25, 0.2, 0.7]]) {
        const t = tree(tileX(i) + dx, tileZ(j) + dz, s);
        t.traverse(o => { o.userData.key = key; });
        dyn.add(t);
      }
    }
    for (const key of targets) dyn.add(hl(key, 0xe7c26a, 0.45));
    if (selected && place[selected]) dyn.add(hl(place[selected], 0xffd166, 0.8));
    const me = avatarModel(avatar, watch);
    me.scale.setScalar(0.42);
    me.position.set(tileX(AVATAR_TILE[0]) + 0.25, 0.1, tileZ(AVATAR_TILE[1]));
    me.rotation.y = 0.6;
    dyn.add(me);
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
    lampMat.emissive.set(night ? "#fff3b0" : "#000000");
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
    // Bought items win over the ground; trees and the avatar are ignored so they never block a tap.
    const hit = ray.intersectObjects(items, true)[0] || ray.intersectObjects(tiles, false)[0];
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
    }
    if (selGroup) selGroup.position.y = selGroup.userData.base + 0.08 + Math.sin(t * 5) * 0.05;
    waters.forEach((w, k) => w.position.y = 0.01 + Math.sin(t * 1.2 + k) * 0.015);
    traffic.position.z = tileZ(0) + ((t * 0.8) % (N - 1));
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
