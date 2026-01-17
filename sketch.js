// Hexagonal Goban editor using p5.js
// Modes: move-vertex (default), delete-edge, select (view only)

const spacing = 50;
const hexRadius = 10; // yields 9 vertices per edge
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

// Go game state
let gameStones = new Map(); // vid -> 'black' or 'white'
let currentPlayer = 'black'; // whose turn
let capturedBlack = 0;
let capturedWhite = 0;

let relaxing = false;
let relaxFrame = 0;
let relaxMaxFrames = 20;
let relaxationStrength = spacing * 0.0008; // Scale relative to grid spacing (50 * 0.0008 = 0.04)
let whi = null; // whitehole image
let bhi = null; // blackhole image

let autoRemoving = false;
let autoRemoveIterations = 0;
let autoRemoveMaxIterations = 1000;
let autoRemoveRetries = 0;
let autoRemoveMaxRetries = 50;
let autoRemoveStartSnapshot = null;
let saveLoadStatusEl = null;

function preload() {
  whi = loadImage('images/whitehole.png');
  bhi = loadImage('images/blackhole.png');
}

// Undo/Redo stack
let undoStack = [];
let undoIndex = -1;

const dirAxial = [
  [1, 0], [0, 1], [-1, 1],
  [-1, 0], [0, -1], [1, -1],
];

function setup() {
  const c = createCanvas(canvasW, canvasH);
  c.parent('app');
  noLoop();
  buildGrid();
  captureState('initial');
  updateUiCounts();
  
  // Wire up the relax button
  const relaxBtn = document.getElementById('relaxBtn');
  if (relaxBtn) {
    relaxBtn.addEventListener('click', startRelaxation);
  }
  
  // Wire up undo/redo buttons
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (undoBtn) undoBtn.addEventListener('click', undoStep);
  if (redoBtn) redoBtn.addEventListener('click', redoStep);
  
  // Wire up auto remove button
  const autoRemoveBtn = document.getElementById('autoRemoveBtn');
  if (autoRemoveBtn) {
    autoRemoveBtn.addEventListener('click', startAutoRemoveEdges);
  }

  saveLoadStatusEl = document.getElementById('saveLoadStatus');

  // Wire up save/load buttons
  const saveBtn = document.getElementById('saveBtn');
  const loadBtn = document.getElementById('loadBtn');
  if (saveBtn) saveBtn.addEventListener('click', saveGoban);
  if (loadBtn) loadBtn.addEventListener('click', loadGoban);
  
  // Wire up play mode button
  const playBtn = document.getElementById('playBtn');
  if (playBtn) playBtn.addEventListener('click', togglePlayMode);
  
  updateUndoUI();
}

function windowResized() {
  // Canvas size is fixed per spec; ignore window changes.
}

function draw() {
  background(120, 100, 70);
  drawSectors();
  drawFaces();
  drawEdges();
  drawVertices();
  drawSymbols();
  if (mode === 'play') drawStones();
  
  if (relaxing) {
    relaxFrame++;
    updateRelaxStatus();
    if (relaxFrame < relaxMaxFrames) {
      relaxVertices(1); // single iteration per frame
      redraw();
    } else {
      relaxing = false;
      relaxFrame = 0;
      updateRelaxStatus();
      updateUiCounts();
      noLoop();
    }
  }
  
  if (autoRemoving) {
    autoRemoveIterations++;
    const deleted = autoRemoveEdgesStep();
    const triCount = triangles.filter((t) => t.active).length;
    
    console.log(`Iteration ${autoRemoveIterations} (Retry ${autoRemoveRetries}): deleted=${deleted}, triCount=${triCount}`);
    
    // Check if we're done (no more edges deleted in this pass)
    if (deleted === 0) {
      // One pass done, check if we got full quads
      if (triCount === 0) {
        // Success! Full quads achieved
        console.log('✓ SUCCESS: All triangles merged to quads!');
        autoRemoving = false;
        autoRemoveStartSnapshot = null;
        updateAutoRemoveStatus();
        updateUiCounts();
        noLoop();
      } else if (autoRemoveRetries < autoRemoveMaxRetries) {
        // Failed, retry with different random shuffle
        console.log(`✗ Failed (${triCount} triangles remain). Retrying...`);
        autoRemoveRetries++;
        autoRemoveIterations = 0;
        restoreSnapshot(autoRemoveStartSnapshot);
        updateAutoRemoveStatus();
      } else {
        // Max retries exceeded, revert completely
        console.log(`✗ FAILED after ${autoRemoveMaxRetries} attempts`);
        autoRemoving = false;
        alert(`Failed to achieve full quads after ${autoRemoveMaxRetries} attempts. Reverting.`);
        restoreSnapshot(autoRemoveStartSnapshot);
        autoRemoveStartSnapshot = null;
        updateAutoRemoveStatus();
        updateUiCounts();
        noLoop();
      }
    }
    updateAutoRemoveStatus();
    redraw();
  }
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
      let type;
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === hexRadius) {
        type = 'edge';
      } else {
        type = 'inner';
      }
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
  if (mode === 'play' && hoverVertex !== null) {
    placeStone(hoverVertex);
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
  if (dragging !== null) {
    window.dragStateCapture = false;
  }
  dragging = null;
}

