// Low-poly 3D avatar with a dress-up config, plus a 360° viewer with a city backdrop.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Option lists: id → { name, ... }. The first option of each part is the default.
export const PARTS = [
  { id: "hair", name: "머리", opts: [
    { id: "short", name: "댄디컷" }, { id: "long", name: "긴 생머리" }, { id: "bob", name: "단발" },
    { id: "buzz", name: "반삭" }, { id: "mohawk", name: "모히칸" }, { id: "pony", name: "포니테일" } ] },
  { id: "hairColor", name: "머리색", opts: [
    { id: "#1b1b1f", name: "흑발" }, { id: "#5a3825", name: "브라운" }, { id: "#d9b16a", name: "금발" },
    { id: "#c0c4cc", name: "애쉬 실버" }, { id: "#e05a8a", name: "핑크" }, { id: "#3a6df0", name: "블루" } ] },
  { id: "skin", name: "피부", opts: [
    { id: "#f6d7c3", name: "밝은" }, { id: "#eec1a0", name: "보통" }, { id: "#d29b72", name: "구릿빛" },
    { id: "#a86b4a", name: "브론즈" }, { id: "#6e4430", name: "딥" } ] },
  { id: "top", name: "상의", opts: [
    { id: "tee", name: "흰 티셔츠", color: "#f1f3f6" }, { id: "hoodie", name: "후드티", color: "#2f3e5c" },
    { id: "shirt", name: "셔츠", color: "#9ec5f8" }, { id: "suit", name: "맞춤 정장", color: "#1c2230" },
    { id: "gold", name: "골드 재킷", color: "#d4af37" }, { id: "red", name: "레드 니트", color: "#c8323c" } ] },
  { id: "bottom", name: "하의", opts: [
    { id: "jeans", name: "청바지", color: "#3d5a8a" }, { id: "slacks", name: "슬랙스", color: "#24272e" },
    { id: "chino", name: "베이지 치노", color: "#c8b48a" }, { id: "shorts", name: "반바지", color: "#5d6b4f" },
    { id: "skirt", name: "스커트", color: "#2b2b33" }, { id: "white", name: "화이트 팬츠", color: "#eceef2" } ] },
  { id: "shoes", name: "신발", opts: [
    { id: "sneak", name: "흰 스니커즈", color: "#f4f5f7" }, { id: "black", name: "블랙 로퍼", color: "#16171b" },
    { id: "boots", name: "부츠", color: "#6b4a2f" }, { id: "red", name: "레드 하이탑", color: "#d1343e" },
    { id: "gold", name: "골드 스니커즈", color: "#d4af37" } ] },
  { id: "acc", name: "액세서리", opts: [
    { id: "none", name: "없음" }, { id: "shades", name: "선글라스" }, { id: "cap", name: "볼캡" },
    { id: "chain", name: "금목걸이" }, { id: "earring", name: "다이아 귀걸이" }, { id: "headset", name: "헤드폰" } ] },
];
export const DEFAULT_AVATAR = Object.fromEntries(PARTS.map(p => [p.id, p.opts[0].id]));
const opt = (part, id) => { const p = PARTS.find(x => x.id === part); return p.opts.find(o => o.id === id) || p.opts[0]; };

const mats = {};
const mat = (c, extra = {}) => {
  const k = c + JSON.stringify(extra);
  return mats[k] || (mats[k] = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.8, ...extra }));
};
function mesh(geo, color, x = 0, y = 0, z = 0, extra) {
  const m = new THREE.Mesh(geo, mat(color, extra));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
// Box whose bottom sits at y.
const box = (w, h, d, c, x, y, z, extra) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, extra);
const shade = (hex, f) => "#" + new THREE.Color(hex).multiplyScalar(f).getHexString();
// Low metalness: with no environment map, very metallic surfaces render almost black.
const GOLD = { metalness: 0.3, roughness: 0.35 };

