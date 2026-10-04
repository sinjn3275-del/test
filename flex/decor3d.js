// Landscaping and statues placed on my town tiles (조경·조각상). Several of each can be bought.
// Prices must match flex_decor_item() in supabase/flex-decor.sql.
import * as THREE from "three";
import { avatarModel } from "./avatar3d.js";

export const DECOR = [
  { id: "flowerbed", cat: "garden", name: "꽃밭", icon: "🌷", price: 2_000_000 },
  { id: "bench", cat: "garden", name: "벤치", icon: "🪑", price: 1_000_000 },
  { id: "lamp", cat: "garden", name: "정원 가로등", icon: "💡", price: 3_000_000 },
  { id: "tree-pine", cat: "garden", name: "소나무", icon: "🌲", price: 3_000_000 },
  { id: "tree-maple", cat: "garden", name: "단풍나무", icon: "🍁", price: 6_000_000 },
  { id: "tree-cherry", cat: "garden", name: "벚꽃나무", icon: "🌸", price: 8_000_000 },
  { id: "tree-palm", cat: "garden", name: "야자수", icon: "🌴", price: 12_000_000 },
  { id: "well", cat: "garden", name: "우물", icon: "🪣", price: 20_000_000 },
  { id: "fountain", cat: "garden", name: "작은 분수", icon: "⛲", price: 50_000_000 },
  { id: "pond", cat: "garden", name: "연못", icon: "🪷", price: 100_000_000 },
  { id: "fountain-grand", cat: "garden", name: "대형 분수대", icon: "⛲", price: 300_000_000 },
  { id: "statue-lion", cat: "statue", name: "돌 사자상", icon: "🦁", price: 100_000_000 },
  { id: "statue-angel", cat: "statue", name: "천사상", icon: "👼", price: 300_000_000 },
  { id: "statue-horse", cat: "statue", name: "청동 기마상", icon: "🐎", price: 500_000_000 },
  { id: "statue-gold", cat: "statue", name: "황금 여신상", icon: "🏆", price: 1_000_000_000 },
  { id: "statue-me", cat: "statue", name: "내 캐릭터 황금 동상", icon: "✨", price: 3_000_000_000 },
];
export const DECOR_BY_ID = Object.fromEntries(DECOR.map(d => [d.id, d]));

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
const box = (w, h, d, c, x = 0, y = 0, z = 0, extra) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, extra);
const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 8, extra) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y + h / 2, z, extra);
const ball = (r, c, x, y, z, extra) => mesh(new THREE.IcosahedronGeometry(r, 0), c, x, y, z, extra);
const GOLD = { metalness: 0.35, roughness: 0.35, emissive: "#6b4e12" };
const BRONZE = { metalness: 0.3, roughness: 0.5 };
const waterMat = () => mat("#5fd3f3", { transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.1 });

function pedestal(g, w = 0.5, h = 0.18, c = "#d6d0c4") {
  g.add(box(w, h, w, c));
  g.add(box(w * 0.84, 0.04, w * 0.84, c, 0, h));
  return h + 0.04;
}

// Spray of water drops that the town loop animates via userData.tick.
function spray(g, y, r, n = 6) {
  const s = new THREE.Group();
  for (let k = 0; k < n; k++) {
    const d = ball(0.035, waterMat(), Math.cos(k / n * Math.PI * 2) * r, 0, Math.sin(k / n * Math.PI * 2) * r);
    d.castShadow = false; s.add(d);
  }
  s.position.y = y;
  g.userData.tick = t => s.children.forEach((d, k) => { d.position.y = Math.abs(Math.sin(t * 3 + k)) * 0.12; });
  g.add(s);
}

