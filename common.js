// Common functions shared between screen and print versions
// These functions are independent of spacing/size parameters

const sqrt3 = Math.sqrt(3);
const dirAxial = [
  [1, 0], [0, 1], [-1, 1],
  [-1, 0], [0, -1], [1, -1],
];
const KOMI = 7.5; // Komi compensation for White

// ---- Utility functions ----
function keyCoord(q, r) {
  return `${q},${r}`;
}

function edgeKey(a, b) {
  return a < b ? `${a},${b}` : `${b},${a}`;
}

function neighborId(v, coordToId, dir) {
  const nq = v.q + dir[0];
  const nr = v.r + dir[1];
  return coordToId.get(keyCoord(nq, nr)) ?? null;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function orderPolygon(ids) {
  const pts = ids.map((id) => ({ id, x: vertices[id].x, y: vertices[id].y }));
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  pts.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  return pts.map((p) => p.id);
}

// ---- Coordinate conversion ----
function axialToPixel(q, r, spacing, centerX, centerY) {
  const x = centerX + spacing * (q + r * 0.5);
  const y = centerY + spacing * (r * (sqrt3 / 2));
  return { x, y };
}

// ---- Grid face/area calculations ----
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

// ---- Edge manipulation ----
function addEdge(a, b) {
  const key = edgeKey(a, b);
  if (edgeByKey.has(key)) return;
  const id = edges.length;
  const va = vertices[a];
  const vb = vertices[b];
  edges.push({
    id,
    a,
    b,
    mid: { x: (va.x + vb.x) / 2, y: (va.y + vb.y) / 2 },
    active: true,
  });
  edgeByKey.set(key, id);
}

function refreshAllEdgeMidpoints() {
  for (const e of edges) {
    if (!e.active) continue;
    const a = vertices[e.a];
    const b = vertices[e.b];
    e.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
}

function addEdgeTriangleMapped(a, b, triId) {
  const k = edgeKey(a, b);
  if (!edgeTris.has(k)) edgeTris.set(k, []);
  edgeTris.get(k).push(triId);
}

function deactivateTriangle(tid) {
  const tri = triangles[tid];
  if (!tri?.active) return;
  tri.active = false;
  tri.verts.forEach((vid) => vertices[vid].triangles.delete(tid));
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

// ---- Hexagon corner finding ----
function findHexCorners(allVertices, centerX, centerY) {
  // Find the 6 true corner points of the hexagon purely geometrically
  // These are the vertices most extreme in 6 directions (0°, 60°, 120°, 180°, 240°, 300°)
  const allVerts = allVertices.filter(v => v.visible !== false);
  
  const angles = [0, 60, 120, 180, 240, 300];
  const corners = [];
  
  for (const angle of angles) {
    const rad = angle * Math.PI / 180;
    const dirX = Math.cos(rad);
    const dirY = Math.sin(rad);
    
    // Find the vertex with maximum projection in this direction
    let bestVertex = null;
    let maxProjection = -Infinity;
    
    for (const v of allVerts) {
      const dx = v.x - centerX;
      const dy = v.y - centerY;
      const projection = dx * dirX + dy * dirY;
      
      if (projection > maxProjection) {
        maxProjection = projection;
        bestVertex = v;
      }
    }
    
    if (bestVertex) {
      corners.push(bestVertex);
    }
  }
  
  return corners;
}

// ---- Border vertex detection ----
function findAndMarkBorderVertices() {
  // Reset all visible vertices to 'inner' first
  for (const v of vertices) {
    if (v.visible) {
      v.type = 'inner';
    }
  }
  
  // Interior vertices have exactly 6 neighbors
  // Border vertices have fewer than 6 neighbors
  for (const v of vertices) {
    if (!v.visible) continue;
    
    const neighborCount = v.neighbors.size;
    if (neighborCount < 6) {
      v.type = 'edge';
    }
  }
}

// ---- Edge rebuild from faces ----
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
        addEdge(v1, v2);
      }
    }
  }
  
  // Rebuild edges from active triangles
  for (const tri of triangles) {
    if (!tri.active) continue;
    
    for (let i = 0; i < 3; i++) {
      const v1 = tri.verts[i];
      const v2 = tri.verts[(i + 1) % 3];
      
      // Add neighbor relationship
      vertices[v1].neighbors.add(v2);
      vertices[v2].neighbors.add(v1);
      
      // Add edge if not exists
      const key = edgeKey(v1, v2);
      if (!edgeByKey.has(key)) {
        addEdge(v1, v2);
      }
      
      // Map edge to triangle
      addEdgeTriangleMapped(v1, v2, tri.id);
    }
  }
}