// About 1.8 units tall, facing +z, feet on y = 0. `watch` is a color or null.
export function avatarModel(cfg, watch) {
  const c = { ...DEFAULT_AVATAR, ...cfg };
  const skin = opt("skin", c.skin).id, hairC = opt("hairColor", c.hairColor).id;
  const top = opt("top", c.top), bottom = opt("bottom", c.bottom), shoe = opt("shoes", c.shoes);
  const g = new THREE.Group();

  // Shoes
  for (const s of [1, -1]) {
    const tall = shoe.id === "boots" || shoe.id === "red";
    g.add(box(0.15, tall ? 0.16 : 0.09, 0.27, shoe.color, s * 0.11, 0, 0.03));
    g.add(box(0.152, 0.02, 0.272, shoe.id === "black" ? "#16171b" : "#e9eaee", s * 0.11, 0, 0.03));   // sole
  }
  // Legs / bottoms
  const legTop = 0.9;
  for (const s of [1, -1]) {
    if (bottom.id === "shorts") {
      g.add(box(0.13, 0.42, 0.14, skin, s * 0.11, 0.08, 0));
      g.add(box(0.16, 0.32, 0.17, bottom.color, s * 0.11, 0.5, 0));
    } else if (bottom.id === "skirt") {
      g.add(box(0.12, 0.6, 0.13, skin, s * 0.11, 0.08, 0));
    } else {
      g.add(box(0.15, legTop - 0.08, 0.16, bottom.color, s * 0.11, 0.08, 0));
    }
  }
  if (bottom.id === "skirt") {
    const sk = mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.36, 8), bottom.color, 0, 0.72, 0);
    sk.scale.z = 0.7; g.add(sk);
  }
  g.add(box(0.38, 0.1, 0.2, bottom.id === "skirt" ? bottom.color : bottom.color, 0, legTop - 0.04, 0));   // hips
  if (bottom.id !== "skirt") g.add(box(0.385, 0.03, 0.205, "#2a2219", 0, legTop + 0.02, 0));             // belt

  // Torso
  const tY = legTop + 0.04, tH = 0.5;
  g.add(box(0.42, tH, 0.22, top.color, 0, tY, 0, top.id === "gold" ? GOLD : {}));
  if (top.id === "suit") {
    g.add(box(0.12, tH - 0.05, 0.01, "#f4f5f7", 0, tY + 0.05, 0.111));
    g.add(box(0.04, tH - 0.12, 0.012, "#8a1c26", 0, tY + 0.1, 0.116));
  }
  if (top.id === "shirt") for (let k = 0; k < 4; k++) g.add(box(0.015, 0.015, 0.01, "#ffffff", 0, tY + 0.08 + k * 0.1, 0.112));
  if (top.id === "hoodie") {
    g.add(box(0.3, 0.14, 0.1, shade(top.color, 0.85), 0, tY + tH - 0.08, -0.13));                          // hood
    g.add(box(0.22, 0.12, 0.01, shade(top.color, 0.85), 0, tY + 0.06, 0.112));                              // pocket
  }
  if (top.id === "red") g.add(box(0.43, 0.04, 0.225, shade(top.color, 0.8), 0, tY, 0));
  // Arms
  const shortSleeve = top.id === "tee";
  for (const s of [1, -1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.27, tY + tH - 0.04, 0);
    arm.rotation.z = s * 0.08;
    const sleeveLen = shortSleeve ? 0.18 : 0.42;
    arm.add(box(0.11, sleeveLen, 0.12, top.color, 0, -sleeveLen, 0, top.id === "gold" ? GOLD : {}));
    if (shortSleeve) arm.add(box(0.095, 0.24, 0.1, skin, 0, -0.42, 0));
    arm.add(box(0.09, 0.09, 0.1, skin, 0, -0.51, 0));                                                       // hand
    if (s === -1 && watch) {
      arm.add(box(0.115, 0.05, 0.125, "#22252b", 0, -0.43, 0));                                            // strap
      arm.add(box(0.1, 0.085, 0.03, watch, 0, -0.447, 0.065, { ...GOLD, emissive: watch, emissiveIntensity: 0.25 }));  // case
      arm.add(box(0.065, 0.055, 0.01, "#f4f1e8", 0, -0.432, 0.082));                                         // dial
    }
    g.add(arm);
  }

  // Neck + head
  const nY = tY + tH;
  g.add(box(0.1, 0.06, 0.1, skin, 0, nY, 0));
  const hY = nY + 0.06, H = 0.3;
  const head = box(0.3, H, 0.28, skin, 0, hY, 0);
  g.add(head);
  for (const s of [1, -1]) {
    g.add(box(0.04, 0.045, 0.01, "#1b1b1f", s * 0.065, hY + 0.13, 0.141));                                  // eyes
    g.add(box(0.05, 0.012, 0.01, hairC, s * 0.065, hY + 0.185, 0.141));                                     // brows
    g.add(box(0.03, 0.06, 0.06, shade(skin, 0.92), s * 0.16, hY + 0.1, 0));                                 // ears
  }
  g.add(box(0.08, 0.015, 0.01, "#b5525c", 0, hY + 0.06, 0.141));                                            // mouth

  // Hair
  const top0 = hY + H;
  const hair = (w, h, d, x, y, z) => g.add(box(w, h, d, hairC, x, y, z));
  switch (c.hair) {
    case "buzz": hair(0.31, 0.03, 0.29, 0, top0 - 0.01, 0); break;
    case "mohawk": hair(0.06, 0.14, 0.26, 0, top0 - 0.02, -0.01); break;
    case "long": hair(0.33, 0.07, 0.31, 0, top0 - 0.02, 0); hair(0.33, 0.42, 0.06, 0, hY - 0.14, -0.14);
      for (const s of [1, -1]) hair(0.03, 0.34, 0.2, s * 0.165, hY - 0.06, -0.03); break;
    case "bob": hair(0.33, 0.07, 0.31, 0, top0 - 0.02, 0); hair(0.33, 0.22, 0.06, 0, hY + 0.03, -0.14);
      for (const s of [1, -1]) hair(0.03, 0.22, 0.24, s * 0.165, hY + 0.03, -0.01); break;
    case "pony": hair(0.32, 0.06, 0.3, 0, top0 - 0.02, 0); hair(0.32, 0.18, 0.04, 0, hY + 0.12, -0.15);
      hair(0.08, 0.3, 0.08, 0, hY - 0.12, -0.19); break;
    default: hair(0.32, 0.07, 0.3, 0, top0 - 0.02, 0); hair(0.32, 0.14, 0.04, 0, hY + 0.16, -0.15);
      hair(0.32, 0.05, 0.06, 0, top0 - 0.06, 0.12);                                                         // fringe
  }

  // Accessories
  switch (c.acc) {
    case "shades":
      for (const s of [1, -1]) g.add(box(0.1, 0.06, 0.012, "#0d0e12", s * 0.065, hY + 0.115, 0.148, { metalness: 0.6, roughness: 0.2 }));
      g.add(box(0.3, 0.012, 0.012, "#0d0e12", 0, hY + 0.155, 0.148)); break;
    case "cap":
      g.add(box(0.33, 0.1, 0.31, "#1d3557", 0, top0 - 0.02, 0)); g.add(box(0.3, 0.02, 0.14, "#1d3557", 0, top0 - 0.02, 0.2)); break;
    case "chain": {
      const ch = mesh(new THREE.TorusGeometry(0.1, 0.012, 4, 12), "#d4af37", 0, nY - 0.06, 0.08, GOLD);
      ch.rotation.x = Math.PI / 2.4; g.add(ch);
      g.add(box(0.04, 0.05, 0.015, "#d4af37", 0, nY - 0.17, 0.12, GOLD)); break;
    }
    case "earring":
      for (const s of [1, -1]) g.add(mesh(new THREE.OctahedronGeometry(0.022), "#eaf6ff", s * 0.17, hY + 0.05, 0, { metalness: 0.3, roughness: 0.05, emissive: "#88c8ff", emissiveIntensity: 0.4 })); break;
    case "headset":
      g.add(box(0.36, 0.03, 0.05, "#22252b", 0, top0 + 0.02, 0));
      for (const s of [1, -1]) g.add(box(0.05, 0.12, 0.1, "#e63946", s * 0.18, hY + 0.06, 0)); break;
  }
  return g;
}