function keyPressed() {
  if (key === 'v' || key === 'V') mode = 'move-vertex';
  if (key === 'e' || key === 'E') mode = 'delete-edge';
  if (key === 's' || key === 'S') mode = 'select';
  if (key === 'p' || key === 'P') togglePlayMode();
  if (key === 'r' || key === 'R') startRelaxation();
  if ((key === 'z' || key === 'Z') && keyIsDown(CONTROL)) {
    if (keyIsDown(SHIFT)) redoStep();
    else undoStep();
  }
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
  // Capture state only on first frame of drag
  if (!window.dragStateCapture) {
    captureState('vertex-move');
    window.dragStateCapture = true;
  }
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
  captureState('edge-delete');
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
  // Sector lines removed - they're not needed for the goban
}

function drawFaces() {
  noStroke();
  // Quads - no fill, just part of the goban
  noFill();
  for (const q of quads) {
    if (!q.active) continue;
    beginShape();
    q.verts.forEach((vid) => vertex(vertices[vid].x, vertices[vid].y));
    endShape(CLOSE);
  }
  // Triangles - no fill, just part of the goban
  noFill();
  for (const t of triangles) {
    if (!t.active) continue;
    beginShape();
    t.verts.forEach((vid) => vertex(vertices[vid].x, vertices[vid].y));
    endShape(CLOSE);
  }
}

function drawEdges() {
  strokeWeight(0.8);
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
      stroke(80, 80, 80, 180);
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
    if (v.visible === false) continue; // hide unused vertices
    // Show only center vertex and edge vertices, not normal inner vertices
    if (v.type === 'inner' && !(v.q === 0 && v.r === 0)) continue;
    let c;
    if (v.type === 'edge') c = color(120, 190, 255);
    else if (v.q === 0 && v.r === 0) {
      // Center vertex - color by edge count
      const edgeCount = v.neighbors.size;
      if (edgeCount === 6 || edgeCount === 5) c = color(255, 255, 255); // white
      else if (edgeCount === 3) c = color(0, 0, 0); // black
      else c = color(150, 150, 150); // default grey
    } else {
      continue; // skip other inner vertices
    }
    const isHover = hoverVertex === v.id;
    if (isHover) c = color(255, 230, 120);
    fill(c);
    circle(v.x, v.y, 7);
  }
}

// ---- UI wiring ----
function updateUiMode() {
  const el = document.getElementById('mode');
  if (el) el.textContent = mode;
  updateGameUI();
}

