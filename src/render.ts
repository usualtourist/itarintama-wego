// Three.js-renderöinti: maasto, kylä, metsä, sotilaat, valojuovat, räjähdykset, käskyviivat.
import * as THREE from 'three';
import { Sim, FSTRIDE, Shot, smokeAt, P_STAND, P_CROUCH, P_PRONE, ST_INCAP, ST_DEAD } from './sim';
import { Terrain, MAP_W, MAP_D, NX, NZ, CELL, Gr, Building, wallBox } from './terrain';
import { clamp } from './rng';
import { SCENARIO, VEHICLES } from './data';
const natIdx = (side: number) => (SCENARIO.nations[side] === 'ger' ? 0 : 1);

export const MODE_COLORS: Record<string, number> = { move: 0x8fb4ff, quick: 0x5fe0d0, fast: 0xffb347, hunt: 0xc99bff, slow: 0x9ed36a, target: 0xff5a4f, area: 0xffa25a, face: 0xf3e3a0 };
const GROUND_COL = [0x6d7d3c, 0xae9650, 0x3b4826, 0x8c7656, 0x5a442d, 0x63743a, 0x6a5a38, 0x7a8946, 0x4f5a3a];

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
function hashN(i: number) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

interface SoldierVis { nat: number; outer: any; inner: any; legs: any; torso: any; head: any; helmet: any; gun: any; pack: any; marker: any; side: number; mgMount: any; tank: any; }

export class Renderer {
  sim: Sim;
  T: Terrain;
  gl: any; scene: any; camera: any; sun: any;
  cam = { tx: 245, tz: 455, dist: 210, yaw: 0, pitch: 0.62 };
  sv: SoldierVis[] = [];
  mats: any = {};
  markerTex: any[] = [];
  pathGroup: any;
  tracerGeo: any; tracerPos!: Float32Array; tracerCol!: Float32Array;
  ptsGeo: any; ptsPos!: Float32Array; ptsCol!: Float32Array; ptsSize!: Float32Array;
  explosions: any[] = [];
  ghostSprites: any[] = [];
  objRings: any[] = [];
  raycaster = new THREE.Raycaster();
  losLine: any;
  selRing: any;
  time = 0;

