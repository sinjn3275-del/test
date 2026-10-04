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
// Mesh rotated to lie flat (for rings).
const flat = m => { m.rotation.x = Math.PI / 2; return m; };
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

export const CAR_COLORS = {
  "car-mini": "#7fd1ae", "car-sedan": "#c9d3e0", "car-ev": "#eef1f5", "car-suv": "#3a4a55", "car-classic": "#2a9d8f",
  "car-sports": "#e63946", "car-super": "#ffb703", "car-limo": "#15171c", "car-offroad": "#6b705c", "car-hyper": "#2b2f38",
};

// Car facing +z, wheels on y = 0, about 1 unit long.
export function carModel(id) {
  const color = CAR_COLORS[id];
  if (!color) return null;
  const v = id.split("-")[1];
  const paint = { metalness: 0.45, roughness: 0.35 };
  const glass = { metalness: 0.6, roughness: 0.15 };
  const g = new THREE.Group();
  const L = { mini: 0.62, sedan: 0.9, ev: 0.94, suv: 0.92, classic: 0.88, sports: 0.92, super: 0.98, limo: 1.4, offroad: 1.0, hyper: 1.02 }[v];
  const W = { mini: 0.38, sedan: 0.42, ev: 0.45, suv: 0.46, classic: 0.42, sports: 0.44, super: 0.48, limo: 0.44, offroad: 0.52, hyper: 0.5 }[v];
  const r = v === "offroad" ? 0.13 : v === "suv" ? 0.11 : v === "mini" ? 0.075 : 0.085;   // wheel radius
  const tall = v === "suv" || v === "offroad";
  const h = L / 2;
  // Body + cabin silhouettes, rear (-h) to front (+h).
  const shapes = {
    mini:   [[-h, .07], [h, .07], [h, .2], [h - .1, .24], [h - .17, .38], [-h + .06, .39], [-h, .3]],
    sedan:  [[-h, .07], [h, .07], [h, .19], [h - .2, .23], [h - .34, .36], [-h + .24, .36], [-h + .1, .25], [-h, .23]],
    suv:    [[-h, .09], [h, .09], [h, .27], [h - .14, .31], [h - .25, .48], [-h + .03, .48], [-h, .42]],
    sports: [[-h, .07], [h, .07], [h, .14], [h - .26, .19], [h - .44, .3], [-h + .22, .29], [-h + .04, .19], [-h, .18]],
    super:  [[-h, .06], [h, .06], [h, .11], [h - .3, .17], [h - .47, .27], [-h + .3, .25], [-h + .02, .17], [-h, .17]],
    hyper:  [[-h, .05], [h, .05], [h, .1], [h - .32, .16], [h - .5, .25], [-h + .34, .23], [-h + .02, .16], [-h, .16]],
    ev:     [[-h, .07], [h, .07], [h, .17], [h - .22, .22], [h - .4, .34], [-h + .2, .33], [-h + .03, .22], [-h, .21]],
    limo:   [[-h, .07], [h, .07], [h, .19], [h - .2, .23], [h - .32, .35], [-h + .2, .35], [-h + .08, .25], [-h, .23]],
    classic:[[-h, .07], [h, .07], [h, .18], [h - .28, .2], [-h + .06, .2], [-h, .19]],
    offroad:[[-h, .12], [h, .12], [h, .3], [h - .12, .33], [h - .22, .52], [-h + .04, .52], [-h, .46]],
  }[v];
  g.add(profile(shapes, W, color, paint));
  // Glass band: same silhouette, slightly narrower and taller-trimmed, only the cabin part.
  const cab = v === "classic" ? [] : shapes.filter(([, y]) => y > (tall ? .3 : .17));
  if (cab.length >= 2) {
    const zs = cab.map(p => p[0]), top = Math.max(...cab.map(p => p[1]));
    const z0 = Math.min(...zs) + .03, z1 = Math.max(...zs) - .03, yb = top - (tall ? .14 : .1);
    g.add(profile([[z0, yb], [z1, yb], [z1 - .04, top - .015], [z0 + .03, top - .015]], W + 0.004, "#1e2b3d", glass));
  }
  // Wheels with rims.
  const rim = v === "hyper" || v === "super" ? "#d4af37" : v === "offroad" ? "#22252b" : "#ced4da";
  const axles = v === "offroad" ? [h - .2, -h + .45, -h + .2] : v === "limo" ? [h - .18, -h + .18] : [h - .18 * L / .9, -h + .17 * L / .9];
  for (const z of axles) for (const s of [1, -1]) {
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
  if (v === "offroad") {
    g.add(box(W * .9, .03, L * .5, "#22252b", 0, .52, -.05));                                          // roof rack
    for (let k = 0; k < 4; k++) g.add(box(.05, .03, .03, "#fff8d6", -W * .3 + k * W * .2, .55, h - .26, { emissive: "#fff3b0", emissiveIntensity: .5 }));
    const spare = mesh(new THREE.CylinderGeometry(.1, .1, .06, 10), "#15171c", 0, .3, -h - .03);
    spare.rotation.x = Math.PI / 2; g.add(spare);
  }
  if (v === "classic") {
    g.add(box(W - .04, .1, .02, "#a8dadc", 0, .2, h - .3, { transparent: true, opacity: .6 }));     // windshield
    for (const s of [1, -1]) g.add(box(.14, .12, .12, "#7f5539", s * .1, .17, -.02));                // seats
    g.add(box(W + .006, .015, L * .9, "#f1f3f6", 0, .14, 0));                                          // white stripe
  }
  if (v === "limo") g.add(box(W + .006, .012, L * .95, "#c0c4cc", 0, .2, 0, { metalness: .6, roughness: .3 }));
  if (v === "ev") g.add(box(W - .06, .015, .01, "#9ec5ff", 0, .155, h + .003, { emissive: "#9ec5ff", emissiveIntensity: .8 }));
  if (v === "sports" || v === "super" || v === "hyper") g.add(box(W + .02, .02, .07, "#14161b", 0, shapes[shapes.length - 1][1] + .06, -h + .05));
  if (v === "super" || v === "hyper") for (const s of [1, -1]) g.add(box(.02, .06, .02, "#14161b", s * W * .35, shapes[shapes.length - 1][1], -h + .05));
  if (v === "hyper") g.add(box(.05, .003, L * .92, "#d4af37", 0, shapes[shapes.length - 2][1] + .002, 0, { metalness: .8, roughness: .25 }));
  return g;
}

// Text on a canvas, as a texture.
export function textTexture(lines, { w = 512, h = 128, bg = "#111827", fg = "#ffffff", accent = "#e7c26a", size = 44 } = {}) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.textAlign = "center"; g.textBaseline = "middle";
  const font = '"Apple SD Gothic Neo","Noto Sans KR",sans-serif';
  lines.forEach((t, k) => {
    const s = k === 0 ? size : size * 0.62;
    g.font = `${k === 0 ? 800 : 600} ${s}px ${font}`;
    g.fillStyle = k === 0 ? fg : accent;
    let txt = t;
    while (g.measureText(txt).width > w - 24 && txt.length > 2) txt = txt.slice(0, -2) + "…";
    g.fillText(txt, w / 2, h / 2 + (k - (lines.length - 1) / 2) * size * 0.95);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
// ---------- Houses, specials, watches ----------
export const windowMat = mat("#a8dadc", { emissive: "#000000" });
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

export function itemModel(id) {
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
      g.add(flat(mesh(new THREE.TorusGeometry(0.25, 0.02, 4, 16), "#f8f9fa", 0, 0.04, 0)));
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
    // ----- added items -----
    case "house-hanok": {
      g.add(box(0.95, 0.04, 0.95, "#c9b79c"));                                      // yard
      g.add(box(0.12, 0.25, 0.95, "#e9e2d0", -0.42, 0.04, 0)); g.add(box(0.95, 0.25, 0.08, "#e9e2d0", 0, 0.04, -0.44)); // walls
      g.add(box(0.7, 0.12, 0.45, "#8d6e4f", 0, 0.04, 0));                            // stone base
      g.add(box(0.62, 0.32, 0.38, "#f1e9d8", 0, 0.16, 0));
      for (const x of [-0.27, -0.09, 0.09, 0.27]) g.add(box(0.03, 0.32, 0.03, "#7f4f24", x, 0.16, 0.19));
      const roof = mesh(new THREE.ConeGeometry(0.62, 0.3, 4), "#3d405b", 0, 0.62, 0);
      roof.rotation.y = Math.PI / 4; roof.scale.set(1.25, 1, 0.85); g.add(roof);
      g.add(box(0.86, 0.04, 0.56, "#3d405b", 0, 0.47, 0)); break;
    }
    case "house-poolvilla":
      g.add(box(0.98, 0.04, 0.98, "#e9ecef"));                                      // deck
      g.add(box(0.5, 0.03, 0.34, "#48cae4", 0.18, 0.04, 0.26, { roughness: 0.2 }));  // infinity pool
      g.add(box(0.6, 0.32, 0.45, "#f8f9fa", -0.15, 0.04, -0.2));
      g.add(box(0.58, 0.24, 0.02, "#a8dadc", -0.15, 0.08, 0.03, { transparent: true, opacity: 0.75 }));
      g.add(box(0.45, 0.26, 0.38, "#f8f9fa", -0.05, 0.36, -0.22));
      g.add(box(0.7, 0.03, 0.55, "#2b2d42", -0.12, 0.62, -0.2));
      for (const x of [0.38, 0.38]) g.add(mesh(new THREE.ConeGeometry(0.08, 0.4, 5), "#52b788", x, 0.24, -0.35)); break;
    case "house-tower": {
      const levels = [[0.85, 1.6], [0.7, 1.5], [0.56, 1.3], [0.42, 1.0]];
      let y = 0;
      levels.forEach(([w, hh], k) => {
        g.add(box(w, hh, w, k % 2 ? "#5c677d" : "#33415c", 0, y, 0, { metalness: 0.3, roughness: 0.4 }));
        windows(g, w, hh, w, Math.round(hh * 4), y);
        y += hh;
      });
      g.add(mesh(new THREE.ConeGeometry(0.08, 0.9, 6), "#d4af37", 0, y + 0.45, 0, { metalness: 0.3, roughness: 0.3, emissive: "#6b5310", emissiveIntensity: 0.4 }));
      break;
    }
    case "sp-balloon": {
      g.add(box(0.85, 0.02, 0.85, "#adb5bd"));
      const up = new THREE.Group(); up.position.y = 0.55;
      const env = mesh(new THREE.SphereGeometry(0.32, 10, 8), "#e63946", 0, 0.42, 0);
      env.scale.y = 1.15; up.add(env);
      for (let k = 0; k < 4; k++) { const b = mesh(new THREE.SphereGeometry(0.325, 10, 8, k * Math.PI / 2, Math.PI / 4), "#ffd166", 0, 0.42, 0); b.scale.y = 1.15; up.add(b); }
      up.add(box(0.16, 0.11, 0.16, "#7f5539", 0, 0, 0));
      for (const [x, z] of [[-0.07, -0.07], [0.07, -0.07], [-0.07, 0.07], [0.07, 0.07]]) up.add(box(0.008, 0.16, 0.008, "#22252b", x, 0.1, z));
      g.add(up); g.userData.float = up; break;
    }
    case "sp-sub": {
      const hull = mesh(new THREE.CapsuleGeometry(0.13, 0.55, 4, 10), "#ffb703", 0, 0.08, 0);
      hull.rotation.x = Math.PI / 2; g.add(hull);
      g.add(box(0.12, 0.14, 0.2, "#ffb703", 0, 0.18, 0.02));
      g.add(box(0.02, 0.12, 0.02, "#22252b", 0, 0.32, 0.06));
      for (const z of [0.18, 0.02, -0.14]) { const w = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.27, 10), "#48cae4", 0, 0.1, z, { emissive: "#0077b6", emissiveIntensity: 0.4 }); w.rotation.z = Math.PI / 2; g.add(w); }
      g.add(box(0.02, 0.12, 0.1, "#22252b", 0, 0.08, -0.4));
      g.userData.bob = true; break;
    }
    case "sp-superyacht": {
      const hull = mesh(new THREE.CylinderGeometry(0.3, 0.12, 0.2, 6), "#f8f9fb", 0, 0.12, 0);
      hull.scale.set(1, 1, 3.1); g.add(hull);
      g.add(box(0.34, 0.03, 1.4, "#1d3557", 0, 0.13, 0));
      [[0.4, 0.95, 0.22], [0.32, 0.7, 0.32], [0.24, 0.45, 0.42]].forEach(([w, d, y], k) => {
        g.add(box(w, 0.1, d, "#f8f9fb", 0, y, -0.05 - k * 0.05));
        g.add(box(w + 0.01, 0.04, d * 0.9, "#1e2b3d", 0, y + 0.03, -0.05 - k * 0.05, { roughness: 0.2 }));
      });
      g.add(box(0.16, 0.12, 0.16, "#d4af37", 0, 0.52, -0.2, { metalness: 0.3, roughness: 0.35 }));
      g.add(box(0.18, 0.015, 0.14, "#48cae4", 0, 0.23, 0.42));                      // deck pool
      g.add(flat(mesh(new THREE.TorusGeometry(0.07, 0.01, 4, 16), "#f8f9fa", 0, 0.33, 0.36)));  // helipad mark
      g.userData.bob = true; break;
    }
    case "sp-rocket": {
      g.add(box(0.9, 0.05, 0.9, "#6c757d"));
      g.add(box(0.06, 1.7, 0.06, "#e63946", 0.32, 0.05, 0));                         // launch tower
      for (let k = 0; k < 5; k++) g.add(box(0.2, 0.02, 0.02, "#e63946", 0.22, 0.25 + k * 0.32, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.13, 0.15, 1.2, 10), "#f8f9fa", 0, 0.75, 0));
      g.add(mesh(new THREE.ConeGeometry(0.13, 0.35, 10), "#1d3557", 0, 1.52, 0));
      g.add(box(0.27, 0.06, 0.27, "#d4af37", 0, 1.05, 0, { metalness: 0.3, roughness: 0.35 }));
      for (let k = 0; k < 4; k++) {
        const fin = box(0.02, 0.28, 0.16, "#1d3557", 0, 0.12, 0.17);
        const holder = new THREE.Group(); holder.rotation.y = k * Math.PI / 2; holder.add(fin); g.add(holder);
      }
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.1, 10), "#22252b", 0, 0.12, 0)); break;
    }
    default: {
      if (id.startsWith("car-")) return carModel(id);
      if (id.startsWith("watch-")) return watchModel(id);
      return null;
    }
  }
  return g;
}



