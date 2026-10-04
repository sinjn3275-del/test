// "청담 플렉스 거리": a 3D street with the shops at the entrance and lots for the
// top players along both sides. Drag (or scroll) to walk along it; tap a shop or lot.
import * as THREE from "three";
import { itemModel, windowMat, textTexture } from "./models3d.js";

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

function sign(lines, w, h, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTexture(lines, opts) }));
  return m;
}
const tag = (obj, data) => { obj.traverse(o => { o.userData.tap = data; }); return obj; };

export const SHOPS = [
  { cat: "car", name: "자동차 매장", color: "#c1121f", show: ["car-super"] },
  { cat: "watch", name: "시계 부티크", color: "#3d2b1f", show: ["watch-grand"] },
  { cat: "house", name: "플렉스 부동산", color: "#1d3557", show: ["house-tower"] },
  { cat: "special", name: "요트·전용기 라운지", color: "#264653", show: ["sp-jet"] },
];
// Everything stands in one row on the far side of the road, facing the camera.
const LOT_W = 2.6, LOTS = 16, SHOP_X0 = 3.4, LOT_X0 = SHOP_X0 + 4 * LOT_W + 0.6, ROW_Z = -2.4;
const lotPos = k => [LOT_X0 + k * LOT_W, ROW_Z];
const END_X = LOT_X0 + LOTS * LOT_W;

// Model fitted to a footprint (fits within `size` horizontally and `maxH` tall).
function fitted(id, size, maxH) {
  const m = itemModel(id);
  if (!m) return null;
  const v = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
  m.scale.multiplyScalar(Math.min(size / Math.max(v.x, v.z), maxH / v.y));
  const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3());
  m.position.x -= c.x; m.position.z -= c.z; m.position.y -= b.min.y;
  const g = new THREE.Group(); g.add(m);
  return g;
}