// ---------- 360° viewer ----------
export function avatarViewer(el) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none";
  el.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(1.6, 1.5, 3.6);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.0, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 2;
  controls.maxDistance = 6;
  controls.minPolarAngle = 0.5;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.addEventListener("start", () => { controls.autoRotate = false; });

  const hemi = new THREE.HemisphereLight(0xffffff, 0x445066, 1.0);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(3, 6, 4); key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1 });
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);

  // Backdrop: rooftop stage with a city skyline around it.
  const back = new THREE.Group();
  scene.add(back);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.12, 24), mat("#3b4258"));
  deck.position.y = -0.06; deck.receiveShadow = true; back.add(deck);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.03, 4, 48), mat("#d4af37", { ...GOLD, emissive: "#6b5310", emissiveIntensity: 0.5 }));
  ring.rotation.x = Math.PI / 2; back.add(ring);
  const winMat = mat("#ffd166", { emissive: "#ffb703", emissiveIntensity: 0.0 });
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let k = 0; k < 26; k++) {
    const a = (k / 26) * Math.PI * 2, r = 8 + rnd() * 5, w = 0.9 + rnd() * 1.2, h = 2 + rnd() * 7;
    const b = new THREE.Group();
    b.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat(["#2b3350", "#34405f", "#1f2740", "#3d4a6b"][k % 4])));
    b.children[0].position.y = h / 2 - 1.5;
    for (let f = 0; f < Math.floor(h / 0.8); f++) if (rnd() > 0.35) {
      const wv = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.18, 0.02), winMat);
      wv.position.set(0, f * 0.8 - 1.1, w / 2 + 0.01); b.add(wv);
    }
    b.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    b.lookAt(0, 0, 0);
    back.add(b);
  }

  const night = (() => { const h = new Date(Date.now() + 9 * 3600_000).getUTCHours(); return h >= 19 || h < 6; })();
  const sky = night ? "#0e1530" : "#7fb8e6";
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, 7, 20);
  winMat.emissiveIntensity = night ? 0.9 : 0.0;
  if (!night) winMat.color.set("#a8dadc");
  key.intensity = night ? 1.2 : 2.0;
  hemi.intensity = night ? 0.6 : 1.0;

  let model = null;
  function set(cfg, watch) {
    if (model) scene.remove(model);
    model = avatarModel(cfg, watch);
    scene.add(model);
  }
  function resize() {
    const w = el.clientWidth || 300, h = el.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  let raf = 0;
  const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
  return {
    set,
    start() { if (!raf) { if (!el.contains(renderer.domElement)) el.replaceChildren(renderer.domElement); resize(); raf = requestAnimationFrame(loop); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    resize,
  };
}

// Small still portrait for the header banner (shares one offscreen context).
let thumb = null;
export function avatarThumb(cfg, watch, size = 96) {
  if (!thumb) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.3));
    const d = new THREE.DirectionalLight(0xffffff, 1.8); d.position.set(2, 3, 4); scene.add(d);
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
    camera.position.set(0.5, 1.75, 1.9); camera.lookAt(0, 1.52, 0);
    thumb = { renderer, scene, camera, model: null };
  }
  const t = thumb;
  if (t.model) t.scene.remove(t.model);
  t.model = avatarModel(cfg, watch);
  t.model.rotation.y = 0.25;
  t.scene.add(t.model);
  t.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  t.renderer.setSize(size, size, false);
  t.renderer.render(t.scene, t.camera);
  return t.renderer.domElement.toDataURL("image/png");
}