function tree(kind) {
  const g = new THREE.Group();
  const trunk = c => g.add(cyl(0.045, 0.07, 0.34, c || "#6b4f3a", 0, 0, 0, 6));
  if (kind === "pine") {
    trunk();
    g.add(mesh(new THREE.ConeGeometry(0.3, 0.45, 7), "#2d6a4f", 0, 0.48, 0));
    g.add(mesh(new THREE.ConeGeometry(0.23, 0.38, 7), "#40916c", 0, 0.7, 0));
    g.add(mesh(new THREE.ConeGeometry(0.15, 0.3, 7), "#52b788", 0, 0.9, 0));
  } else if (kind === "palm") {
    const t = cyl(0.04, 0.06, 0.8, "#a0794f", 0, 0, 0, 6); t.rotation.z = 0.12; g.add(t);
    for (let k = 0; k < 6; k++) {
      const leaf = box(0.5, 0.02, 0.12, "#3a9a4a", 0, 0, 0);
      const pivot = new THREE.Group(); pivot.position.set(0.09, 0.82, 0); pivot.rotation.y = k / 6 * Math.PI * 2;
      leaf.position.x = 0.22; leaf.rotation.z = -0.45; pivot.add(leaf); g.add(pivot);
    }
    g.add(ball(0.05, "#7a5230", 0.1, 0.8, 0.04));
  } else {
    trunk();
    const [a, b] = kind === "cherry" ? ["#f7a8c4", "#ffc8dd"] : ["#e85d2f", "#f4a259"];
    g.add(ball(0.3, a, 0, 0.6, 0));
    g.add(ball(0.2, b, 0.15, 0.75, 0.08));
    g.add(ball(0.18, b, -0.14, 0.7, -0.1));
  }
  return g;
}

function lion(c, extra) {
  const g = new THREE.Group();
  g.add(box(0.36, 0.16, 0.16, c, 0, 0, 0, extra));                 // body
  g.add(box(0.06, 0.12, 0.06, c, -0.13, -0.1, 0.05, extra));
  g.add(box(0.06, 0.12, 0.06, c, 0.13, -0.1, 0.05, extra));
  g.add(ball(0.12, c, 0.2, 0.2, 0, extra));                        // mane
  g.add(box(0.1, 0.08, 0.1, c, 0.29, 0.13, 0, extra));             // snout
  return g;
}

function horse(c, extra) {
  const g = new THREE.Group();
  g.add(box(0.36, 0.14, 0.13, c, 0, 0.22, 0, extra));
  for (const [x, z] of [[-0.13, -0.04], [-0.13, 0.04], [0.13, -0.04], [0.13, 0.04]]) g.add(box(0.04, 0.22, 0.04, c, x, 0, z, extra));
  const neck = box(0.08, 0.24, 0.08, c, 0, 0, 0, extra); neck.position.set(0.18, 0.36, 0); neck.rotation.z = -0.5; g.add(neck);
  g.add(box(0.16, 0.07, 0.07, c, 0.3, 0.45, 0, extra));
  g.add(box(0.1, 0.18, 0.1, c, -0.02, 0.36, 0, extra));             // rider
  g.add(ball(0.06, c, -0.02, 0.6, 0, extra));
  return g;
}

function figure(c, extra, wings) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.ConeGeometry(0.13, 0.4, 7), c, 0, 0.2, 0, extra));     // robe
  g.add(ball(0.07, c, 0, 0.47, 0, extra));                                     // head
  if (wings) for (const s of [1, -1]) { const w = box(0.04, 0.24, 0.2, c, 0, 0, 0, extra); w.position.set(-0.06, 0.3, s * 0.12); w.rotation.x = s * 0.5; g.add(w); }
  else { const arm = box(0.04, 0.24, 0.04, c, 0, 0, 0, extra); arm.position.set(0.02, 0.5, 0.1); g.add(arm); g.add(ball(0.05, c, 0.02, 0.76, 0.1, extra)); }   // torch
  return g;
}