export function streetViewer(el, { onTap } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:pan-y";
  el.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x6b8f71, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8 });
  scene.add(sun, sun.target);

  // Ground: road along x, sidewalks, lawn.
  const len = END_X + 6;
  scene.add(box(len + 10, 0.2, 14, "#6ab88f", len / 2 - 4, -0.2, 0));
  scene.add(box(len + 10, 0.02, 2.2, "#3a3f47", len / 2 - 4, 0, 0));
  for (const z of [-1.35, 1.35]) scene.add(box(len + 10, 0.06, 0.5, "#d6d3cc", len / 2 - 4, 0, z));
  for (let x = -2; x < len; x += 1.6) scene.add(box(0.7, 0.025, 0.07, "#f1f3f5", x, 0, 0));
  const lamps = [];
  for (let x = 1; x < len; x += 4) for (const z of [-1.5, 1.5]) {
    scene.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.4, 6), "#2b2d42", x, 0.7, z));
    const bulb = mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: "#fff3b0", emissive: "#000000" }), x, 1.45, z);
    lamps.push(bulb); scene.add(bulb);
  }

  // Billboard at the entrance.
  scene.add(box(0.3, 3.0, 0.3, "#2b2d42", 0.6, 0, -3.1));
  scene.add(box(3.4, 2.0, 0.25, "#111827", 0.6, 2.2, -3.1));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), new THREE.MeshBasicMaterial({ map: textTexture(["FLEX NEWS"], { w: 640, h: 360 }) }));
  board.position.set(0.6, 3.2, -2.96); scene.add(board);
  // Trees along the near sidewalk.
  for (let x = 1.5; x < END_X + 4; x += 3.2) {
    scene.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 5), "#6b4f3a", x, 0.2, 2.2));
    scene.add(mesh(new THREE.ConeGeometry(0.35, 0.8, 6), "#40916c", x, 0.75, 2.2));
  }

  // Shops (fixed).
  SHOPS.forEach((s, k) => {
    const x = SHOP_X0 + k * LOT_W, z = ROW_Z, face = 1;
    const g = new THREE.Group();
    g.add(box(2.2, 0.05, 2.0, "#e9ecef", 0, 0, 0));
    g.add(box(2.1, 1.7, 1.2, s.color, 0, 0, -face * 0.35));
    g.add(box(1.9, 1.0, 0.04, "#a8dadc", 0, 0.15, -face * 0.35 + face * 0.61, { transparent: true, opacity: 0.55, roughness: 0.1 }));
    g.add(box(2.2, 0.08, 1.35, "#1b1b1f", 0, 1.7, -face * 0.35));
    const sg = sign([s.name], 1.9, 0.38, { w: 512, h: 104, bg: "#1b1b1f", fg: "#e7c26a", size: 56 });
    sg.position.set(0, 1.42, -face * 0.35 + face * 0.62); if (face < 0) sg.rotation.y = Math.PI; g.add(sg);
    const d = fitted(s.show[0], 1.0, 0.9);
    if (d) { d.position.set(0, 0.06, face * 0.55); d.rotation.y = 0.5; g.add(box(1.2, 0.08, 0.8, "#ced4da", 0, 0, face * 0.55)); d.position.y = 0.1; g.add(d); }
    g.position.set(x, 0, z);
    scene.add(tag(g, { type: "shop", cat: s.cat }));
  });

  // Traffic.
  const traffic = [];
  ["car-sedan", "car-sports", "car-ev"].forEach((id, k) => {
    const c = fitted(id, 0.9, 0.6);
    if (!c) return;
    c.position.set(k * 7, 0.02, k % 2 ? 0.5 : -0.5);
    c.rotation.y = k % 2 ? -Math.PI / 2 : Math.PI / 2;
    c.userData.dir = k % 2 ? -1 : 1;
    scene.add(c); traffic.push(c);
  });

  // Lots: rebuilt on update().
  let lotGroup = new THREE.Group(), treasure = null;
  scene.add(lotGroup);
  function update({ lots = [], me = null, treasureLot = -1, treasureOpen = false } = {}) {
    scene.remove(lotGroup);
    lotGroup = new THREE.Group(); treasure = null;
    for (let k = 0; k < LOTS; k++) {
      const [x, z] = lotPos(k), face = 1, p = lots[k];
      const g = new THREE.Group();
      const gold = p && p.rank <= 3;
      g.add(box(2.3, 0.08, 2.4, gold ? "#e7c26a" : p ? "#b7c4b1" : "#9aa59a", 0, 0, 0, gold ? { metalness: 0.2, roughness: 0.5 } : {}));
      if (p) {
        const house = p.house && fitted(p.house, 1.5, 2.6);
        if (house) { house.position.set(-0.25, 0.08, -face * 0.45); g.add(house); }
        const car = p.car && fitted(p.car, 0.75, 0.45);
        if (car) { car.position.set(0.55, 0.08, face * 0.6); car.rotation.y = 1.2; g.add(car); }
        const sp = p.special && fitted(p.special, 0.7, 1.2);
        if (sp) { sp.position.set(0.7, 0.08, -face * 0.5); g.add(sp); }
        if (!house && !car && !sp) g.add(mesh(new THREE.ConeGeometry(0.45, 0.6, 4), "#e07a4a", 0, 0.38, 0));
        const medal = ["🥇", "🥈", "🥉"][p.rank - 1] || `${p.rank}위`;
        const sg = sign([`${medal} ${p.nickname}${me && p.nickname === me ? " (나)" : ""}`, `${Math.round(p.worth / 1e8).toLocaleString("ko-KR")}억 · ❤️ ${p.likes || 0}`],
          1.7, 0.5, { w: 512, h: 150, bg: me && p.nickname === me ? "#3b2f0b" : "#111827", size: 50 });
        sg.position.set(0, 0.42, face * 1.22); if (face < 0) sg.rotation.y = Math.PI; g.add(sg);
        if (p.banner) {
          const bn = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture([p.banner], { w: 640, h: 128, bg: "#b8860b", fg: "#1b1b1f", size: 50 }) }));
          bn.scale.set(2.2, 0.44, 1); bn.position.set(0, 3.1, 0); g.add(bn);
          g.add(box(0.04, 3.0, 0.04, "#2b2d42", -1.05, 0, -0.9)); g.add(box(0.04, 3.0, 0.04, "#2b2d42", 1.05, 0, -0.9));
        }
        tag(g, { type: "lot", nickname: p.nickname });
      } else {
        const sg = sign(["빈 땅", "랭킹 16위 안에 들면 입주"], 1.5, 0.42, { w: 512, h: 140, bg: "#2b2d42", size: 52 });
        sg.position.set(0, 0.36, face * 1.22); if (face < 0) sg.rotation.y = Math.PI; g.add(sg);
      }
      g.add(box(0.06, 0.32, 0.06, "#2b2d42", 0, 0.08, face * 1.2));
      g.position.set(x, 0, z);
      lotGroup.add(g);
      if (k === treasureLot && !treasureOpen) {
        // Today's treasure box, on the sidewalk in front of the lot.
        const t = new THREE.Group();
        t.add(box(0.42, 0.32, 0.42, "#e63946", 0, 0, 0));
        t.add(box(0.46, 0.08, 0.46, "#c1121f", 0, 0.32, 0));
        t.add(box(0.08, 0.41, 0.44, "#ffd166", 0, 0, 0)); t.add(box(0.44, 0.41, 0.08, "#ffd166", 0, 0, 0));
        t.add(mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 12), "#ffd166", 0, 0.47, 0));
        t.position.set(x + 0.9, 0.05, -1.25);
        t.userData.spinBox = true;
        lotGroup.add(tag(t, { type: "treasure" }));
        treasure = t;
      }
    }
    scene.add(lotGroup);
  }

  // Billboard: rotates through lines.
  let lines = ["FLEX NEWS"], lineK = 0, lineAt = 0;
  function setNews(next) { lines = next.length ? next : ["FLEX NEWS"]; lineK = 0; lineAt = 0; }
  function showLine(t) {
    board.material.map?.dispose();
    board.material.map = textTexture(t.split("\n"), { w: 640, h: 360, bg: "#0b1020", size: 64 });
    board.material.needsUpdate = true;
  }

  function setNight(v) {
    const sky = v ? "#0b1430" : "#87c8f2";
    scene.background = new THREE.Color(sky);
    scene.fog = new THREE.Fog(sky, 18, 40);
    sun.intensity = v ? 0.3 : 1.5;
    hemi.intensity = v ? 0.45 : 0.95;
    windowMat.emissive.set(v ? "#ffd166" : "#000000");
    windowMat.color.set(v ? "#ffd166" : "#a8dadc");
    for (const l of lamps) l.material.emissive.set(v ? "#fff3b0" : "#000000");
  }

  // Walk along the street: horizontal drag / wheel moves the camera's x.
  let camX = 1.6, vel = 0, drag = null, moved = 0;
  const minX = -2, maxX = END_X - 1;
  const cv = renderer.domElement;
  cv.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, cx: camX }; moved = 0; vel = 0; });
  cv.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    moved = Math.max(moved, Math.abs(dx), Math.abs(e.clientY - drag.y));
    const next = drag.cx - dx * 0.02;
    vel = next - camX; camX = next;
  });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  cv.addEventListener("pointerup", e => {
    const wasTap = drag && moved < 8;
    drag = null;
    if (!wasTap) return;
    vel = 0;
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(scene.children, true).find(h => h.object.userData.tap);
    if (hit && onTap) onTap(hit.object.userData.tap);
  });
  cv.addEventListener("pointercancel", () => { drag = null; });
  cv.addEventListener("wheel", e => { camX += (e.deltaX || e.deltaY) * 0.01; e.preventDefault(); }, { passive: false });

  function resize() {
    const w = el.clientWidth || 300, h = el.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const clock = new THREE.Clock();
  let raf = 0;
  const loop = () => {
    const t = clock.getElapsedTime(), dt = Math.min(clock.getDelta(), 0.05);
    if (!drag) { camX += vel; vel *= 0.92; }
    camX = Math.max(minX, Math.min(maxX, camX));
    const back = camera.aspect < 0.8 ? 8.5 : 6.5;
    camera.position.set(camX, back * 0.62, back);
    camera.lookAt(camX, 0.9, -1.8);
    sun.position.set(camX + 6, 12, 6); sun.target.position.set(camX, 0, 0);
    if (treasure) { treasure.rotation.y = t * 1.5; treasure.position.y = 0.05 + Math.abs(Math.sin(t * 3)) * 0.15; }
    for (const c of traffic) { c.position.x += c.userData.dir * 0.03; if (c.position.x > END_X + 3) c.position.x = -3; if (c.position.x < -3) c.position.x = END_X + 3; }
    if (t - lineAt > 4 || lineAt === 0) { showLine(lines[lineK % lines.length]); lineK++; lineAt = t || 0.001; }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(loop);
    void dt;
  };
  return {
    update, setNews, setNight, resize,
    goTo(x) { camX = x; vel = 0; },
    lotX: k => lotPos(k)[0],
    start() { if (!raf) { resize(); raf = requestAnimationFrame(loop); } },
    stop() { cancelAnimationFrame(raf); raf = 0; },
  };
}