// Watch shown in the shop: case color, dial, strap, gem bezel.
const WATCH_LOOK = {
  "watch-digital": ["#2b2d42", "#9bc53d", "#2b2d42", false], "watch-classic": ["#cfd5dc", "#f4f1e8", "#6b4423", false],
  "watch-diver": ["#cfd5dc", "#173a73", "#cfd5dc", false], "watch-gold": ["#e2be55", "#f4f1e8", "#3d2b1f", false],
  "watch-chrono": ["#e8b4a0", "#f4f1e8", "#5a3825", false], "watch-diamond": ["#f4f6fa", "#0d1b2a", "#f4f6fa", true],
  "watch-skeleton": ["#d4af37", "#22252b", "#1b1b1f", false], "watch-grand": ["#d4af37", "#1d3557", "#1b1b1f", true],
};
function watchModel(id) {
  const look = WATCH_LOOK[id];
  if (!look) return null;
  const [caseC, dial, strap, gems] = look;
  const metal = { metalness: 0.3, roughness: 0.3 };
  const g = new THREE.Group();
  const face = new THREE.Group();
  const round = id !== "watch-digital";
  const body = round ? mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 24), caseC, 0, 0, 0, metal) : box(0.34, 0.08, 0.4, caseC, 0, -0.04, 0, metal);
  face.add(body);
  const dialM = round ? mesh(new THREE.CylinderGeometry(0.165, 0.165, 0.085, 24), dial, 0, 0.002, 0) : box(0.26, 0.085, 0.3, dial, 0, -0.04, 0, { emissive: dial, emissiveIntensity: 0.4 });
  face.add(dialM);
  if (round) {
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; face.add(box(0.012, 0.01, k % 3 ? 0.02 : 0.035, k % 3 ? "#9aa5b4" : caseC, Math.sin(a) * 0.135, 0.044, Math.cos(a) * 0.135)); }
    const hand1 = box(0.012, 0.01, 0.12, "#e9ecef", 0.03, 0.05, 0.04); hand1.rotation.y = 0.8; face.add(hand1);
    const hand2 = box(0.014, 0.01, 0.09, "#e9ecef", -0.03, 0.05, 0.02); hand2.rotation.y = -0.6; face.add(hand2);
    if (id === "watch-chrono") for (const [x, z] of [[-0.07, 0], [0.07, 0], [0, -0.07]]) face.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 12), "#e9ecef", x, 0, z));
    if (id === "watch-skeleton") for (let k = 0; k < 5; k++) face.add(flat(mesh(new THREE.TorusGeometry(0.03 + k * 0.006, 0.006, 4, 12), "#d4af37", (k - 2) * 0.04, 0.045, (k % 2) * 0.04 - 0.02, metal)));
    if (gems) for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8; face.add(mesh(new THREE.OctahedronGeometry(0.018), "#eaf6ff", Math.sin(a) * 0.19, 0.045, Math.cos(a) * 0.19, { roughness: 0.05, emissive: "#88c8ff", emissiveIntensity: 0.4 })); }
  }
  face.add(box(0.03, 0.04, 0.05, caseC, 0.21, -0.02, 0, metal));                  // crown
  g.add(face);
  for (const s of [1, -1]) g.add(box(0.2, 0.03, 0.32, strap, 0, -0.03, s * 0.33, strap === caseC ? metal : {}));
  g.rotation.x = 1.25;                       // stand it up, dial toward the viewer
  const holder = new THREE.Group(); holder.add(g);
  holder.rotation.y = 0.7;
  return holder;
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
// Shows any item (or a given model), scaled to fit and with the camera framed on it.
function stage(id, model) {
  const s = getStudio();
  s.holder.clear();
  const m = model || itemModel(id);
  if (!m) return null;
  const size = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
  const k = 1 / Math.max(size.x, size.z, size.y * 0.8, 0.3);
  m.scale.multiplyScalar(k);
  const box3 = new THREE.Box3().setFromObject(m), c = box3.getCenter(new THREE.Vector3());
  m.position.x -= c.x; m.position.z -= c.z; m.position.y -= box3.min.y;
  s.holder.add(m);
  const hgt = box3.max.y - box3.min.y, ty = hgt / 2, dist = 2.15 + Math.max(0, hgt - 0.4) * 1.4;
  s.camera.position.set(dist * 0.6, ty + dist * 0.38, dist * 0.7);
  s.camera.lookAt(0, ty, 0);
  return s;
}

const thumbs = {};
// Still image of an item for shop cards (rendered once, then cached). `model` renders
// something that isn't in itemModel (e.g. 조경·조각상), cached under `id`.
export function itemThumb(id, w = 320, h = 240, model = null) {
  if (thumbs[id]) return thumbs[id];
  const s = stage(id, model);
  if (!s) return null;
  s.renderer.setSize(w, h, false);
  s.camera.aspect = w / h; s.camera.updateProjectionMatrix();
  s.renderer.render(s.scene, s.camera);
  return (thumbs[id] = s.renderer.domElement.toDataURL("image/png"));
}

// Live turntable inside `el`; returns a stop function.
export function itemSpin(el, id) {
  const s = stage(id);
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