// avatar: dress-up config, used by the golden statue of my own character.
export function decorModel(id, { avatar = {} } = {}) {
  const g = new THREE.Group();
  switch (id) {
    case "flowerbed": {
      g.add(box(0.7, 0.08, 0.5, "#7f5539"));
      g.add(box(0.64, 0.03, 0.44, "#3d2b1f", 0, 0.08));
      const cs = ["#ff6b8b", "#ffd166", "#ffffff", "#c77dff"];
      for (let k = 0; k < 12; k++) {
        const x = -0.26 + (k % 4) * 0.17, z = -0.15 + Math.floor(k / 4) * 0.15;
        g.add(cyl(0.008, 0.008, 0.1, "#2d6a4f", x, 0.1, z, 4));
        g.add(ball(0.04, cs[k % 4], x, 0.22, z));
      }
      break;
    }
    case "bench":
      g.add(box(0.6, 0.04, 0.2, "#a0632f", 0, 0.17));
      g.add(box(0.6, 0.16, 0.04, "#a0632f", 0, 0.21, -0.09));
      for (const x of [-0.25, 0.25]) g.add(box(0.04, 0.17, 0.18, "#343a40", x));
      break;
    case "lamp":
      g.add(cyl(0.025, 0.035, 0.8, "#2b2d42", 0, 0, 0, 6));
      g.add(box(0.12, 0.14, 0.12, "#2b2d42", 0, 0.8));
      g.add(mesh(new THREE.BoxGeometry(0.09, 0.1, 0.09), mat("#fff3b0", { emissive: "#ffd166", emissiveIntensity: 0.6 }), 0, 0.87, 0));
      break;
    case "tree-pine": return tree("pine");
    case "tree-maple": return tree("maple");
    case "tree-cherry": return tree("cherry");
    case "tree-palm": return tree("palm");
    case "well":
      g.add(cyl(0.26, 0.28, 0.24, "#9a9a9a", 0, 0, 0, 10));
      g.add(mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 10), waterMat(), 0, 0.2, 0));
      for (const x of [-0.24, 0.24]) g.add(box(0.04, 0.42, 0.04, "#7a5230", x, 0.24));
      { const roof = mesh(new THREE.ConeGeometry(0.4, 0.2, 4), "#9b2226", 0, 0.76, 0); roof.rotation.y = Math.PI / 4; g.add(roof); }
      g.add(box(0.48, 0.03, 0.03, "#7a5230", 0, 0.6));
      g.add(box(0.07, 0.08, 0.07, "#6b4f3a", 0, 0.42));
      break;
    case "fountain":
      g.add(cyl(0.34, 0.36, 0.14, "#d6d0c4", 0, 0, 0, 12));
      g.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 12), waterMat(), 0, 0.13, 0));
      g.add(cyl(0.05, 0.07, 0.34, "#d6d0c4", 0, 0.14, 0, 8));
      g.add(cyl(0.14, 0.1, 0.05, "#d6d0c4", 0, 0.46, 0, 10));
      spray(g, 0.52, 0.1);
      break;
    case "pond":
      g.add(cyl(0.44, 0.46, 0.06, "#8d8d8d", 0, 0, 0, 14));
      g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.02, 14), waterMat(), 0, 0.055, 0));
      for (const [x, z] of [[0.15, 0.1], [-0.12, -0.14], [-0.2, 0.15]]) {
        g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.01, 8), "#52b788", x, 0.07, z));
        g.add(ball(0.03, "#ffafcc", x, 0.09, z));
      }
      { const fish = box(0.08, 0.03, 0.04, "#ff7b00", 0.05, 0.06, -0.05); g.add(fish); g.userData.tick = t => { fish.position.x = Math.cos(t) * 0.18; fish.position.z = Math.sin(t) * 0.18; fish.rotation.y = -t; }; }
      break;
    case "fountain-grand":
      g.add(cyl(0.46, 0.48, 0.14, "#ece7df", 0, 0, 0, 16, { roughness: 0.4 }));
      g.add(mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.02, 16), waterMat(), 0, 0.13, 0));
      g.add(cyl(0.06, 0.09, 0.3, "#ece7df", 0, 0.14, 0, 10));
      g.add(cyl(0.24, 0.16, 0.06, "#ece7df", 0, 0.42, 0, 12));
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 12), waterMat(), 0, 0.48, 0));
      g.add(cyl(0.04, 0.05, 0.2, "#ece7df", 0, 0.48, 0, 8));
      g.add(ball(0.06, "#e9c46a", 0, 0.72, 0, GOLD));
      spray(g, 0.62, 0.17, 8);
      break;
    case "statue-lion": { const y = pedestal(g); const l = lion("#bfb8ab"); l.position.y = y + 0.16; g.add(l); break; }
    case "statue-angel": { const y = pedestal(g, 0.46, 0.2, "#ece7df"); const f = figure("#f5f3ee", { roughness: 0.5 }, true); f.position.y = y; g.add(f); break; }
    case "statue-horse": { const y = pedestal(g, 0.56, 0.22, "#8d8d8d"); const h = horse("#a8743f", BRONZE); h.position.y = y; g.add(h); break; }
    case "statue-gold": { const y = pedestal(g, 0.48, 0.22, "#2b2d42"); const f = figure("#e9c46a", GOLD, false); f.scale.setScalar(1.25); f.position.y = y; g.add(f); break; }
    case "statue-me": {
      const y = pedestal(g, 0.56, 0.24, "#2b2d42");
      const me = avatarModel(avatar);
      const gold = mat("#e9c46a", GOLD);
      me.traverse(o => { if (o.isMesh) o.material = gold; });
      me.scale.setScalar(0.42);
      me.position.y = y;
      g.add(me);
      break;
    }
    default: return null;
  }
  return g;
}
