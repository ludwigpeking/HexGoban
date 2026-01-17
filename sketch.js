// Hexagonal Goban editor using p5.js
// Modes: move-vertex (default), delete-edge, select (view only)

const spacing = 50;
const hexRadius = 8; // yields 9 vertices per edge
const canvasW = 1920;
const canvasH = 1080;
const sqrt3 = Math.sqrt(3);

let vertices = []; // {id,x,y,type,q,r,neighbors:Set,triangles:Set,quads:Set,peers:number[]}
let edges = [];    // {id,a,b,mid:{x,y},active:true}
let edgeByKey = new Map(); // key "a,b" sorted -> edge id
let edgeTris = new Map();  // key "a,b" -> triangle ids touching
let triangles = []; // {id,verts:[...],active:true}
let quads = [];     // {id,verts:[...],active:true}

let hoverVertex = null;
let hoverEdge = null;
let dragging = null;
let mode = 'move-vertex';

const dirAxial = [
  [1, 0], [0, 1], [-1, 1],
  [-1, 0], [0, -1], [1, -1],
];

function setup() {
  const c = createCanvas(canvasW, canvasH);
  c.parent('app');
  noLoop();
  buildGrid();
  updateUiCounts();
}

function windowResized() {
  // Canvas size is fixed per spec; ignore window changes.
}

function draw() {
  background(15, 17, 23);
  drawSectors();
  drawFaces();
  drawEdges();
  drawVertices();
}

// ---- Grid construction ----
function buildGrid() {
  vertices = [];
  edges = [];
  edgeByKey.clear();
  edgeTris.clear();
  triangles = [];
  quads = [];

  const coordToId = new Map();
  let vid = 0;
  for (let q = -hexRadius; q <= hexRadius; q++) {
    for (let r = -hexRadius; r <= hexRadius; r++) {
      const s = -q - r;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) > hexRadius) continue;
      const pos = axialToPixel(q, r);
      const type = (q === 0 && r === 0) ? 'center' : (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === hexRadius ? 'edge' : 'inner');
      vertices.push({
        id: vid,
        q, r,
        x: pos.x,
        y: pos.y,
        type,
        neighbors: new Set(),
        triangles: new Set(),
        quads: new Set(),
        peers: [],
      });
      coordToId.set(keyCoord(q, r), vid);
      vid++;
    }
  }

  // Neighbors and edges
  for (const v of vertices) {
    for (const d of dirAxial) {
      const nq = v.q + d[0];
      const nr = v.r + d[1];
      const nid = coordToId.get(keyCoord(nq, nr));
      if (nid !== undefined) {
        v.neighbors.add(nid);
        if (v.id < nid) addEdge(v.id, nid);
      }
    }
  }

  // Triangles
  let tid = 0;
  for (const v of vertices) {
    for (let i = 0; i < 6; i++) {
      const n1 = neighborId(v, coordToId, dirAxial[i]);
      const n2 = neighborId(v, coordToId, dirAxial[(i + 1) % 6]);
      if (n1 === null || n2 === null) continue;
      if (v.id < n1 && v.id < n2) {
        const triId = tid++;
        const verts = [v.id, n1, n2];
        triangles.push({ id: triId, verts, active: true });
        verts.forEach((id) => vertices[id].triangles.add(triId));
        addEdgeTriangle(verts[0], verts[1], triId);
        addEdgeTriangle(verts[1], verts[2], triId);
        addEdgeTriangle(verts[2], verts[0], triId);
      }
    }
  }

  // Sector peers (triplets rotated by 120 and 240 degrees)
  for (const v of vertices) {
    const rot1 = rotateAxial120(v.q, v.r);
    const rot2 = rotateAxial240(v.q, v.r);
    const id1 = coordToId.get(keyCoord(rot1.q, rot1.r));
    const id2 = coordToId.get(keyCoord(rot2.q, rot2.r));
    v.peers = [v.id, id1 ?? v.id, id2 ?? v.id];
  }

  updateUiMode();
}

function addEdge(a, b) {
  const id = edges.length;
  const pa = vertices[a];
  const pb = vertices[b];
  const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
  edges.push({ id, a, b, mid, active: true });
  edgeByKey.set(edgeKey(a, b), id);
}

function addEdgeTriangle(a, b, triId) {
  const k = edgeKey(a, b);
  if (!edgeTris.has(k)) edgeTris.set(k, []);
  edgeTris.get(k).push(triId);
}

function neighborId(v, coordToId, delta) {
  const nq = v.q + delta[0];
  const nr = v.r + delta[1];
  const nid = coordToId.get(keyCoord(nq, nr));
  return nid === undefined ? null : nid;
}