function updateUiHover() {
  const el = document.getElementById('hover');
  if (!el) return;
  if (hoverVertex !== null) {
    const v = vertices[hoverVertex];
    if (mode === 'play' && gameStones.has(hoverVertex)) {
      const color = gameStones.get(hoverVertex);
      const liberties = getGroupLiberties(hoverVertex);
      el.textContent = `${color} stone at ${v.id} | liberties: ${liberties}${liberties === 1 ? ' (ATARI!)' : ''}`;
    } else {
      el.textContent = `vertex ${v.id} (${v.type})`;
    }
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
  const vertexCount = vertices.filter((v) => v.visible !== false).length;
  const tEl = document.getElementById('triCount');
  const qEl = document.getElementById('quadCount');
  const vEl = document.getElementById('vertexCount');
  if (tEl) tEl.textContent = triCount;
  if (qEl) qEl.textContent = quadCount;
  if (vEl) vEl.textContent = vertexCount;
}

// ---- Relaxation algorithm ----
function startRelaxation() {
  const triCount = triangles.filter((t) => t.active).length;
  if (triCount > 0) {
    alert('Relaxation only available when all faces are quads (no triangles).');
    return;
  }
  captureState('relaxation');
  relaxing = true;
  relaxFrame = 0;
  updateRelaxStatus();
}

function updateRelaxStatus() {
  const statusEl = document.getElementById('relaxStatus');
  const btnEl = document.getElementById('relaxBtn');
  if (relaxing) {
    if (statusEl) statusEl.textContent = `Relaxing: ${relaxFrame}/${relaxMaxFrames}`;
    if (btnEl) btnEl.disabled = true;
  } else {
    if (statusEl) statusEl.textContent = '';
    if (btnEl) btnEl.disabled = false;
  }
}

function relaxVertices(iterations) {
  for (let it = 0; it < iterations; it++) {
    // Precalculate face areas once per iteration (CRITICAL)
    for (const q of quads) {
      if (!q.active) continue;
      q.area = calculateQuadArea(q);
    }

    // Build vertex->adjacent faces map
    const adjFaces = new Map();
    for (const v of vertices) {
      adjFaces.set(v.id, []);
    }
    for (const q of quads) {
      if (!q.active) continue;
      for (const vid of q.verts) {
        adjFaces.get(vid).push(q);
      }
    }

    // Relax ALL vertices based on their own adjacent face centroids
    const adjustments = new Map();
    for (const v of vertices) {
      if (v.type === 'edge') continue;

      const faces = adjFaces.get(v.id) || [];
      if (faces.length === 0) continue;

      // Calculate area-weighted centroid
      let weightedX = 0, weightedY = 0, totalWeight = 0;
      for (const face of faces) {
        const centroid = getFaceCentroid(face);
        const weight = face.area || 1;
        weightedX += centroid.x * weight;
        weightedY += centroid.y * weight;
        totalWeight += weight;
      }

      if (totalWeight > 0) {
        adjustments.set(v.id, {
          x: weightedX / totalWeight,
          y: weightedY / totalWeight,
        });
      }
    }

    // Apply adjustments with strength factor to all vertices
    adjustments.forEach((centroid, vid) => {
      const v = vertices[vid];
      v.x += (centroid.x - v.x) * relaxationStrength;
      v.y += (centroid.y - v.y) * relaxationStrength;
    });

    refreshAllEdgeMidpoints();
  }
}

function calculateQuadArea(quad) {
  // Shoelace formula for polygon area
  let area = 0;
  const n = quad.verts.length;
  for (let i = 0; i < n; i++) {
    const v1 = vertices[quad.verts[i]];
    const v2 = vertices[quad.verts[(i + 1) % n]];
    area += v1.x * v2.y - v2.x * v1.y;
  }
  return Math.abs(area) / 2;
}

function getFaceCentroid(face) {
  let sumX = 0, sumY = 0;
  for (const vid of face.verts) {
    const v = vertices[vid];
    sumX += v.x;
    sumY += v.y;
  }
  return { x: sumX / face.verts.length, y: sumY / face.verts.length };
}

function refreshAllEdgeMidpoints() {
  for (const e of edges) {
    if (!e.active) continue;
    const a = vertices[e.a];
    const b = vertices[e.b];
    e.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}

function rebuildEdgesFromFaces() {
  // Clear existing edge structures
  edges = [];
  edgeByKey.clear();
  edgeTris.clear();
  
  // Update vertex neighbors
  vertices.forEach(v => v.neighbors.clear());
  
  // Rebuild edges from active quads
  for (const quad of quads) {
    if (!quad.active) continue;
    
    for (let i = 0; i < quad.verts.length; i++) {
      const v1 = quad.verts[i];
      const v2 = quad.verts[(i + 1) % quad.verts.length];
      
      // Add neighbor relationship
      vertices[v1].neighbors.add(v2);
      vertices[v2].neighbors.add(v1);
      
      // Add edge if not exists
      const key = edgeKey(v1, v2);
      if (!edgeByKey.has(key)) {
        const edgeId = edges.length;
        const mid = {
          x: (vertices[v1].x + vertices[v2].x) / 2,
          y: (vertices[v1].y + vertices[v2].y) / 2
        };
        edges.push({ id: edgeId, a: v1, b: v2, mid, active: true });
        edgeByKey.set(key, edgeId);
      }
    }
  }
}

// ---- Symbol rendering ----
function drawSymbols() {
  for (const v of vertices) {
    if (v.type !== 'inner') continue; // Only on inner vertices
    const edgeCount = v.neighbors.size;

    if (edgeCount === 6 || edgeCount === 5) {
      // White hole
      if (whi) {
        push();
        imageMode(CENTER);
        image(whi, v.x, v.y, edgeCount*4, edgeCount*4);
        pop();
      } else {
        fill(255);
        stroke(200);
        strokeWeight(2);
        circle(v.x, v.y, 12);
      }
    } else if (edgeCount === 3) {
      // Black hole
      if (bhi) {
        push();
        imageMode(CENTER);
        image(bhi, v.x, v.y, edgeCount*4, edgeCount*4);
        pop();
      } else {
        fill(20);
        stroke(100);
        strokeWeight(2);
        circle(v.x, v.y, 12);
      }
    }
  }
}

// ---- Go Game Mode ----
function togglePlayMode() {
  if (mode === 'play') {
    mode = 'move-vertex';
  } else {
    mode = 'play';
    gameStones.clear();
    currentPlayer = 'black';
    capturedBlack = 0;
    capturedWhite = 0;
  }
  updateUiMode();
  updateGameUI();
  redraw();
}

function drawStones() {
  for (const [vid, color] of gameStones) {
    const v = vertices[vid];
    if (!v || v.visible === false) continue;
    
    const liberties = getGroupLiberties(vid);
    const isAtari = liberties === 1;
    
    // Draw atari warning ring
    if (isAtari) {
      noFill();
      stroke(255, 80, 80);
      strokeWeight(3);
      circle(v.x, v.y, 38);
    }
    
    // Draw stone
    noStroke();
    if (color === 'black') {
      fill(20, 20, 25);
      circle(v.x, v.y, spacing*0.65);
      // Shine effect
      fill(80, 80, 90, 120);
      circle(v.x - 4, v.y - 4, spacing*0.25);
    } else {
      fill(250, 250, 245);
      circle(v.x, v.y, spacing*0.65);
      // Shadow effect
      fill(200, 200, 195, 80);
      circle(v.x + 3, v.y + 3, spacing*0.25);
    }
    
    // Show liberties (chi) on hover
    if (hoverVertex === vid) {
      fill(255, 200, 80);
      noStroke();
      textAlign(CENTER, CENTER);
      textSize(12);
      text(liberties, v.x, v.y - 20);
    }
  }
}

function placeStone(vid) {
  // Can't place on occupied vertex
  if (gameStones.has(vid)) return;
  
  // Can't place on invisible vertices
  const v = vertices[vid];
  if (v.visible === false) return;
  
  // Place the stone
  gameStones.set(vid, currentPlayer);
  
  // Check for captures of opponent groups
  const opponent = currentPlayer === 'black' ? 'white' : 'black';
  const neighbors = Array.from(v.neighbors);
  
  for (const nid of neighbors) {
    if (gameStones.get(nid) === opponent) {
      const liberties = getGroupLiberties(nid);
      if (liberties === 0) {
        // Capture this group
        const group = getGroup(nid);
        for (const gvid of group) {
          gameStones.delete(gvid);
          if (opponent === 'black') capturedBlack++;
          else capturedWhite++;
        }
      }
    }
  }
  
  // Check if our own move is suicide (no liberties and didn't capture anything)
  const ourLiberties = getGroupLiberties(vid);
  if (ourLiberties === 0) {
    // Suicide move - not allowed, revert
    gameStones.delete(vid);
    alert('Suicide move not allowed!');
    return;
  }
  
  // Switch player
  currentPlayer = opponent;
  updateGameUI();
}

function getGroup(vid) {
  // BFS to find all connected stones of same color
  const color = gameStones.get(vid);
  if (!color) return new Set();
  
  const group = new Set([vid]);
  const queue = [vid];
  
  while (queue.length > 0) {
    const curr = queue.shift();
    const v = vertices[curr];
    
    for (const nid of v.neighbors) {
      if (gameStones.get(nid) === color && !group.has(nid)) {
        group.add(nid);
        queue.push(nid);
      }
    }
  }
  
  return group;
}

function getGroupLiberties(vid) {
  // Get the group
  const group = getGroup(vid);
  const liberties = new Set();
  
  // Check all empty neighbors of all stones in the group
  for (const gvid of group) {
    const v = vertices[gvid];
    for (const nid of v.neighbors) {
      if (!gameStones.has(nid) && vertices[nid].visible !== false) {
        liberties.add(nid);
      }
    }
  }
  
  return liberties.size;
}

function updateGameUI() {
  const gameInfoEl = document.getElementById('gameInfo');
  if (!gameInfoEl) return;
  
  if (mode === 'play') {
    gameInfoEl.textContent = `Turn: ${currentPlayer.toUpperCase()} | Captured: Black ${capturedBlack}, White ${capturedWhite}`;
  } else {
    gameInfoEl.textContent = '';
  }
}

// ---- Auto edge removal ----
function startAutoRemoveEdges() {
  const triCount = triangles.filter((t) => t.active).length;
  if (triCount === 0) {
    alert('No triangles to remove.');
    return;
  }
  
  console.log('=== AUTO REMOVE STARTED ===');
  console.log(`Active triangles: ${triCount}`);
  console.log(`Total edges: ${edges.length}`);
  console.log(`Edge-Tri Map size: ${edgeTris.size}`);
  
  // Apply the guaranteed quadrangulation pipeline
  applyGuaranteedQuadrangulation();
}

function applyGuaranteedQuadrangulation() {
  captureState('quadrangulation');
  
  console.log('Step 1: Reducing grid to inner region...');
  // STEP 1: Keep only inner radius=4 region (vertices are reduced by half)
  const targetRadius = Math.floor(hexRadius / 2);
  deactivateFacesOutsideRadius(targetRadius);
  console.log(`Grid reduced to radius ${targetRadius}`);

  console.log('Step 1.5: Marking border vertices...');
  // STEP 1.5: Mark border vertices before scaling/subdivision
  markBorderVertices(targetRadius);
  
  console.log('Step 2: Scaling grid by 2x (doubling spacing)...');
  // STEP 2: Double the spacing (so subdivision will bring it back to normal)
  scaleGridByFactor(2.0);
  
  console.log('Step 3: Random triangle merging...');
  // STEP 3: Try to merge adjacent triangles randomly
  const mergeResult = mergeTrianglesRandomly();
  console.log(`Merged ${mergeResult.merged} triangle pairs into quads`);
  console.log(`Remaining: ${triangles.filter(t => t.active).length} triangles, ${quads.filter(q => q.active).length} quads`);
  
  console.log('Step 4: Subdividing all faces...');
  // STEP 4: Subdivide ALL remaining faces (doubles vertices, halves effective spacing back to normal)
  subdivideFaces();
  console.log(`After subdivision: ${triangles.filter(t => t.active).length} triangles, ${quads.filter(q => q.active).length} quads`);
  
  console.log('Step 5: Cleaning up old data structures...');
  // STEP 5: Remove all inactive triangles and old edges
  cleanupInactiveElements();

  // Mark which vertices are actually used (to hide stray ones when drawing)
  markVisibleVertices();
  
  updateUiCounts();
  redraw();
}

function scaleGridByFactor(factor) {
  const centerX = canvasW / 2;
  const centerY = canvasH / 2;
  
  // Scale all vertex positions from center
  for (const v of vertices) {
    const dx = v.x - centerX;
    const dy = v.y - centerY;
    v.x = centerX + dx * factor;
    v.y = centerY + dy * factor;
  }
  
  // Update edge midpoints
  for (const e of edges) {
    if (!e.active) continue;
    const a = vertices[e.a];
    const b = vertices[e.b];
    e.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  
  console.log(`Grid scaled by ${factor}x`);
}

function cleanupInactiveElements() {
  // Remove all inactive triangles
  const activeTriCount = triangles.filter(t => t.active).length;
  triangles = triangles.filter(t => t.active);
  console.log(`Removed ${activeTriCount} inactive triangles`);
  
  // Keep all quads (they're all active after subdivision)
  const activeQuadCount = quads.filter(q => q.active).length;
  console.log(`Kept ${activeQuadCount} active quads`);
  
  // Rebuild edges completely from active quads only
  rebuildEdgesFromFaces();
  console.log(`Rebuilt ${edges.length} edges`);
}

function markVisibleVertices() {
  const used = new Set();
  for (const q of quads) {
    if (!q.active) continue;
    q.verts.forEach((vid) => used.add(vid));
  }
  vertices.forEach((v, idx) => {
    v.visible = used.has(idx);
  });
}

// ---- Save/Load Goban ----
function saveGoban() {
  const data = {
    version: 1,
    hexRadius,
    spacing,
    vertices: vertices.map((v) => ({
      id: v.id,
      x: v.x,
      y: v.y,
      type: v.type,
      q: v.q ?? 0,
      r: v.r ?? 0,
      peers: v.peers ?? [v.id, v.id, v.id],
    })),
    quads: quads.filter((q) => q.active).map((q) => ({ verts: [...q.verts] })),
  };

  const fname = `goban_${Date.now()}.json`;
  saveJSON(data, fname);
  if (saveLoadStatusEl) saveLoadStatusEl.textContent = `Saved ${fname}`;
}

function loadGoban() {
  const picker = createFileInput(handleFile, false);
  picker.elt.accept = 'application/json';
  picker.elt.click();

  function handleFile(file) {
    if (file?.type === 'application' && file.subtype === 'json') {
      const data = file.data || file.string;
      try {
        const json = typeof data === 'string' ? JSON.parse(data) : data;
        restoreGoban(json);
        if (saveLoadStatusEl) saveLoadStatusEl.textContent = 'Loaded goban';
      } catch (e) {
        console.error('Failed to load goban', e);
        if (saveLoadStatusEl) saveLoadStatusEl.textContent = 'Load failed';
      }
    }
    picker.remove();
  }
}

function restoreGoban(data) {
  // Reset structures
  vertices = [];
  edges = [];
  edgeByKey.clear();
  edgeTris.clear();
  triangles = [];
  quads = [];

  // Restore vertices
  data.vertices.forEach((v) => {
    vertices.push({
      id: v.id,
      x: v.x,
      y: v.y,
      type: v.type,
      q: v.q ?? 0,
      r: v.r ?? 0,
      neighbors: new Set(),
      triangles: new Set(),
      quads: new Set(),
      peers: v.peers ?? [v.id, v.id, v.id],
      visible: true,
    });
  });

  // Restore quads
  if (Array.isArray(data.quads)) {
    data.quads.forEach((q, idx) => {
      quads.push({ id: idx, verts: [...q.verts], active: true });
    });
  }

  // Rebuild edges and mark visibility
  rebuildEdgesFromFaces();
  markVisibleVertices();
  updateUiCounts();
  redraw();
  captureState('load');
}

function deactivateFacesOutsideRadius(maxRadius) {
  // Deactivate all triangles and quads that have any vertex outside maxRadius
  for (const tri of triangles) {
    if (!tri.active) continue;
    const hasOutsideVertex = tri.verts.some(vid => {
      const v = vertices[vid];
      const dist = Math.max(Math.abs(v.q), Math.abs(v.r), Math.abs(-v.q - v.r));
      return dist > maxRadius;
    });
    if (hasOutsideVertex) {
      tri.active = false;
    }
  }
  
  for (const quad of quads) {
    if (!quad.active) continue;
    const hasOutsideVertex = quad.verts.some(vid => {
      const v = vertices[vid];
      const dist = Math.max(Math.abs(v.q), Math.abs(v.r), Math.abs(-v.q - v.r));
      return dist > maxRadius;
    });
    if (hasOutsideVertex) {
      quad.active = false;
    }
  }
}

function markBorderVertices(borderRadius) {
  // Mark all vertices at exactly borderRadius distance as 'edge' type
  for (const v of vertices) {
    const dist = Math.max(Math.abs(v.q), Math.abs(v.r), Math.abs(-v.q - v.r));
    if (dist === borderRadius) {
      v.type = 'edge';
    }
  }
}

function mergeTrianglesRandomly() {
  // Build all possible triangle pairs that share an edge
  const pairs = [];
  for (let i = 0; i < triangles.length; i++) {
    if (!triangles[i]?.active) continue;
    for (let j = i + 1; j < triangles.length; j++) {
      if (!triangles[j]?.active) continue;
      
      const shared = triangles[i].verts.filter(v => triangles[j].verts.includes(v));
      if (shared.length === 2) {
        pairs.push([i, j, shared]);
      }
    }
  }
  
  // Shuffle pairs randomly
  shuffleArray(pairs);
  
  const merged = new Set();
  let mergeCount = 0;
  
  for (const [triAId, triBId, shared] of pairs) {
    if (merged.has(triAId) || merged.has(triBId)) continue;
    if (!triangles[triAId]?.active || !triangles[triBId]?.active) continue;
    
    // Find the edge connecting them
    const edgeId = edgeByKey.get(edgeKey(shared[0], shared[1]));
    if (edgeId !== undefined && edges[edgeId]?.active) {
      deleteEdgeSingle(edgeId);
      mergeCount++;
      merged.add(triAId).add(triBId);
    }
  }
  
  return { merged: mergeCount };
}

function subdivideFaces() {
  // Create a map to store edge midpoints (to avoid duplicates)
  const edgeMidpoints = new Map();
  
  const getOrCreateMidpoint = (vid1, vid2) => {
    const key = edgeKey(vid1, vid2);
    if (edgeMidpoints.has(key)) {
      return edgeMidpoints.get(key);
    }
    
    const v1 = vertices[vid1];
    const v2 = vertices[vid2];
    const newId = vertices.length;
    
    // If both vertices are on border, midpoint is also on border
    const isBorder = (v1.type === 'edge' && v2.type === 'edge');
    
    const newVertex = {
      id: newId,
      x: (v1.x + v2.x) / 2,
      y: (v1.y + v2.y) / 2,
      q: 0, r: 0, // Subdivided vertices don't have hex coordinates
      type: isBorder ? 'edge' : 'inner',
      neighbors: new Set(),
      triangles: new Set(),
      quads: new Set(),
      peers: [newId, newId, newId], // Self-reference (no rotation symmetry)
    };
    
    vertices.push(newVertex);
    edgeMidpoints.set(key, newId);
    return newId;
  };
  
  const getFaceCenter = (vertIds) => {
    let sumX = 0, sumY = 0;
    for (const vid of vertIds) {
      sumX += vertices[vid].x;
      sumY += vertices[vid].y;
    }
    const newId = vertices.length;
    const newVertex = {
      id: newId,
      x: sumX / vertIds.length,
      y: sumY / vertIds.length,
      q: 0, r: 0,
      type: 'inner',
      neighbors: new Set(),
      triangles: new Set(),
      quads: new Set(),
      peers: [newId, newId, newId],
    };
    vertices.push(newVertex);
    return newId;
  };
  
  const newQuads = [];
  
  // Subdivide all active triangles
  for (const tri of triangles) {
    if (!tri.active) continue;
    
    const verts = tri.verts; // [v0, v1, v2]
    
    // Create edge midpoints
    const mid01 = getOrCreateMidpoint(verts[0], verts[1]);
    const mid12 = getOrCreateMidpoint(verts[1], verts[2]);
    const mid20 = getOrCreateMidpoint(verts[2], verts[0]);
    
    // Create face center
    const center = getFaceCenter(verts);
    
    // Create 3 quads (one for each original vertex)
    newQuads.push({
      id: quads.length + newQuads.length,
      verts: orderPolygon([verts[0], mid01, center, mid20]),
      active: true
    });
    newQuads.push({
      id: quads.length + newQuads.length,
      verts: orderPolygon([verts[1], mid12, center, mid01]),
      active: true
    });
    newQuads.push({
      id: quads.length + newQuads.length,
      verts: orderPolygon([verts[2], mid20, center, mid12]),
      active: true
    });
    
    tri.active = false; // Deactivate original triangle
  }
  
  // Subdivide all active quads
  for (const quad of quads) {
    if (!quad.active) continue;
    
    const verts = quad.verts; // [v0, v1, v2, v3]
    
    // Create edge midpoints
    const mid01 = getOrCreateMidpoint(verts[0], verts[1]);
    const mid12 = getOrCreateMidpoint(verts[1], verts[2]);
    const mid23 = getOrCreateMidpoint(verts[2], verts[3]);
    const mid30 = getOrCreateMidpoint(verts[3], verts[0]);
    
    // Create face center
    const center = getFaceCenter(verts);
    
    // Create 4 quads (one for each original vertex)
    newQuads.push({
      id: quads.length + newQuads.length,
      verts: orderPolygon([verts[0], mid01, center, mid30]),
      active: true
    });
    newQuads.push({
      id: quads.length + newQuads.length,
      verts: orderPolygon([verts[1], mid12, center, mid01]),
      active: true
    });
    newQuads.push({
      id: quads.length + newQuads.length,
      verts: orderPolygon([verts[2], mid23, center, mid12]),
      active: true
    });
    newQuads.push({
      id: quads.length + newQuads.length,
      verts: orderPolygon([verts[3], mid30, center, mid23]),
      active: true
    });
    
    quad.active = false; // Deactivate original quad
  }
  
  // Add all new quads
  newQuads.forEach(q => {
    quads.push(q);
    q.verts.forEach(vid => vertices[vid].quads.add(q.id));
  });
  
  // Rebuild edges and edge maps
  rebuildEdgesFromFaces();
}

function autoRemoveEdgesStep() {
  // PASS 1: Try standard merging (edges with exactly 2 triangles)
  const edges_to_delete = [];
  
  for (const [edgeKeyStr, triIds] of edgeTris) {
    const activeTris = triIds.filter((triId) => triangles[triId]?.active);
    if (activeTris.length === 2) {
      const edgeId = edgeByKey.get(edgeKeyStr);
      if (edgeId !== undefined && edges[edgeId]?.active) {
        edges_to_delete.push(edgeId);
      }
    }
  }

  shuffleArray(edges_to_delete);

  const merged_tris = new Set();
  let deleted = 0;

  for (const edgeId of edges_to_delete) {
    const edge = edges[edgeId];
    if (!edge?.active) continue;
    
    const edgeKeyStr = edgeKey(edge.a, edge.b);
    const triIds = (edgeTris.get(edgeKeyStr) || []).filter((t) => triangles[t]?.active);
    
    if (triIds.length !== 2) continue;
    const [tri1Id, tri2Id] = triIds;
    
    if (merged_tris.has(tri1Id) || merged_tris.has(tri2Id)) continue;

    deleteEdgeSingle(edgeId);
    deleted++;
    merged_tris.add(tri1Id).add(tri2Id);
  }

  console.log(`Pass: Found ${edges_to_delete.length} edges, deleted ${deleted}`);
  
  // PASS 2: If we still have triangles, try greedy fallback (any shared pair)
  const triCount = triangles.filter((t) => t.active).length;
  if (triCount > 0 && deleted === 0) {
    console.log(`Fallback: ${triCount} triangles stuck, trying greedy merge...`);
    
    // Find ANY pair of triangles that share an edge
    const pairs = [];
    for (let i = 0; i < triangles.length; i++) {
      if (!triangles[i]?.active) continue;
      for (let j = i + 1; j < triangles.length; j++) {
        if (!triangles[j]?.active) continue;
        
        const shared = triangles[i].verts.filter(v => triangles[j].verts.includes(v));
        if (shared.length === 2) {
          pairs.push([i, j, shared]);
        }
      }
    }
    
    shuffleArray(pairs);
    const merged_tris_fallback = new Set();
    
    for (const [triAId, triBId, shared] of pairs) {
      if (merged_tris_fallback.has(triAId) || merged_tris_fallback.has(triBId)) continue;
      if (!triangles[triAId]?.active || !triangles[triBId]?.active) continue;
      
      // Find edge connecting them
      const edgeId = edgeByKey.get(edgeKey(shared[0], shared[1]));
      if (edgeId !== undefined && edges[edgeId]?.active) {
        deleteEdgeSingle(edgeId);
        deleted++;
        merged_tris_fallback.add(triAId).add(triBId);
        
        if (deleted >= 10) break; // Limit fallback per pass
      }
    }
    
    console.log(`Fallback: Merged ${deleted} more triangles`);
  }

  return deleted;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}


function updateAutoRemoveStatus() {
  const statusEl = document.getElementById('autoRemoveStatus');
  const btnEl = document.getElementById('autoRemoveBtn');
  if (autoRemoving) {
    if (statusEl) statusEl.textContent = `Removing: iter ${autoRemoveIterations}, retry ${autoRemoveRetries}/${autoRemoveMaxRetries}`;
    if (btnEl) btnEl.disabled = true;
  } else {
    if (statusEl) statusEl.textContent = '';
    if (btnEl) btnEl.disabled = false;
  }
}

// ---- Symbol rendering ----

// ---- Undo/Redo system ----
function captureStateSnapshot() {
  // Returns a snapshot without adding to undo stack (for temp saves like auto-remove retries)
  return {
    vertices: vertices.map(v => ({
      id: v.id, q: v.q, r: v.r, x: v.x, y: v.y, type: v.type,
      neighbors: new Set(v.neighbors), triangles: new Set(v.triangles),
      quads: new Set(v.quads), peers: [...v.peers],
    })),
    edges: edges.map(e => ({
      id: e.id, a: e.a, b: e.b, mid: { x: e.mid.x, y: e.mid.y }, active: e.active,
    })),
    triangles: triangles.map(t => ({
      id: t.id, verts: [...t.verts], active: t.active,
    })),
    quads: quads.map(q => ({
      id: q.id, verts: [...q.verts], active: q.active, area: q.area,
    })),
  };
}

function captureState(actionLabel) {
  // Truncate redo stack
  undoStack.splice(undoIndex + 1);
  
  // Create snapshot
  const snapshot = captureStateSnapshot();
  snapshot.label = actionLabel;
  
  undoStack.push(snapshot);
  undoIndex++;
  updateUndoUI();
}

function undoStep() {
  if (undoIndex <= 0) return; // No undo available
  undoIndex--;
  restoreSnapshot(undoStack[undoIndex]);
}

function redoStep() {
  if (undoIndex >= undoStack.length - 1) return; // No redo available
  undoIndex++;
  restoreSnapshot(undoStack[undoIndex]);
}

function restoreSnapshot(snapshot) {
  // Clear and rebuild data structures
  vertices = snapshot.vertices.map(v => ({
    id: v.id, q: v.q, r: v.r, x: v.x, y: v.y, type: v.type,
    neighbors: new Set(v.neighbors), triangles: new Set(v.triangles),
    quads: new Set(v.quads), peers: v.peers,
  }));
  
  edges = snapshot.edges.map(e => ({
    id: e.id, a: e.a, b: e.b, mid: { x: e.mid.x, y: e.mid.y }, active: e.active,
  }));
  
  // Rebuild edgeByKey and edgeTris
  edgeByKey.clear();
  edgeTris.clear();
  edges.forEach(e => {
    edgeByKey.set(edgeKey(e.a, e.b), e.id);
  });
  
  triangles = snapshot.triangles.map(t => ({
    id: t.id, verts: t.verts, active: t.active,
  }));
  
  quads = snapshot.quads.map(q => ({
    id: q.id, verts: q.verts, active: q.active, area: q.area,
  }));
  
  // Rebuild edge-triangle mapping
  triangles.forEach(t => {
    if (!t.active) return;
    const [v0, v1, v2] = t.verts;
    addEdgeTriangleMapped(v0, v1, t.id);
    addEdgeTriangleMapped(v1, v2, t.id);
    addEdgeTriangleMapped(v2, v0, t.id);
  });
  
  updateUiCounts();
  updateUndoUI();
  redraw();
}

function addEdgeTriangleMapped(a, b, triId) {
  const k = edgeKey(a, b);
  if (!edgeTris.has(k)) edgeTris.set(k, []);
  edgeTris.get(k).push(triId);
}

function updateUndoUI() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const undoStatus = document.getElementById('undoStatus');
  
  if (undoBtn) undoBtn.disabled = undoIndex <= 0;
  if (redoBtn) redoBtn.disabled = undoIndex >= undoStack.length - 1;
  if (undoStatus) undoStatus.textContent = `Undo: ${undoIndex}/${undoStack.length - 1}`;
}

function subdivideMesh() {
    let newFaces = []; 

    faces.forEach((face) => {
        // 1. Get/Create edge midpoints
        let midpoints = [];
        for (let i = 0; i < face.vertices.length; i++) {
            let v1 = face.vertices[i];
            let v2 = face.vertices[(i + 1) % face.vertices.length];
            midpoints.push(getOrCreateEdgeMidpoint(v1, v2));
        }

        // 2. Create face center
        let centerVertex = createFaceCenter(face.vertices);

        // 3. Form new quads connecting Vertices -> Midpoints -> Center
        for (let i = 0; i < face.vertices.length; i++) {
            let newQuadVertices = [
                face.vertices[i],
                midpoints[i],
                centerVertex,
                midpoints[(i - 1 + midpoints.length) % midpoints.length],
            ];
            newFaces.push(new Face(newQuadVertices));
        }
    });

    faces = newFaces; // Replace old mixed faces with guaranteed quads
}

function getOrCreateEdgeMidpoint(v1, v2) {
    // Unique key for the edge between two vertices
    let edgeKey = `${Math.min(v1.index, v2.index)}-${Math.max(v1.index, v2.index)}`;
    
    if (edgeMidpointMap.has(edgeKey)) {
        return edgeMidpointMap.get(edgeKey);
    } else {
        let midpoint = new SubdivVertex((v1.x + v2.x) / 2, (v1.y + v2.y) / 2);
        if (v1.edgy && v2.edgy) midpoint.edgy = true; // Keep boundaries sharp
        subdivVertices.push(midpoint);
        edgeMidpointMap.set(edgeKey, midpoint);
        return midpoint;
    }
}

function relaxVertexPosition(vertex, strength = 0.08) {
    if (vertex.edgy || !vertex.adjacentFaces || vertex.adjacentFaces.length === 0) return;

    let weightedSumX = 0, weightedSumY = 0, totalWeight = 0;

    vertex.adjacentFaces.forEach((face) => {
        let centroid = getFaceCentroid(face);
        let weight = face.area; // Larger faces "pull" harder

        weightedSumX += centroid.x * weight;
        weightedSumY += centroid.y * weight;
        totalWeight += weight;
    });

    if (totalWeight > 0) {
        vertex.x += (weightedSumX / totalWeight - vertex.x) * strength;
        vertex.y += (weightedSumY / totalWeight - vertex.y) * strength;
    }
}