// ---- Relaxation algorithm ----
function relaxVertices(iterations, spacing) {
  const relaxationStrength = spacing * 0.0008; // Scale relative to grid spacing
  
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

// ---- Goban centering and fitting ----
function centerAndFitGoban(canvasWidth, canvasHeight) {
  // Find bounding box of all visible vertices
  const visibleVerts = vertices.filter(v => v.visible !== false);
  if (visibleVerts.length === 0) return;
  
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  for (const v of visibleVerts) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y);
    maxY = Math.max(maxY, v.y);
  }
  
  const gobanWidth = maxX - minX;
  const gobanHeight = maxY - minY;
  const gobanCenterX = (minX + maxX) / 2;
  const gobanCenterY = (minY + maxY) / 2;
  
  // Calculate scale to fit with 10% margin
  const marginFactor = 0.9;
  const scaleX = (canvasWidth * marginFactor) / gobanWidth;
  const scaleY = (canvasHeight * marginFactor) / gobanHeight;
  const scale = Math.min(scaleX, scaleY);
  
  // Calculate translation to center
  const targetCenterX = canvasWidth / 2;
  const targetCenterY = canvasHeight / 2;
  const translateX = targetCenterX - gobanCenterX * scale;
  const translateY = targetCenterY - gobanCenterY * scale;
  
  // Apply transformation to all vertices
  for (const v of vertices) {
    v.x = v.x * scale + translateX;
    v.y = v.y * scale + translateY;
  }
  
  // Update edge midpoints
  refreshAllEdgeMidpoints();
}

// ---- Save/Load Goban ----
function captureGobanData() {
  return {
    vertices: vertices.map(v => ({
      id: v.id,
      q: v.q,
      r: v.r,
      x: v.x,
      y: v.y,
      type: v.type,
      visible: v.visible,
    })),
    edges: edges.filter(e => e.active).map(e => ({ a: e.a, b: e.b })),
    quads: quads.filter(q => q.active).map(q => ({ verts: q.verts })),
  };
}

function restoreGoban(data) {
  vertices = data.vertices.map(v => ({
    ...v,
    neighbors: new Set(),
    triangles: new Set(),
    quads: new Set(),
    peers: v.peers || [v.id, v.id, v.id],
  }));

  quads = data.quads.map((q, idx) => ({
    id: idx,
    verts: q.verts,
    active: true,
  }));

  quads.forEach(q => {
    q.verts.forEach(vid => vertices[vid].quads.add(q.id));
  });

  triangles = [];
  rebuildEdgesFromFaces();
}

// ---- Go Game: Liberty Calculation ----
function getGroupLiberties(vid) {
  const color = gameStones.get(vid);
  if (!color) return 0;

  const group = new Set();
  const liberties = new Set();
  const stack = [vid];
  group.add(vid);

  while (stack.length > 0) {
    const current = stack.pop();
    const v = vertices[current];

    for (const nid of v.neighbors) {
      if (gameStones.get(nid) === color && !group.has(nid)) {
        group.add(nid);
        stack.push(nid);
      } else if (!gameStones.has(nid)) {
        const nv = vertices[nid];
        if (nv.visible !== false) {
          liberties.add(nid);
        }
      }
    }
  }

  return liberties.size;
}

function captureGroup(vid) {
  const color = gameStones.get(vid);
  if (!color) return [];

  const group = [];
  const stack = [vid];
  const visited = new Set([vid]);

  while (stack.length > 0) {
    const current = stack.pop();
    group.push(current);
    const v = vertices[current];

    for (const nid of v.neighbors) {
      if (gameStones.get(nid) === color && !visited.has(nid)) {
        visited.add(nid);
        stack.push(nid);
      }
    }
  }

  return group;
}

function removeGroup(group) {
  for (const vid of group) {
    gameStones.delete(vid);
    stoneOrder.delete(vid);
  }
}

// ---- Go Game: Tromp-Taylor Scoring ----
function computeTrompTaylorScore() {
  let blackStones = 0;
  let whiteStones = 0;
  
  // Count stones, excluding dead stones
  for (const [vid, color] of gameStones.entries()) {
    if (deadStones.has(vid)) continue; // Skip dead stones
    if (color === 'black') blackStones++;
    else whiteStones++;
  }

  let blackTerritory = 0;
  let whiteTerritory = 0;
  let neutral = 0;

  const visited = new Set();

  for (const v of vertices) {
    if (v.visible === false) continue;
    const vid = v.id;
    // Treat dead stones as empty for territory calculation
    const hasLiveStone = gameStones.has(vid) && !deadStones.has(vid);
    if (hasLiveStone || visited.has(vid)) continue;

    // Flood fill empty region
    let regionSize = 0;
    const queue = [vid];
    visited.add(vid);
    const borderingColors = new Set();

    while (queue.length) {
      const curr = queue.pop();
      regionSize++;
      const cv = vertices[curr];
      for (const nid of cv.neighbors) {
        const nv = vertices[nid];
        if (!nv || nv.visible === false) continue;
        const hasLiveNeighbor = gameStones.has(nid) && !deadStones.has(nid);
        if (hasLiveNeighbor) {
          borderingColors.add(gameStones.get(nid));
        } else if (!visited.has(nid)) {
          visited.add(nid);
          queue.push(nid);
        }
      }
    }

    if (borderingColors.size === 1) {
      const owner = borderingColors.has('black') ? 'black' : 'white';
      if (owner === 'black') blackTerritory += regionSize;
      else whiteTerritory += regionSize;
    } else {
      neutral += regionSize;
    }
  }

  const blackTotal = blackStones + blackTerritory;
  const whiteTotal = whiteStones + whiteTerritory + KOMI; // Add komi to white

  return {
    blackStones,
    whiteStones,
    blackTerritory,
    whiteTerritory,
    neutral,
    blackTotal,
    whiteTotal,
    komi: KOMI,
  };
}