// ---- Geometry helpers ----
function axialToPixel(q, r) {
  const x = canvasW / 2 + spacing * (q + r * 0.5);
  const y = canvasH / 2 + spacing * (r * (sqrt3 / 2));
  return { x, y };
}

function rotateAxial120(q, r) {
  // 120-degree rotation in axial (pointy-top) coordinates
  return { q: -q - r, r: q };
}

function rotateAxial240(q, r) {
  // 240-degree rotation (two steps of 120)
  return { q: r, r: -q - r };
}

function rotateVec(x, y, deg) {
  const rad = deg * Math.PI / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: x * c - y * s, y: x * s + y * c };
}

function edgeKey(a, b) {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

function keyCoord(q, r) {
  return `${q},${r}`;
}

// ---- Interaction ----
function mouseMoved() {
  updateHover();
}

function mousePressed() {
  if (mode === 'delete-edge' && hoverEdge !== null) {
    deleteEdgeMirrored(hoverEdge);
    redraw();
    return;
  }
  if (mode === 'move-vertex' && hoverVertex !== null) {
    const v = vertices[hoverVertex];
    if (v.type === 'edge' || v.type === 'center') return;
    dragging = hoverVertex;
  }
}

function mouseDragged() {
  if (dragging === null) return;
  const dx = movedX;
  const dy = movedY;
  moveVertexMirrored(dragging, dx, dy);
  redraw();
}

function mouseReleased() {
  dragging = null;
}

function keyPressed() {
  if (key === 'v' || key === 'V') mode = 'move-vertex';
  if (key === 'e' || key === 'E') mode = 'delete-edge';
  if (key === 's' || key === 'S') mode = 'select';
  updateUiMode();
  redraw();
}

function updateHover() {
  hoverVertex = pickVertex(mouseX, mouseY);
  hoverEdge = mode === 'delete-edge' ? pickEdge(mouseX, mouseY) : null;
  updateUiHover();
  redraw();
}

function pickVertex(mx, my) {
  const radius = 9;
  for (const v of vertices) {
    const d2 = (v.x - mx) ** 2 + (v.y - my) ** 2;
    if (d2 < radius * radius) return v.id;
  }
  return null;
}

function pickEdge(mx, my) {
  const thresh = 10;
  for (const e of edges) {
    if (!e.active) continue;
    const tris = edgeTris.get(edgeKey(e.a, e.b)) || [];
    const activeTris = tris.filter((t) => triangles[t]?.active);
    if (activeTris.length !== 2) continue; // only deletable when merging into quad
    const d = dist(mx, my, e.mid.x, e.mid.y);
    if (d < thresh) return e.id;
  }
  return null;
}

// ---- Editing operations ----
function moveVertexMirrored(vid, dx, dy) {
  const base = vertices[vid];
  if (base.type === 'edge' || base.type === 'center') return;
  const peers = base.peers;
  for (let i = 0; i < peers.length; i++) {
    const pid = peers[i];
    if (pid === undefined || pid === null) continue;
    const v = vertices[pid];
    if (!v) continue;
    let delta = { x: dx, y: dy };
    if (i === 1) delta = rotateVec(dx, dy, 120);
    if (i === 2) delta = rotateVec(dx, dy, 240);
    v.x += delta.x;
    v.y += delta.y;
  }
  refreshEdgeMidpoints(base.peers);
}

function refreshEdgeMidpoints(peerIds) {
  const touched = new Set();
  for (const pid of peerIds) {
    const v = vertices[pid];
    if (!v) continue;
    for (const nid of v.neighbors) {
      const eId = edgeByKey.get(edgeKey(pid, nid));
      if (eId === undefined) continue;
      touched.add(eId);
    }
  }
  for (const eId of touched) {
    const e = edges[eId];
    const a = vertices[e.a];
    const b = vertices[e.b];
    e.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}

function deleteEdgeMirrored(edgeId) {
  const e = edges[edgeId];
  if (!e?.active) return;
  const peersA = vertices[e.a].peers;
  const peersB = vertices[e.b].peers;
  const toDelete = new Set();
  for (let i = 0; i < 3; i++) {
    const a = peersA[i];
    const b = peersB[i];
    if (a === undefined || b === undefined) continue;
    const k = edgeKey(a, b);
    const pid = edgeByKey.get(k);
    if (pid !== undefined) toDelete.add(pid);
  }
  for (const id of toDelete) deleteEdgeSingle(id);
  updateUiCounts();
}

function deleteEdgeSingle(edgeId) {
  const edge = edges[edgeId];
  if (!edge?.active) return;
  const k = edgeKey(edge.a, edge.b);
  const tris = (edgeTris.get(k) || []).filter((t) => triangles[t]?.active);
  if (tris.length !== 2) return; // cannot merge
  const [t0, t1] = tris.map((tid) => triangles[tid]);
  const other0 = t0.verts.find((v) => v !== edge.a && v !== edge.b);
  const other1 = t1.verts.find((v) => v !== edge.a && v !== edge.b);
  // Deactivate edge and triangles
  edge.active = false;
  deactivateTriangle(t0.id);
  deactivateTriangle(t1.id);
  // Drop neighbor relation for the missing edge
  vertices[edge.a].neighbors.delete(edge.b);
  vertices[edge.b].neighbors.delete(edge.a);
  // Create quad ordered by angle around centroid
  const vIds = [edge.a, other0, edge.b, other1];
  const ordered = orderPolygon(vIds);
  const qid = quads.length;
  quads.push({ id: qid, verts: ordered, active: true });
  ordered.forEach((vid) => vertices[vid].quads.add(qid));
}

function deactivateTriangle(tid) {
  const tri = triangles[tid];
  if (!tri?.active) return;
  tri.active = false;
  tri.verts.forEach((vid) => vertices[vid].triangles.delete(tid));
}

function orderPolygon(ids) {
  const pts = ids.map((id) => ({ id, x: vertices[id].x, y: vertices[id].y }));
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  return pts.map((p) => p.id);
}

// ---- Rendering ----
function drawSectors() {
  stroke(50, 70, 110, 120);
  strokeWeight(1);
  const cx = canvasW / 2;
  const cy = canvasH / 2;
  for (let i = 0; i < 3; i++) {
    const ang = -90 + i * 120;
    const dir = rotateVec(0, -1, ang);
    line(cx, cy, cx + dir.x * 1200, cy + dir.y * 1200);
  }
}

function drawFaces() {
  noStroke();
  // Quads
  fill(52, 125, 177, 120);
  for (const q of quads) {
    if (!q.active) continue;
    beginShape();
    q.verts.forEach((vid) => vertex(vertices[vid].x, vertices[vid].y));
    endShape(CLOSE);
  }
  // Triangles
  fill(114, 184, 97, 120);
  for (const t of triangles) {
    if (!t.active) continue;
    beginShape();
    t.verts.forEach((vid) => vertex(vertices[vid].x, vertices[vid].y));
    endShape(CLOSE);
  }
}

function drawEdges() {
  strokeWeight(2);
  for (const e of edges) {
    if (!e.active) continue;
    const tris = edgeTris.get(edgeKey(e.a, e.b)) || [];
    const activeTris = tris.filter((t) => triangles[t]?.active);
    const deletable = activeTris.length === 2;
    const isHover = hoverEdge === e.id;
    if (isHover) {
      stroke(255, 210, 120);
    } else if (mode === 'delete-edge' && deletable) {
      stroke(180, 140, 90, 220);
    } else {
      stroke(200, 210, 230, 180);
    }
    const a = vertices[e.a];
    const b = vertices[e.b];
    line(a.x, a.y, b.x, b.y);
    if (mode === 'delete-edge' && deletable) {
      noStroke();
      fill(isHover ? 255 : 220, 180, 100, isHover ? 240 : 160);
      circle(e.mid.x, e.mid.y, isHover ? 12 : 9);
    }
  }
}

function drawVertices() {
  noStroke();
  for (const v of vertices) {
    let c;
    if (v.type === 'center') c = color(255, 105, 140);
    else if (v.type === 'edge') c = color(120, 190, 255);
    else c = color(240);
    const isHover = hoverVertex === v.id;
    if (isHover) c = color(255, 230, 120);
    fill(c);
    circle(v.x, v.y, v.type === 'center' ? 12 : 7);
  }
}

// ---- UI wiring ----
function updateUiMode() {
  const el = document.getElementById('mode');
  if (el) el.textContent = mode;
}

function updateUiHover() {
  const el = document.getElementById('hover');
  if (!el) return;
  if (hoverVertex !== null) {
    const v = vertices[hoverVertex];
    el.textContent = `vertex ${v.id} (${v.type})`;
  } else if (hoverEdge !== null) {
    const e = edges[hoverEdge];
    el.textContent = `edge ${e.a}-${e.b}`;
  } else {
    el.textContent = 'none';
  }
}

function updateUiCounts() {
  const triCount = triangles.filter((t) => t.active).length;
  const quadCount = quads.filter((q) => q.active).length;
  const tEl = document.getElementById('triCount');
  const qEl = document.getElementById('quadCount');
  if (tEl) tEl.textContent = triCount;
  if (qEl) qEl.textContent = quadCount;
}