  constructor(canvas: HTMLCanvasElement, sim: Sim) {
    this.sim = sim;
    this.T = sim.T;
    const gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl = gl;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xc9d0c6);
    scene.fog = new THREE.Fog(0xc9d0c6, 380, 1250);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 3000);

    scene.add(new THREE.HemisphereLight(0xcfdae6, 0x5b5237, 1.25));
    const sun = new THREE.DirectionalLight(0xffd2a0, 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -150; sc.right = 150; sc.top = 150; sc.bottom = -150; sc.near = 10; sc.far = 900;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    scene.add(sun);
    scene.add(sun.target);
    this.sun = sun;

    this.buildSky();
    this.buildTerrain();
    this.buildTrees();
    this.buildBuildings();
    this.buildFences();
    this.buildHay();
    this.buildFoxholes();
    this.buildWheat();
    this.buildObjectives();
    this.buildSoldiers();
    this.buildGuns();
    this.buildFx();
    this.pathGroup = new THREE.Group();
    scene.add(this.pathGroup);
    const losGeo = new THREE.BufferGeometry();
    losGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
    losGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(12), 3));
    this.losLine = new THREE.LineSegments(losGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    this.losLine.renderOrder = 20;
    this.losLine.visible = false;
    scene.add(this.losLine);
  }

  // ---------------- maailma ----------------
  private buildSky() {
    const g = new THREE.SphereGeometry(2000, 24, 12);
    const col = new Float32Array(g.attributes.position.count * 3);
    const top = new THREE.Color(0x8fb0cc), hor = new THREE.Color(0xe9d9bd);
    for (let i = 0; i < g.attributes.position.count; i++) {
      const y = g.attributes.position.getY(i) / 2000;
      const c = hor.clone().lerp(top, clamp(y * 2.2, 0, 1));
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    m.position.set(MAP_W / 2, 0, MAP_D / 2);
    this.scene.add(m);
  }

  private buildTerrain() {
    const T = this.T;
    // Laajennetaan maastoa kartan ulkopuolelle reunavyöhykkeellä, jotta horisontti ei katkea.
    const pad = 40, PX = NX + pad * 2, PZ = NZ + pad * 2;
    const pos = new Float32Array(PX * PZ * 3), col = new Float32Array(PX * PZ * 3), uv = new Float32Array(PX * PZ * 2);
    const c = new THREE.Color();
    for (let iz = 0; iz < PZ; iz++) for (let ix = 0; ix < PX; ix++) {
      const x = (ix - pad) * CELL * (ix < pad || ix >= NX + pad ? 1.6 : 1), z = (iz - pad) * CELL * (iz < pad || iz >= NZ + pad ? 1.6 : 1);
      const xx = ix < pad ? -(pad - ix) * CELL * 3 : ix >= NX + pad ? MAP_W + (ix - NX - pad + 1) * CELL * 3 : (ix - pad) * CELL;
      const zz = iz < pad ? -(pad - iz) * CELL * 3 : iz >= NZ + pad ? MAP_D + (iz - NZ - pad + 1) * CELL * 3 : (iz - pad) * CELL;
      void x; void z;
      const inside = xx >= 0 && xx <= MAP_W && zz >= 0 && zz <= MAP_D;
      const y = T.h(clamp(xx, 0, MAP_W), clamp(zz, 0, MAP_D)) + (inside ? 0 : Math.sin(xx / 47) * Math.cos(zz / 53) * 2 - 0.3);
      const i = iz * PX + ix;
      pos.set([xx, y, zz], i * 3);
      uv.set([xx / 6, zz / 6], i * 2);
      const g = T.groundAt(clamp(xx, 0, MAP_W - 1), clamp(zz, 0, MAP_D - 1));
      c.setHex(inside ? GROUND_COL[g] : GROUND_COL[zz > MAP_D ? Gr.Meadow : xx < 0 ? Gr.Forest : Gr.Grass]);
      const n = 0.9 + hashN(ix * 1.7 + iz * 91.3) * 0.12 + 0.08 * Math.sin(xx / 13 + Math.cos(zz / 17));
      c.multiplyScalar(n);
      if (!inside) c.lerp(new THREE.Color(0xb7bca8), 0.35);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const idx = new Uint32Array((PX - 1) * (PZ - 1) * 6);
    let k = 0;
    for (let iz = 0; iz < PZ - 1; iz++) for (let ix = 0; ix < PX - 1; ix++) {
      const a = iz * PX + ix, b = a + 1, cc = a + PX, d = cc + 1;
      idx[k++] = a; idx[k++] = cc; idx[k++] = b; idx[k++] = b; idx[k++] = cc; idx[k++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const grain = canvasTex(256, 256, (g) => {
      const im = g.createImageData(256, 256);
      for (let i = 0; i < 256 * 256; i++) {
        const v = 215 + Math.floor(hashN(i) * 40);
        im.data[i * 4] = v; im.data[i * 4 + 1] = v; im.data[i * 4 + 2] = v - 6; im.data[i * 4 + 3] = 255;
      }
      g.putImageData(im, 0, 0);
      g.globalAlpha = 0.18;
      for (let i = 0; i < 300; i++) {
        g.fillStyle = hashN(i * 3) > 0.5 ? '#ffffff' : '#3a3a2a';
        g.fillRect(hashN(i) * 256, hashN(i + 9) * 256, 1 + hashN(i + 4) * 3, 1 + hashN(i + 7) * 3);
      }
    });
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: grain }));
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private buildTrees() {
    const T = this.T;
    const kinds = [0, 1, 2, 3].map((k) => T.trees.filter((t) => t.kind === k));
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    const trunkGeo = new THREE.CylinderGeometry(0.7, 1, 1, 6); trunkGeo.translate(0, 0.5, 0);
    const coneGeo = new THREE.ConeGeometry(1, 1, 7); coneGeo.translate(0, 0.5, 0);
    const blobGeo = new THREE.IcosahedronGeometry(1, 1);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4433 });
    const birchMat = new THREE.MeshLambertMaterial({ color: 0xd8d4c6 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const mk = (geo: any, mat: any, n: number, set: (i: number) => void, shadow = true) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      m.count = n;
      for (let i = 0; i < n; i++) { set(i); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); }
      m.castShadow = shadow; m.receiveShadow = true;
      this.scene.add(m);
      return m;
    };
    // männyt
    const pines = kinds[0];
    mk(trunkGeo, trunkMat, pines.length, (i) => { const t = pines[i]; dummy.position.set(t.x, t.y0 - 0.3, t.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(t.r, t.trunkH, t.r); });
    const pc = mk(coneGeo, leafMat, pines.length * 2, (i) => {
      const t = pines[i >> 1]; const H = t.trunkH / 0.8; const lo = i & 1;
      dummy.position.set(t.x, t.y0 + H * (lo ? 0.32 : 0.55), t.z);
      dummy.rotation.set(0, hashN(i) * 6, 0);
      dummy.scale.set(t.crownR * (lo ? 1 : 0.72), H * (lo ? 0.45 : 0.48), t.crownR * (lo ? 1 : 0.72));
    });
    for (let i = 0; i < pines.length * 2; i++) pc.setColorAt(i, col.setHex(0x2d4527).multiplyScalar(0.85 + hashN(i + 5) * 0.3));
    // koivut
    const birch = kinds[1];
    mk(trunkGeo, birchMat, birch.length, (i) => { const t = birch[i]; dummy.position.set(t.x, t.y0 - 0.3, t.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(t.r, t.crownY - t.y0 + 1, t.r); });
    const bc = mk(blobGeo, leafMat, birch.length, (i) => { const t = birch[i]; dummy.position.set(t.x, t.crownY, t.z); dummy.rotation.set(0, hashN(i) * 6, 0); dummy.scale.set(t.crownR, t.crownR * 1.45, t.crownR); });
    for (let i = 0; i < birch.length; i++) bc.setColorAt(i, col.setHex(0x5f7f30).multiplyScalar(0.85 + hashN(i + 2) * 0.3));
    // hedelmäpuut
    const fr = kinds[2];
    mk(trunkGeo, trunkMat, fr.length, (i) => { const t = fr[i]; dummy.position.set(t.x, t.y0 - 0.2, t.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(0.12, 2.3, 0.12); });
    const fc = mk(blobGeo, leafMat, fr.length, (i) => { const t = fr[i]; dummy.position.set(t.x, t.crownY, t.z); dummy.rotation.set(0, hashN(i) * 6, 0); dummy.scale.set(t.crownR, t.crownR * 0.85, t.crownR); });
    for (let i = 0; i < fr.length; i++) fc.setColorAt(i, col.setHex(0x4d6c2b).multiplyScalar(0.85 + hashN(i + 7) * 0.3));
    // pensaat
    const bu = kinds[3];
    const buc = mk(blobGeo, leafMat, bu.length, (i) => { const t = bu[i]; dummy.position.set(t.x, t.crownY - 0.2, t.z); dummy.rotation.set(0, hashN(i) * 6, 0); dummy.scale.set(t.crownR, t.crownR * 0.75, t.crownR); });
    for (let i = 0; i < bu.length; i++) buc.setColorAt(i, col.setHex(0x4a6430).multiplyScalar(0.8 + hashN(i + 3) * 0.35));
  }

  roofs: any[] = [];
  private buildBuildings() {
    // Ikkunat ja ovet ovat tekstuurissa läpinäkyviä aukkoja, samoissa kohdissa kuin simulaatiossa.
    const logTex = canvasTex(512, 256, (g) => {
      for (let i = 0; i < 12; i++) {
        const y = i * 21.3;
        const grd = g.createLinearGradient(0, y, 0, y + 21);
        grd.addColorStop(0, '#7a5a3c'); grd.addColorStop(0.5, '#8d6b47'); grd.addColorStop(1, '#4f3826');
        g.fillStyle = grd; g.fillRect(0, y, 512, 21.3);
      }
      for (const [x0, x1] of [[113, 195], [317, 399]]) {
        g.fillStyle = '#e8e2d2'; g.fillRect(x0 - 9, 54, x1 - x0 + 18, 78);
        g.fillStyle = '#4e79a8'; g.fillRect(x0 - 5, 58, x1 - x0 + 10, 70);
        g.clearRect(x0, 62, x1 - x0, 62);
        g.fillStyle = '#e8e2d2'; g.fillRect((x0 + x1) / 2 - 2, 62, 4, 62);
      }
    }, false);
    const plankTex = canvasTex(512, 256, (g) => {
      g.fillStyle = '#6e6250'; g.fillRect(0, 0, 512, 256);
      for (let x = 0; x < 512; x += 16) { g.fillStyle = hashN(x) > 0.5 ? '#625645' : '#776a56'; g.fillRect(x, 0, 15, 256); g.fillStyle = '#3e352a'; g.fillRect(x + 15, 0, 1, 256); }
      g.fillStyle = '#3f362b'; g.fillRect(194, 53, 124, 6); g.fillRect(194, 53, 6, 183); g.fillRect(312, 53, 6, 183);
      g.clearRect(200, 59, 112, 177);
    }, false);
    const roofTex = canvasTex(256, 256, (g) => {
      g.fillStyle = '#6d6553'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) { g.fillStyle = hashN(i) > 0.5 ? '#7d745f' : '#57503f'; g.fillRect(hashN(i + 1) * 256, hashN(i + 2) * 256, 1, 6 + hashN(i + 3) * 10); }
    });
    const wallMat = new THREE.MeshLambertMaterial({ map: logTex, alphaTest: 0.5, side: THREE.DoubleSide });
    const barnMat = new THREE.MeshLambertMaterial({ map: plankTex, alphaTest: 0.5, side: THREE.DoubleSide });
    const roofMat = new THREE.MeshLambertMaterial({ map: roofTex, side: THREE.DoubleSide });
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
    for (const B of this.T.buildings) {
      for (let i = 0; i < 4; i++) {
        const w = wallBox(B, i);
        const geo = new THREE.BoxGeometry(w[3] - w[0], w[4] - w[1], w[5] - w[2]);
        // ohuen seinän päätypinnat käyttävät samaa tekstuuria; isoille pinnoille u kulkee seinän suuntaan
        if (i >= 2) { geo.rotateY(Math.PI / 2); }
        const m = new THREE.Mesh(i >= 2 ? new THREE.BoxGeometry(w[5] - w[2], w[4] - w[1], w[3] - w[0]).rotateY(Math.PI / 2) : geo, B.kind === 1 ? barnMat : wallMat);
        m.position.set((w[0] + w[3]) / 2, (w[1] + w[4]) / 2, (w[2] + w[5]) / 2);
        m.castShadow = true; m.receiveShadow = true;
        this.scene.add(m);
      }
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0 - 0.3, B.z1 - B.z0 - 0.3), floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set((B.x0 + B.x1) / 2, B.y0 + 0.03, (B.z0 + B.z1) / 2);
      floor.receiveShadow = true;
      this.scene.add(floor);
      const roof = new THREE.Mesh(this.gableHouse(B).roof, roofMat);
      roof.castShadow = true; roof.receiveShadow = true;
      this.scene.add(roof);
      this.roofs.push(roof);
    }
  }
  setRoofs(v: boolean) { for (const r of this.roofs) r.visible = v; }
  private gableHouse(B: Building) {
    const w = B.x1 - B.x0, d = B.z1 - B.z0;
    const walls = new THREE.BoxGeometry(w, B.wallH + 0.6, d);
    walls.translate((B.x0 + B.x1) / 2, B.y0 + (B.wallH + 0.6) / 2 - 0.6, (B.z0 + B.z1) / 2);
    // harjakatto pitkän sivun suuntaan
    const o = 0.45, top = B.y0 + B.wallH, ridge = top + B.roofH;
    const v: number[] = [];
    const uvs: number[] = [];
    const quad = (a: number[], b: number[], c: number[], e: number[], len: number, h: number) => {
      v.push(...a, ...b, ...c, ...a, ...c, ...e);
      uvs.push(0, 0, len / 3, 0, len / 3, h / 3, 0, 0, len / 3, h / 3, 0, h / 3);
    };
    const tri = (a: number[], b: number[], c: number[]) => { v.push(...a, ...b, ...c); uvs.push(0, 0, 1, 0, 0.5, 1); };
    if (B.alongX) {
      const zc = (B.z0 + B.z1) / 2, x0 = B.x0 - o, x1 = B.x1 + o;
      quad([x0, top - 0.3, B.z0 - o], [x1, top - 0.3, B.z0 - o], [x1, ridge, zc], [x0, ridge, zc], w, d / 2);
      quad([x1, top - 0.3, B.z1 + o], [x0, top - 0.3, B.z1 + o], [x0, ridge, zc], [x1, ridge, zc], w, d / 2);
      tri([B.x0, top, B.z0], [B.x0, top, B.z1], [B.x0, ridge, zc]);
      tri([B.x1, top, B.z1], [B.x1, top, B.z0], [B.x1, ridge, zc]);
    } else {
      const xc = (B.x0 + B.x1) / 2, z0 = B.z0 - o, z1 = B.z1 + o;
      quad([B.x0 - o, top - 0.3, z1], [B.x0 - o, top - 0.3, z0], [xc, ridge, z0], [xc, ridge, z1], d, w / 2);
      quad([B.x1 + o, top - 0.3, z0], [B.x1 + o, top - 0.3, z1], [xc, ridge, z1], [xc, ridge, z0], d, w / 2);
      tri([B.x1, top, B.z0], [B.x0, top, B.z0], [xc, ridge, B.z0]);
      tri([B.x0, top, B.z1], [B.x1, top, B.z1], [xc, ridge, B.z1]);
    }
    const roof = new THREE.BufferGeometry();
    roof.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    roof.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roof.computeVertexNormals();
    return { walls, roof };
  }

  private buildFences() {
    const tex = canvasTex(128, 64, (g) => {
      g.clearRect(0, 0, 128, 64);
      g.fillStyle = '#8a7a62';
      g.fillRect(0, 18, 128, 5); g.fillRect(0, 44, 128, 5);
      for (let x = 2; x < 128; x += 16) { g.fillStyle = hashN(x) > 0.5 ? '#9a8a70' : '#7b6c56'; g.beginPath(); g.moveTo(x, 64); g.lineTo(x, 6); g.lineTo(x + 4, 0); g.lineTo(x + 8, 6); g.lineTo(x + 8, 64); g.fill(); }
    });
    const v: number[] = [], uv: number[] = [];
    for (const F of this.T.fences) {
      const len = Math.hypot(F.x2 - F.x1, F.z2 - F.z1);
      const y1 = this.T.h(F.x1, F.z1) - 0.1, y2 = this.T.h(F.x2, F.z2) - 0.1;
      const u = len / 1.6;
      v.push(F.x1, y1, F.z1, F.x2, y2, F.z2, F.x2, y2 + F.h + 0.1, F.z2, F.x1, y1, F.z1, F.x2, y2 + F.h + 0.1, F.z2, F.x1, y1 + F.h + 0.1, F.z1);
      uv.push(0, 0, u, 0, u, 1, 0, 0, u, 1, 0, 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    m.castShadow = true;
    this.scene.add(m);
  }

  private buildHay() {
    const mat = new THREE.MeshLambertMaterial({ color: 0xc8a75a, flatShading: true });
    for (const H of this.T.hays) {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(H.r, H.r * 1.05, H.h * 0.55, 10), mat);
      cyl.position.set(H.x, H.y0 + H.h * 0.27, H.z);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(H.r * 1.08, H.h * 0.5, 10), mat);
      cone.position.set(H.x, H.y0 + H.h * 0.55 + H.h * 0.24, H.z);
      cyl.castShadow = cone.castShadow = true;
      this.scene.add(cyl, cone);
    }
  }

  private buildFoxholes() {
    const holeMat = new THREE.MeshLambertMaterial({ color: 0x2a2116 });
    const moundMat = new THREE.MeshLambertMaterial({ color: 0x6b5435, flatShading: true });
    for (const f of this.T.foxholes) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 12), holeMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(f.x, f.y0 + 0.04, f.z);
      const mound = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.28, 5, 12), moundMat);
      mound.rotation.x = -Math.PI / 2;
      mound.scale.set(1, 1, 0.55);
      mound.position.set(f.x, f.y0 + 0.02, f.z);
      mound.receiveShadow = true;
      this.scene.add(hole, mound);
    }
  }

  private buildWheat() {
    this.buildCrop(Gr.Wheat, [[214, 186, 100], [176, 146, 66], [226, 198, 112]], 0.95, 2.3);
    this.buildCrop(Gr.Marsh, [[104, 132, 62], [78, 104, 48], [92, 70, 44]], 1.35, 2.6);
  }
  private buildCrop(gtype: number, pal: number[][], hk: number, step: number) {
    const T = this.T;
    // Tähkät piirretään suoraan pikselitaulukkoon, jotta läpinäkyvät reunat eivät tummu mipmapeissa.
    const S = 64, px = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) { px[i * 4] = 196; px[i * 4 + 1] = 168; px[i * 4 + 2] = 92; px[i * 4 + 3] = 0; }
    const put = (x: number, y: number, r: number, gg: number, b: number) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= S || y >= S) return;
      const o = ((S - 1 - y) * S + x) * 4;
      px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = 255;
    };
    for (let i = 0; i < 30; i++) {
      const x0 = 3 + hashN(i) * 58, top = 4 + hashN(i + 30) * 16, lean = (hashN(i + 3) - 0.5) * 8;
      const light = hashN(i + 7) > 0.5;
      for (let y = top; y < S; y++) {
        const t = (S - y) / (S - top);
        const cc = light ? pal[0] : pal[1];
        put(x0 + lean * t, y, cc[0], cc[1], cc[2]);
      }
      const h3 = pal[2];
      for (let k = 0; k < 9; k++) { put(x0 + lean - 1, top + k - 2, h3[0], h3[1], h3[2]); put(x0 + lean + 1, top + k - 2, h3[0] - 14, h3[1] - 16, h3[2] - 14); put(x0 + lean, top + k - 3, h3[0] + 6, h3[1] + 8, h3[2] + 8); }
    }
    const tex = new THREE.DataTexture(px, S, S, THREE.RGBAFormat);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    const geo = new THREE.BufferGeometry();
    // Kaksi ristikkäistä tasoa, kumpikin molempiin suuntiin (normaali ylös, jotta takapuoli ei tummu).
    const v0 = [-0.7, 0, 0, 0.7, 0, 0, 0.7, 1, 0, -0.7, 0, 0, 0.7, 1, 0, -0.7, 1, 0, 0, 0, -0.7, 0, 0, 0.7, 0, 1, 0.7, 0, 0, -0.7, 0, 1, 0.7, 0, 1, -0.7];
    const uv0 = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
    const v: number[] = [...v0], uv: number[] = [...uv0];
    for (let t = 0; t < 4; t++) for (const k of [0, 2, 1]) { v.push(v0[(t * 3 + k) * 3], v0[(t * 3 + k) * 3 + 1], v0[(t * 3 + k) * 3 + 2]); uv.push(uv0[(t * 3 + k) * 2], uv0[(t * 3 + k) * 2 + 1]); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(72).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const pts: number[] = [];
    for (let z = 0; z < MAP_D; z += step) for (let x = 0; x < MAP_W; x += step) {
      const px = x + hashN(x * 13 + z) * 2, pz = z + hashN(x + z * 7) * 2;
      if (T.groundAt(px, pz) === gtype) pts.push(px, pz);
    }
    const n = pts.length / 2;
    if (!n) return;
    const m = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45 }), n);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = pts[i * 2], z = pts[i * 2 + 1];
      d.position.set(x, T.h(x, z) - 0.05, z);
      d.rotation.set(0, hashN(i) * 3, 0);
      const s = 0.85 + hashN(i + 11) * 0.3;
      d.scale.set(s * 1.3, hk * s, s * 1.3);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, c.setScalar(0.85 + hashN(i + 5) * 0.25));
    }
    this.scene.add(m);
  }

  private buildObjectives() {
    for (const o of this.sim.objectives) {
      const pts: number[] = [];
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const x = o.x + Math.cos(a) * o.r, z = o.z + Math.sin(a) * o.r;
        pts.push(x, this.T.h(x, z) + 0.35, z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xf3e3a0, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.85 }));
      line.computeLineDistances();
      this.scene.add(line);
      this.objRings.push(line);
    }
  }
  updateObjectives() {
    this.sim.objectives.forEach((o, i) => this.objRings[i].material.color.setHex(o.owner === 0 ? 0x9fb7c9 : o.owner === 1 ? 0xd2604c : 0xf3e3a0));
  }

  // ---------------- sotilaat ----------------
  private buildSoldiers() {
    const mk = (c: number) => new THREE.MeshLambertMaterial({ color: c });
    this.mats = {
      uni: [mk(0x5c634f), mk(0x7a7150)], helm: [mk(0x474c43), mk(0x4d5638)],
      dead: [mk(0x3a3d33), mk(0x4a4433)], skin: mk(0xc49a7c), gun: mk(0x2b241e), pack: [mk(0x4c4436), mk(0x5d5640)],
    };
    const legsG = new THREE.BoxGeometry(0.32, 0.82, 0.2); legsG.translate(0, 0.41, 0);
    const torsoG = new THREE.BoxGeometry(0.42, 0.6, 0.25);
    const headG = new THREE.SphereGeometry(0.11, 8, 6);
    const helmG = new THREE.SphereGeometry(0.15, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const gunG = new THREE.BoxGeometry(0.05, 0.06, 1.1); gunG.translate(0, 0, 0.35);
    const mgG = new THREE.BoxGeometry(0.08, 0.1, 1.25); mgG.translate(0, 0, 0.45);
    const packG = new THREE.BoxGeometry(0.3, 0.32, 0.14);
    // Maxim lavetteineen
    const maximGroup = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 1.1), this.mats.gun); body.position.set(0, 0.5, 0.4);
      const shield = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.03), mk(0x4b5435)); shield.position.set(0, 0.55, 0.25);
      const w1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 10), this.mats.gun); w1.rotation.z = Math.PI / 2; w1.position.set(0.3, 0.22, 0.05);
      const w2 = w1.clone(); w2.position.x = -0.3;
      g.add(body, shield, w1, w2);
      g.traverse((o: any) => { o.castShadow = true; });
      return g;
    };
    this.markerTex = [this.markerTexture('#c7d7e4', '#26323b'), this.markerTexture('#e0624f', '#3b1610'), this.markerTexture('#ffe08a', '#3a2c06')];
    for (const s of this.sim.soldiers) {
      const side = s.side;
      const nat = natIdx(side);
      const outer = new THREE.Group();
      const inner = new THREE.Group();
      outer.add(inner);
      const legs = new THREE.Mesh(legsG, this.mats.uni[nat]);
      const torso = new THREE.Mesh(torsoG, this.mats.uni[nat]);
      const head = new THREE.Mesh(headG, this.mats.skin);
      const helmet = new THREE.Mesh(helmG, this.mats.helm[nat]);
      helmet.scale.set(1, 0.75, 1.05);
      const isMg = s.w.kind === 'lmg';
      const gun = new THREE.Mesh(isMg ? mgG : gunG, this.mats.gun);
      const pack = new THREE.Mesh(packG, this.mats.pack[nat]);
      let tank: any = null;
      if (s.veh) { tank = VEHICLES[s.veh.type].model === 't34' ? this.buildT34() : this.buildTank(); outer.add(tank.group); outer.rotation.order = 'YXZ'; }
      else inner.add(legs, torso, head, helmet, gun, pack);
      [legs, torso, head, helmet, gun, pack].forEach((m) => { m.castShadow = true; });
      let mgMount: any = null;
      if (s.w.kind === 'hmg') { mgMount = maximGroup(); outer.add(mgMount); gun.visible = false; }
      if (s.w.kind === 'mortar') {
        mgMount = new THREE.Group();
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8), this.mats.gun); tube.position.set(0, 0.32, 0.5); tube.rotation.x = 0.55;
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.32), this.mats.gun); plate.position.set(0, 0.03, 0.38);
        mgMount.add(tube, plate); outer.add(mgMount); gun.visible = false;
      }
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markerTex[side], depthTest: false, sizeAttenuation: false, transparent: true }));
      marker.scale.set(0.022, 0.022, 1);
      marker.renderOrder = 10;
      this.scene.add(marker);
      this.scene.add(outer);
      if (s.veh) marker.scale.set(0.03, 0.03, 1);
      this.sv.push({ nat, outer, inner, legs, torso, head, helmet, gun, pack, marker, side, mgMount, tank });
    }
    // ghost- ja äänikontaktimerkit
    const ghostTex = this.markerTexture('rgba(224,98,79,0.35)', 'rgba(59,22,16,0.6)', '?');
    for (let i = 0; i < 60; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostTex, depthTest: false, sizeAttenuation: false, transparent: true }));
      sp.scale.set(0.024, 0.024, 1);
      sp.visible = false;
      sp.renderOrder = 9;
      this.scene.add(sp);
      this.ghostSprites.push(sp);
    }
    const ringG = new THREE.RingGeometry(0.55, 0.75, 20);
    ringG.rotateX(-Math.PI / 2);
    this.selRing = new THREE.InstancedMesh(ringG, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false }), 16);
    this.selRing.count = 0;
    this.selRing.renderOrder = 5;
    this.scene.add(this.selRing);
  }
  // 45 mm 53-K: kilpi, putki, pyörät ja haaralavetti
  guns: { sq: any; group: any; mat: any; crew0: number }[] = [];
  private buildGuns() {
    for (const sq of this.sim.guns) {
      const mat = new THREE.MeshLambertMaterial({ color: 0x4f5a38 });
      const dark = new THREE.MeshLambertMaterial({ color: 0x22231f });
      const grp = new THREE.Group();
      const add = (geo: any, m: any, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
        const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; grp.add(o); return o;
      };
      add(new THREE.BoxGeometry(1.5, 0.85, 0.04), mat, 0, 0.78, 0.25, -0.12);
      add(new THREE.BoxGeometry(0.5, 0.35, 0.04), mat, 0, 0.32, 0.3, 0.1);
      const bar = new THREE.CylinderGeometry(0.035, 0.045, 2.0, 8); bar.rotateX(Math.PI / 2);
      add(bar, mat, 0, 0.85, 1.15);
      add(new THREE.BoxGeometry(0.22, 0.2, 0.7), mat, 0, 0.82, 0.0);
      const wh = new THREE.CylinderGeometry(0.38, 0.38, 0.12, 14); wh.rotateZ(Math.PI / 2);
      add(wh, dark, 0.62, 0.38, 0.05); add(wh, dark, -0.62, 0.38, 0.05);
      add(new THREE.BoxGeometry(0.09, 0.09, 2.1), mat, 0.35, 0.2, -1.0, 0, 0.2);
      add(new THREE.BoxGeometry(0.09, 0.09, 2.1), mat, -0.35, 0.2, -1.0, 0, -0.2);
      grp.visible = false;
      this.scene.add(grp);
      this.guns.push({ sq, group: grp, mat, crew0: sq.members[0] });
    }
  }
  private applyGuns(frames: Float32Array, fA: number, viewSide: number) {
    const N = this.sim.soldiers.length;
    for (const G of this.guns) {
      const g = G.sq.gun;
      let fl = 0;
      for (const id of G.sq.members) fl |= frames[fA * N * FSTRIDE + id * FSTRIDE + 6];
      const vis = viewSide !== 0 || (fl & 256) !== 0;
      G.group.visible = vis;
      if (!vis) continue;
      const aim = frames[fA * N * FSTRIDE + G.crew0 * FSTRIDE + 8];
      G.group.position.set(g.x, this.T.h(g.x, g.z) - 0.05, g.z);
      G.group.rotation.y = aim;
      G.group.scale.setScalar(g.scale);
      G.mat.color.setHex((fl & 512) !== 0 ? 0x2a2723 : SCENARIO.nations[G.sq.side] === 'ger' ? 0x8b7d55 : 0x4f5a38);
    }
  }

  // T-34-85: noin 6,1 × 3,0 × 2,7 m, viisto 60° keulalevy, iso valettu torni ja 85 mm kanuuna
  private buildT34() {
    const base = 0x4b5a31;
    const grey = new THREE.MeshLambertMaterial({ color: base });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2b27 });
    const black = new THREE.MeshLambertMaterial({ color: 0x1b1c1a });
    const g = new THREE.Group();
    const add = (geo: any, mat: any, x: number, y: number, z: number, parent: any = g, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    add(box(0.5, 0.85, 6.0), dark, 1.27, 0.45, 0); add(box(0.5, 0.85, 6.0), dark, -1.27, 0.45, 0);
    const wh = new THREE.CylinderGeometry(0.41, 0.41, 0.16, 14); wh.rotateZ(Math.PI / 2);
    for (const sd of [-1, 1]) for (let k = 0; k < 5; k++) add(wh, dark, sd * 1.5, 0.43, -2.1 + k * 1.05);
    add(box(2.1, 0.75, 5.9), grey, 0, 0.78, 0);
    // keulalevy 60° pystysuorasta
    add(box(2.95, 0.09, 2.0), grey, 0, 1.05, 2.13, g, 0.524);
    add(box(2.95, 0.12, 4.0), grey, 0, 1.55, -0.73);
    for (const sd of [-1, 1]) add(box(0.09, 0.65, 4.5), grey, sd * 1.43, 1.25, -0.5, g, 0, 0, sd * 0.35);
    add(box(2.6, 0.7, 0.09), grey, 0, 1.2, -2.95, g, -0.6);
    const tank = new THREE.CylinderGeometry(0.21, 0.21, 0.9, 10); tank.rotateX(Math.PI / 2);
    for (const sd of [-1, 1]) add(tank, dark, sd * 1.4, 1.62, -2.1);
    // torni
    const tur = new THREE.Group();
    tur.position.set(0, 1.6, 0.25);
    g.add(tur);
    const shell = new THREE.CylinderGeometry(0.98, 1.08, 0.9, 12); shell.scale(1, 1, 1.18);
    add(shell, grey, 0, 0.45, -0.2, tur);
    add(box(0.95, 0.6, 0.45), grey, 0, 0.45, 1.05, tur);
    const barrel = new THREE.CylinderGeometry(0.06, 0.075, 4.6, 10); barrel.rotateX(Math.PI / 2);
    add(barrel, grey, 0, 0.45, 3.5, tur);
    const cup = new THREE.CylinderGeometry(0.3, 0.32, 0.26, 12);
    add(cup, grey, 0, 1.02, -0.65, tur);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), black, -0.55, 1.15, -0.9, tur); // antenni
    const cmd = new THREE.Group();
    cmd.position.set(0, 1.02, -0.65);
    const uni = new THREE.MeshLambertMaterial({ color: 0x2c2a24 });
    add(box(0.42, 0.42, 0.28), uni, 0, 0.32, 0, cmd);
    add(new THREE.SphereGeometry(0.11, 8, 6), this.mats.skin, 0, 0.64, 0.02, cmd);
    add(new THREE.SphereGeometry(0.14, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), uni, 0, 0.66, 0.02, cmd); // panssarimiehen kypärä
    tur.add(cmd);
    const star = canvasTex(64, 64, (c) => {
      c.clearRect(0, 0, 64, 64);
      c.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 29, a = -Math.PI / 2 + (i * Math.PI) / 5; c.lineTo(32 + Math.cos(a) * r, 33 + Math.sin(a) * r); }
      c.closePath(); c.fillStyle = '#b3261b'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#f0ece0'; c.stroke();
    }, false);
    const txt = canvasTex(256, 64, (c) => {
      c.clearRect(0, 0, 256, 64);
      c.font = 'bold 26px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#ecebe2';
      c.fillText('223 · ЗА РОДИНУ', 128, 34, 240);
    }, false);
    const decal = (tex: any, w: number, h: number, x: number, y: number, z: number, ry: number, parent: any) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(x, y, z); m.rotation.y = ry; parent.add(m);
    };
    for (const sd of [-1, 1]) {
      decal(star, 0.55, 0.55, sd * 1.12, 0.48, 0.35, sd * Math.PI / 2, tur);
      decal(txt, 1.3, 0.32, sd * 1.06, 0.5, -0.65, sd * Math.PI / 2, tur);
    }
    return { group: g, turret: tur, cmd, grey, base, smoke: null as any };
  }

  // Panzer III Ausf. H: noin 5,4 × 2,95 × 2,45 m
  private buildTank() {
    const grey = new THREE.MeshLambertMaterial({ color: 0x6a7075 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2c2a });
    const black = new THREE.MeshLambertMaterial({ color: 0x1d1e1f });
    const g = new THREE.Group();
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: any = grey, parent: any = g) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    box(0.42, 0.72, 5.3, 1.25, 0.42, 0, dark);
    box(0.42, 0.72, 5.3, -1.25, 0.42, 0, dark);
    const wheelG = new THREE.CylinderGeometry(0.27, 0.27, 0.12, 12); wheelG.rotateZ(Math.PI / 2);
    const sprG = new THREE.CylinderGeometry(0.31, 0.31, 0.14, 10); sprG.rotateZ(Math.PI / 2);
    for (const sd of [-1, 1]) {
      for (let k = 0; k < 6; k++) { const w = new THREE.Mesh(wheelG, dark); w.position.set(sd * 1.48, 0.36, -1.7 + k * 0.66); g.add(w); }
      const sp = new THREE.Mesh(sprG, dark); sp.position.set(sd * 1.46, 0.72, 2.35); g.add(sp);
      const id = new THREE.Mesh(sprG, dark); id.position.set(sd * 1.46, 0.64, -2.35); g.add(id);
    }
    box(2.1, 0.9, 5.2, 0, 0.92, 0);
    box(2.95, 0.06, 5.35, 0, 1.39, 0);
    box(2.75, 0.55, 3.0, 0, 1.69, 0.6);
    box(2.75, 0.42, 2.1, 0, 1.62, -1.5);
    box(0.4, 0.12, 0.06, 0.62, 1.76, 2.11, black);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), grey); ball.position.set(-0.6, 1.7, 2.1); g.add(ball);
    const hmg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), black); hmg.rotation.x = Math.PI / 2; hmg.position.set(-0.6, 1.7, 2.35); g.add(hmg);
    box(0.08, 0.08, 1.6, 1.25, 1.5, -0.3, black); // pioneerityökalut
    const tur = new THREE.Group();
    tur.position.set(0, 1.96, 0.25);
    g.add(tur);
    box(1.75, 0.72, 1.95, 0, 0.36, -0.05, grey, tur);
    box(0.95, 0.5, 0.26, 0, 0.32, 1.02, grey, tur);
    const barrelG = new THREE.CylinderGeometry(0.055, 0.065, 2.2, 10); barrelG.rotateX(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelG, grey); barrel.position.set(0, 0.32, 2.2); barrel.castShadow = true; tur.add(barrel);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.34, 0.3, 14), grey); cup.position.set(0, 0.86, -0.6); cup.castShadow = true; tur.add(cup);
    box(1.3, 0.42, 0.42, 0, 0.36, -1.22, grey, tur);
    const cmd = new THREE.Group();
    cmd.position.set(0, 0.86, -0.6);
    const uni = new THREE.MeshLambertMaterial({ color: 0x1f2022 });
    box(0.42, 0.42, 0.28, 0, 0.32, 0, uni, cmd);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), this.mats.skin); head.position.set(0, 0.64, 0.02); cmd.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), uni); cap.position.set(0, 0.74, 0.02); cmd.add(cap);
    tur.add(cmd);
    // kansallisuustunnus ja tunnusnumero
    const cross = canvasTex(64, 64, (c) => {
      c.clearRect(0, 0, 64, 64);
      c.fillStyle = '#f2f2ee'; c.fillRect(22, 4, 20, 56); c.fillRect(4, 22, 56, 20);
      c.fillStyle = '#141414'; c.fillRect(27, 4, 10, 56); c.fillRect(4, 27, 56, 10);
    }, false);
    const num = canvasTex(128, 64, (c) => {
      c.clearRect(0, 0, 128, 64);
      c.font = 'bold 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 6; c.strokeStyle = '#f2f2ee'; c.strokeText('411', 64, 34);
      c.fillStyle = '#9b1c16'; c.fillText('411', 64, 34);
    }, false);
    const decal = (tex: any, w: number, h: number, x: number, y: number, z: number, ry: number, parent: any) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.position.set(x, y, z); m.rotation.y = ry; parent.add(m);
    };
    for (const sd of [-1, 1]) {
      decal(num, 1.0, 0.5, sd * 0.885, 0.38, -0.3, sd * Math.PI / 2, tur);
      decal(cross, 0.5, 0.5, sd * 1.385, 1.68, -0.7, sd * Math.PI / 2, g);
    }
    decal(cross, 0.45, 0.45, 0, 1.65, -2.56, Math.PI, g);
    return { group: g, turret: tur, cmd, grey, base: 0x6a7075, smoke: null as any };
  }
  private markerTexture(fill: string, stroke: string, glyph = '') {
    return canvasTex(64, 64, (g) => {
      g.clearRect(0, 0, 64, 64);
      g.beginPath(); g.moveTo(32, 6); g.lineTo(56, 30); g.lineTo(32, 54); g.lineTo(8, 30); g.closePath();
      g.fillStyle = fill; g.fill();
      g.lineWidth = 5; g.strokeStyle = stroke; g.stroke();
      if (glyph) { g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, 32, 32); }
    }, false);
  }

  // Asettaa sotilaat tallennetun ruudun mukaan. viewSide = pelaajan puoli (sumu).
  applyFrame(frames: Float32Array, fA: number, fB: number, alpha: number, viewSide: number, selSquad: number) {
    const N = this.sim.soldiers.length;
    let ring = 0;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i++) {
      const a = fA * N * FSTRIDE + i * FSTRIDE, b = fB * N * FSTRIDE + i * FSTRIDE;
      const v = this.sv[i];
      const fl = frames[a + 6];
      const visible = viewSide < 0 || v.side === viewSide || (fl & (viewSide === 0 ? 4 : 8)) !== 0;
      const out = (fl & 16) !== 0;
      v.outer.visible = visible && !out;
      const state = frames[a + 5];
      v.marker.visible = visible && !out && state < ST_INCAP;
      if (!v.outer.visible) continue;
      const x = frames[a] + (frames[b] - frames[a]) * alpha;
      const z = frames[a + 2] + (frames[b + 2] - frames[a + 2]) * alpha;
      const pv = frames[a + 4];
      const fox = pv >= 4;
      const posture = pv % 4;
      const y = this.T.h(x, z) - (fox ? 0.75 : 0);
      let h0 = frames[a + 3], h1 = frames[b + 3];
      let dh = h1 - h0;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      v.outer.position.set(x, y, z);
      v.outer.rotation.y = h0 + dh * alpha;
      const moving = (fl & 1) !== 0;
      if (v.tank) {
        const tk = v.tank;
        const hd = h0 + dh * alpha;
        const fx = Math.sin(hd), fz = Math.cos(hd);
        const hf = this.T.h(x + fx * 2.2, z + fz * 2.2), hb = this.T.h(x - fx * 2.2, z - fz * 2.2);
        const hr = this.T.h(x + fz * 1.3, z - fx * 1.3), hl = this.T.h(x - fz * 1.3, z + fx * 1.3);
        v.outer.position.y = (hf + hb + hr + hl) / 4 - 0.05;
        v.outer.rotation.x = -Math.atan2(hf - hb, 4.4);
        v.outer.rotation.z = Math.atan2(hr - hl, 2.6);
        let t0 = frames[a + 8], dt = frames[b + 8] - t0;
        while (dt > Math.PI) dt -= Math.PI * 2;
        while (dt < -Math.PI) dt += Math.PI * 2;
        tk.turret.rotation.y = t0 + dt * alpha - hd;
        const dead = state >= ST_INCAP;
        tk.cmd.visible = !dead && (fl & 32) === 0;
        tk.grey.color.setHex(dead ? 0x2a2725 : tk.base);
        if (dead) {
          if (!tk.smoke) {
            tk.smoke = [0, 1, 2, 3].map(() => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, transparent: true, depthWrite: false, color: 0x2a2826 })); this.scene.add(sp); return sp; });
          }
          tk.smoke.forEach((sp: any, k: number) => {
            const ph = (this.time * 0.25 + k / 4) % 1;
            sp.visible = true;
            sp.position.set(x + ph * 3, v.outer.position.y + 2.4 + ph * 9, z + ph * 1.5);
            const sz = 2 + ph * 7; sp.scale.set(sz, sz, 1);
            sp.material.opacity = 0.75 * (1 - ph);
          });
        } else if (tk.smoke) tk.smoke.forEach((sp: any) => (sp.visible = false));
        v.marker.position.set(x, v.outer.position.y + 4.2, z);
        const selT = this.sim.soldiers[i].squad === selSquad;
        v.marker.material.map = this.markerTex[selT ? 2 : v.side];
        if (selT && !dead && ring < 16) {
          dummy.position.set(x, this.T.h(x, z) + 0.15, z);
          dummy.scale.set(4.2, 1, 4.2);
          dummy.updateMatrix();
          this.selRing.setMatrixAt(ring++, dummy.matrix);
          dummy.scale.set(1, 1, 1);
        }
        continue;
      }
      this.pose(v, posture, state, moving, i);
      const mh = state >= ST_INCAP ? 0.6 : posture === P_STAND ? 2.4 : posture === P_CROUCH ? 1.9 : 1.2;
      v.marker.position.set(x, y + mh + (fox ? 0.75 : 0), z);
      const sel = this.sim.soldiers[i].squad === selSquad;
      v.marker.material.map = this.markerTex[sel ? 2 : v.side];
      if (sel && state < ST_INCAP && ring < 16) {
        dummy.position.set(x, this.T.h(x, z) + 0.12, z);
        dummy.updateMatrix();
        this.selRing.setMatrixAt(ring++, dummy.matrix);
      }
    }
    this.selRing.count = ring;
    this.selRing.instanceMatrix.needsUpdate = true;
    this.applyGuns(frames, fA, viewSide);
  }
  private pose(v: SoldierVis, posture: number, state: number, moving: boolean, i: number) {
    const dead = state >= ST_INCAP;
    const mat = dead ? this.mats.dead[v.nat] : this.mats.uni[v.nat];
    v.legs.material = mat; v.torso.material = mat;
    v.inner.rotation.set(0, 0, 0);
    v.inner.position.set(0, 0, 0);
    v.gun.rotation.set(0, 0, 0);
    v.legs.scale.set(1, 1, 1);
    v.legs.rotation.set(0, 0, 0);
    if (v.mgMount) v.mgMount.visible = !moving && !dead;
    const bob = moving ? Math.abs(Math.sin(this.time * 9 + i)) * 0.05 : 0;
    if (dead || posture === P_PRONE) {
      v.legs.position.set(0, 0, 0);
      v.torso.position.set(0, 1.12, 0);
      v.pack.position.set(0, 1.15, -0.2);
      v.head.position.set(0, 1.56, 0.02);
      v.helmet.position.set(0, 1.6, 0.02);
      v.gun.position.set(0.18, 1.3, 0.12);
      v.gun.rotation.x = -Math.PI / 2;
      v.inner.rotation.x = Math.PI / 2;
      v.inner.position.set(0, 0.13, -0.8);
      if (dead) { v.inner.rotation.z = 0.9 + hashN(i) * 0.8; v.inner.position.y = 0.1; v.gun.position.set(0.5, 0.9, 0.1); }
      return;
    }
    if (posture === P_CROUCH) {
      v.legs.scale.set(1, 0.6, 1);
      v.legs.position.set(0, 0, 0);
      v.legs.rotation.x = 0.35;
      v.torso.position.set(0, 0.8 + bob, 0.05);
      v.pack.position.set(0, 0.85 + bob, -0.15);
      v.head.position.set(0, 1.24 + bob, 0.08);
      v.helmet.position.set(0, 1.28 + bob, 0.08);
      v.gun.position.set(0.14, 1.12 + bob, 0.12);
      v.gun.rotation.x = 0.02;
      v.inner.rotation.x = 0.12;
      return;
    }
    v.legs.position.set(0, bob * 0.3, 0);
    v.torso.position.set(0, 1.12 + bob, 0);
    v.pack.position.set(0, 1.15 + bob, -0.2);
    v.head.position.set(0, 1.56 + bob, 0.02);
    v.helmet.position.set(0, 1.6 + bob, 0.02);
    v.gun.position.set(0.18, 1.12 + bob, 0.1);
    v.gun.rotation.x = moving ? -0.9 : -0.15;
  }

  showGhosts(list: { x: number; z: number; alpha: number }[]) {
    for (let i = 0; i < this.ghostSprites.length; i++) {
      const sp = this.ghostSprites[i];
      const g = list[i];
      sp.visible = !!g;
      if (g) { sp.position.set(g.x, this.T.h(g.x, g.z) + 1.4, g.z); sp.material.opacity = g.alpha; }
    }
  }

  // ---------------- tehosteet ----------------
  private buildFx() {
    const MAXS = 4000;
    this.tracerPos = new Float32Array(MAXS * 6);
    this.tracerCol = new Float32Array(MAXS * 6);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setDrawRange(0, 0);
    const tl = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    tl.frustumCulled = false;
    tl.renderOrder = 8;
    this.scene.add(tl);
    this.tracerGeo = tg;

    const MAXP = 3000;
    this.ptsPos = new Float32Array(MAXP * 3);
    this.ptsCol = new Float32Array(MAXP * 3);
    this.ptsSize = new Float32Array(MAXP);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.ptsPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(this.ptsCol, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setDrawRange(0, 0);
    const dot = canvasTex(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    }, false);
    const pm = new THREE.PointsMaterial({ size: 1.1, map: dot, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(pg, pm);
    pts.frustumCulled = false;
    pts.renderOrder = 7;
    this.scene.add(pts);
    this.ptsGeo = pg;

    // pöly- ja räjähdyspilvet
    const puff = canvasTex(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      r.addColorStop(0, 'rgba(120,105,85,0.9)'); r.addColorStop(1, 'rgba(120,105,85,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    }, false);
    for (let i = 0; i < 40; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false }));
      sp.visible = false;
      const fl = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      fl.visible = false;
      this.scene.add(sp, fl);
      this.explosions.push({ sp, fl });
    }
    this.puffTex = puff;
    this.smokeTex = canvasTex(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
      r.addColorStop(0, 'rgba(240,240,236,0.95)'); r.addColorStop(0.6, 'rgba(225,226,222,0.6)'); r.addColorStop(1, 'rgba(220,220,215,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    }, false);
    this.dust = [];
    for (let i = 0; i < 120; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0.5 }));
      sp.visible = false;
      this.scene.add(sp);
      this.dust.push(sp);
    }
  }
  puffTex: any;
  dust: any[] = [];

  smokeSprites: any[] = [];
  smokeTex: any;
  // Savupilvet piirretään hetkellä tAbs (absoluuttinen simulaatioaika).
  updateSmoke(tAbs: number) {
    if (!this.smokeSprites.length) {
      for (let i = 0; i < 260; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false }));
        sp.visible = false; sp.renderOrder = 4;
        this.scene.add(sp); this.smokeSprites.push(sp);
      }
    }
    let n = 0;
    for (const c of this.sim.smokes) {
      const st = smokeAt(c, tAbs);
      if (!st) continue;
      const y0 = this.T.h(st.x, st.z);
      for (let k = 0; k < 14 && n < this.smokeSprites.length; k++) {
        const sp = this.smokeSprites[n++];
        const a = hashN(c.id * 31 + k) * Math.PI * 2, rr = Math.sqrt(hashN(c.id * 17 + k * 3)) * st.r * 0.8;
        const hh = hashN(c.id * 13 + k * 7) * c.h * 0.8;
        const drift = Math.sin(tAbs * 0.2 + k) * 0.6;
        sp.visible = true;
        sp.position.set(st.x + Math.cos(a) * rr + drift, y0 + 1 + hh, st.z + Math.sin(a) * rr);
        const sz = st.r * (0.9 + hashN(c.id + k * 11) * 0.6);
        sp.scale.set(sz, sz, 1);
        sp.material.opacity = 0.8 * st.dens;
      }
    }
    for (; n < this.smokeSprites.length; n++) this.smokeSprites[n].visible = false;
  }

  updateFx(t: number, shots: Shot[], impacts: number[], explos: number[], viewSide: number, frames: Float32Array | null) {
    void viewSide; void frames;
    let n = 0, p = 0;
    const tp = this.tracerPos, tc = this.tracerCol, pp = this.ptsPos, pc = this.ptsCol;
    const MAXS = tp.length / 6, MAXP = pp.length / 3;
    for (const s of shots) {
      if (s.t0 > t || s.t1 < t - 0.06) continue;
      // suuliekki
      const fd = s.big ? 0.14 : 0.07;
      if (t - s.t0 < fd && p < MAXP - 6) {
        const k = 1 - (t - s.t0) / fd;
        const n0 = s.big ? 6 : 1;
        for (let j = 0; j < n0; j++) {
          const o = j === 0 ? 0 : 0.5;
          pp[p * 3] = s.x0 + (hashN(j * 3 + s.t0) - 0.5) * o * 2; pp[p * 3 + 1] = s.y0 + (hashN(j * 5 + s.t0) - 0.5) * o; pp[p * 3 + 2] = s.z0 + (hashN(j * 7 + s.t0) - 0.5) * o * 2;
          pc[p * 3] = 1 * k; pc[p * 3 + 1] = 0.75 * k; pc[p * 3 + 2] = 0.35 * k;
          p++;
        }
      }
      if (t > s.t1 || n >= MAXS) continue;
      const u = (t - s.t0) / Math.max(1e-4, s.t1 - s.t0);
      const dx = s.x1 - s.x0, dy = s.y1 - s.y0, dz = s.z1 - s.z0;
      const len = Math.hypot(dx, dy, dz);
      const tail = (s.big ? 24 : s.tracer ? 14 : 4) / Math.max(len, 1);
      const u0 = Math.max(0, u - tail);
      tp[n * 6] = s.x0 + dx * u0; tp[n * 6 + 1] = s.y0 + dy * u0; tp[n * 6 + 2] = s.z0 + dz * u0;
      tp[n * 6 + 3] = s.x0 + dx * u; tp[n * 6 + 4] = s.y0 + dy * u; tp[n * 6 + 5] = s.z0 + dz * u;
      let r: number, g: number, b: number;
      if (s.big) { r = 1; g = 0.85; b = 0.6; }
      else if (s.tracer) { if (s.side === 0) { r = 1; g = 0.42; b = 0.12; } else { r = 0.55; g = 1; b = 0.35; } }
      else { r = 0.55; g = 0.5; b = 0.42; }
      tc[n * 6] = r * 0.15; tc[n * 6 + 1] = g * 0.15; tc[n * 6 + 2] = b * 0.15;
      tc[n * 6 + 3] = r; tc[n * 6 + 4] = g; tc[n * 6 + 5] = b;
      n++;
    }
    // iskemät
    let d = 0;
    for (let i = 0; i < impacts.length; i += 5) {
      const age = t - impacts[i];
      if (age < 0 || age > 0.9) continue;
      if (d < this.dust.length) {
        const sp = this.dust[d++];
        sp.visible = true;
        sp.position.set(impacts[i + 1], impacts[i + 2] + 0.2 + age * 0.6, impacts[i + 3]);
        const sz = 0.4 + age * 1.8;
        sp.scale.set(sz, sz, 1);
        sp.material.opacity = 0.55 * (1 - age / 0.9);
        sp.material.color.setHex(impacts[i + 4] === 1 ? 0xb39a78 : impacts[i + 4] === 2 ? 0x8a3a2a : 0x8f8068);
      }
      if (age < 0.08 && p < MAXP && impacts[i + 4] !== 0) {
        pp[p * 3] = impacts[i + 1]; pp[p * 3 + 1] = impacts[i + 2]; pp[p * 3 + 2] = impacts[i + 3];
        pc[p * 3] = 0.6; pc[p * 3 + 1] = 0.5; pc[p * 3 + 2] = 0.3; p++;
      }
    }
    for (; d < this.dust.length; d++) this.dust[d].visible = false;
    // räjähdykset
    let e = 0;
    for (let i = 0; i < explos.length; i += 5) {
      const age = t - explos[i];
      const k = explos[i + 4] || 1;
      const life = 2.2 * Math.sqrt(k);
      if (age < 0 || age > life || e >= this.explosions.length) continue;
      // iso kranaatti: lisää multapatsas
      const parts = k >= 2 ? 4 : 1;
      for (let q = 1; q < parts && e + q < this.explosions.length; q++) {
        const ex2 = this.explosions[e + q];
        ex2.fl.visible = false;
        ex2.sp.visible = true;
        const a = q * 2.1 + explos[i];
        ex2.sp.position.set(explos[i + 1] + Math.cos(a) * 2.5, explos[i + 2] + 2 + age * (q === 1 ? 6 : 2.5), explos[i + 3] + Math.sin(a) * 2.5);
        const s2 = (3 + age * 4) * (q === 1 ? 1.2 : 1.6);
        ex2.sp.scale.set(s2 * (q === 1 ? 0.6 : 1), s2 * (q === 1 ? 1.6 : 1), 1);
        ex2.sp.material.opacity = 0.9 * (1 - age / life);
        ex2.sp.material.color.setHex(0x6a5844);
      }
      const ex = this.explosions[e];
      e += parts;
      ex.sp.material.color.setHex(k >= 2 ? 0x7d6a52 : 0xffffff);
      ex.fl.visible = age < 0.18 && k >= 0.8;
      ex.fl.position.set(explos[i + 1], explos[i + 2] + 0.4 * k, explos[i + 3]);
      ex.fl.scale.setScalar((0.5 + age * 14) * Math.sqrt(k));
      ex.fl.material.opacity = 1 - age / 0.18;
      ex.sp.visible = true;
      ex.sp.position.set(explos[i + 1], explos[i + 2] + (1 + age * 1.2) * Math.sqrt(k), explos[i + 3]);
      const sz = (2 + age * 5) * k;
      ex.sp.scale.set(sz, sz, 1);
      ex.sp.material.opacity = 0.85 * (1 - age / life);
    }
    for (; e < this.explosions.length; e++) { this.explosions[e].fl.visible = false; this.explosions[e].sp.visible = false; }
    this.tracerGeo.setDrawRange(0, n * 2);
    this.tracerGeo.attributes.position.needsUpdate = true;
    this.tracerGeo.attributes.color.needsUpdate = true;
    this.ptsGeo.setDrawRange(0, p);
    this.ptsGeo.attributes.position.needsUpdate = true;
    this.ptsGeo.attributes.color.needsUpdate = true;
  }

  // ---------------- käskyviivat ----------------
  setPaths(list: { from: { x: number; z: number }; pts: { x: number; z: number; mode: string; wp?: boolean }[]; target?: { x: number; z: number; kind: string } | null; face?: { x: number; z: number; dir: number } | null; dim?: boolean }[]) {
    const grp = this.pathGroup;
    while (grp.children.length) { const c = grp.children.pop(); c.geometry.dispose(); }
    for (const L of list) {
      let ax = L.from.x, az = L.from.z;
      for (const p of L.pts) {
        this.ribbon(ax, az, p.x, p.z, MODE_COLORS[p.mode] ?? 0xffffff, L.dim ? 0.35 : 0.85, 0.35);
        if (p.wp) {
          const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 14), new THREE.MeshBasicMaterial({ color: MODE_COLORS[p.mode] ?? 0xffffff, transparent: true, opacity: L.dim ? 0.4 : 0.9, depthTest: false }));
          disc.rotation.x = -Math.PI / 2;
          disc.position.set(p.x, this.T.h(p.x, p.z) + 0.45, p.z);
          disc.renderOrder = 6;
          grp.add(disc);
        }
        ax = p.x; az = p.z;
      }
      if (L.target) this.ribbon(L.from.x, L.from.z, L.target.x, L.target.z, MODE_COLORS[L.target.kind], L.dim ? 0.3 : 0.8, 0.25, true);
      if (L.face) this.ribbon(L.face.x, L.face.z, L.face.x + Math.sin(L.face.dir) * 14, L.face.z + Math.cos(L.face.dir) * 14, MODE_COLORS.face, 0.8, 0.3);
    }
  }
  private ribbon(ax: number, az: number, bx: number, bz: number, color: number, opacity: number, w: number, straight = false) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(d / 3));
    const px = -(bz - az) / (d || 1) * w, pz = (bx - ax) / (d || 1) * w;
    const v: number[] = [];
    const yA = this.T.h(ax, az) + 1.1, yB = this.T.h(bx, bz) + 1.1;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const y0 = straight ? yA + (yB - yA) * t0 : this.T.h(x0, z0) + 0.5, y1 = straight ? yA + (yB - yA) * t1 : this.T.h(x1, z1) + 0.5;
      v.push(x0 - px, y0, z0 - pz, x1 - px, y1, z1 - pz, x1 + px, y1, z1 + pz, x0 - px, y0, z0 - pz, x1 + px, y1, z1 + pz, x0 + px, y0, z0 + pz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthTest: false }));
    m.renderOrder = 6;
    this.pathGroup.add(m);
  }
  markerGroup: any = null;
  setMarkers(list: { x: number; z: number; r: number; color: number }[]) {
    if (!this.markerGroup) { this.markerGroup = new THREE.Group(); this.scene.add(this.markerGroup); }
    const grp = this.markerGroup;
    while (grp.children.length) { const c = grp.children.pop(); c.geometry.dispose(); c.material.dispose(); }
    for (const m of list) {
      const pts: number[] = [];
      for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; const x = m.x + Math.cos(a) * m.r, z = m.z + Math.sin(a) * m.r; pts.push(x, this.T.h(x, z) + 0.6, z); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: m.color, dashSize: 2, gapSize: 1.5, depthTest: false, transparent: true }));
      line.computeLineDistances(); line.renderOrder = 6;
      grp.add(line);
    }
  }
  setLos(a: { x: number; y: number; z: number } | null, b?: { x: number; y: number; z: number }, block?: { x: number; y: number; z: number } | null) {
    if (!a || !b) { this.losLine.visible = false; return; }
    const pos = this.losLine.geometry.attributes.position.array, col = this.losLine.geometry.attributes.color.array;
    const m = block || b;
    pos.set([a.x, a.y, a.z, m.x, m.y, m.z, m.x, m.y, m.z, b.x, b.y, b.z]);
    col.set([0.45, 0.85, 1, 0.45, 0.85, 1, 1, 0.3, 0.5, 1, 0.3, 0.5]);
    this.losLine.geometry.attributes.position.needsUpdate = true;
    this.losLine.geometry.attributes.color.needsUpdate = true;
    this.losLine.visible = true;
  }

  // ---------------- kamera ----------------
  resize(w: number, h: number) {
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }
  updateCamera() {
    const c = this.cam;
    c.tx = clamp(c.tx, -40, MAP_W + 40); c.tz = clamp(c.tz, -40, MAP_D + 40);
    c.dist = clamp(c.dist, 6, 650);
    c.pitch = clamp(c.pitch, 0.08, 1.45);
    const ty = this.T.h(clamp(c.tx, 0, MAP_W), clamp(c.tz, 0, MAP_D));
    const cx = c.tx + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist;
    const cz = c.tz + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist;
    let cy = ty + Math.sin(c.pitch) * c.dist;
    const gy = this.T.h(clamp(cx, 0, MAP_W), clamp(cz, 0, MAP_D)) + 1.6;
    if (cy < gy) cy = gy;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(c.tx, ty + 1, c.tz);
    // varjokamera seuraa katsetta
    const sd = new THREE.Vector3(0.62, 0.42, -0.66).normalize();
    const span = clamp(c.dist * 0.9, 60, 260);
    const sc = this.sun.shadow.camera;
    if (Math.abs(sc.right - span) > 1) { sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix(); }
    this.sun.position.set(c.tx + sd.x * 400, ty + sd.y * 400, c.tz + sd.z * 400);
    this.sun.target.position.set(c.tx, ty, c.tz);
  }
  pickGround(nx: number, ny: number): { x: number; y: number; z: number } | null {
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    const o = this.raycaster.ray.origin, d = this.raycaster.ray.direction;
    let prev = 0;
    for (let t = 1; t < 2500; t += 1.5) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      if (x < -50 || z < -50 || x > MAP_W + 50 || z > MAP_D + 50) { if (t > 50 && d.y > 0) return null; prev = t; continue; }
      if (y < this.T.h(clamp(x, 0, MAP_W), clamp(z, 0, MAP_D))) {
        let lo = prev, hi = t;
        for (let k = 0; k < 8; k++) {
          const m = (lo + hi) / 2;
          const mx = o.x + d.x * m, mz = o.z + d.z * m;
          if (o.y + d.y * m < this.T.h(clamp(mx, 0, MAP_W), clamp(mz, 0, MAP_D))) hi = m; else lo = m;
        }
        const px = clamp(o.x + d.x * hi, 1, MAP_W - 1), pz = clamp(o.z + d.z * hi, 1, MAP_D - 1);
        return { x: px, y: this.T.h(px, pz), z: pz };
      }
      prev = t;
    }
    return null;
  }
  project(x: number, y: number, z: number, w: number, h: number) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 };
  }
  markerPos(i: number) { return this.sv[i].marker.visible ? this.sv[i].marker.position : null; }
  render(dt: number) {
    this.time += dt;
    this.gl.render(this.scene, this.camera);
  }
}
