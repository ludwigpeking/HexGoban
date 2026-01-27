// Print version of Hexagonal Goban
// Configured for high-resolution print output: 3cm between vertices at 200 PPI

// Use print spacing: 3cm at 200 PPI = 236px
const spacing = 236; // 200 PPI / 2.54 * 3cm = 236px

let hexRadius = 10;
let vertices = [];
let edges = [];
let edgeByKey = new Map();
let edgeTris = new Map();
let triangles = [];
let quads = [];

let currentPreset = null;
let whi = null;
let bhi = null;
let woodTexture = null;

let canvasCreated = false;

// Preset gobans data
const presetFiles = {
  'shumi': 'gobans/Shumi.json',
  'shumi_large': 'gobans/Shumi_Large.json',
  'kimon': 'gobans/Kimon.json',
  'jingan': 'gobans/Jin-gan_relaxed.json',
  'yugen': 'gobans/Yuken_relaxed.json',
  'hoshikage': 'gobans/Hoshikage_relaxed.json',
  'hoshikuzu': 'gobans/Hoshikuzu_relaxed.json',
  'enten': 'gobans/Enten_relaxed.json',
};

function preload() {
  whi = loadImage('images/whitehole.png');
  bhi = loadImage('images/blackhole.png');
  woodTexture = loadImage('images/wood_texture.png');
}

function setup() {
  // Don't create canvas yet - wait for goban to be loaded
  noLoop();
  
  document.getElementById('status').textContent = 'Ready to load goban';
  setupPresetButtons();
}

function setupPresetButtons() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const presetName = e.target.dataset.preset;
      loadPreset(presetName);
    });
  });
  
  document.getElementById('downloadBtn')?.addEventListener('click', downloadCanvas);
}

function loadPreset(presetName) {
  const filePath = presetFiles[presetName];
  if (!filePath) {
    document.getElementById('status').textContent = `Preset "${presetName}" not found`;
    return;
  }
  
  document.getElementById('status').textContent = `Loading ${presetName}...`;
  
  fetch(filePath)
    .then(response => {
      if (!response.ok) throw new Error(`Failed to load ${filePath}`);
      return response.json();
    })
    .then(data => {
      restoreGoban(data);
      
      // Scale vertices from screen spacing (50px) to print spacing (236px)
      const scaleFactor = spacing / 50; // 236 / 50 = 4.72
      for (const v of vertices) {
        v.x *= scaleFactor;
        v.y *= scaleFactor;
      }
      
      // Scale edge midpoints
      for (const e of edges) {
        if (e.mid) {
          e.mid.x *= scaleFactor;
          e.mid.y *= scaleFactor;
        }
      }
      
      // Calculate bounding box
      const visibleVerts = vertices.filter(v => v.visible !== false);
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      
      for (const v of visibleVerts) {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
      
      // Add margin (2x spacing on each side for wood border)
      const margin = spacing * 2;
      const canvasWidth = Math.ceil(maxX - minX + margin * 2);
      const canvasHeight = Math.ceil(maxY - minY + margin * 2);
      
      // Create or resize canvas
      if (!canvasCreated) {
        const c = createCanvas(canvasWidth, canvasHeight);
        c.parent('app');
        canvasCreated = true;
      } else {
        resizeCanvas(canvasWidth, canvasHeight);
      }
      
      // Center goban in canvas
      const offsetX = -minX + margin;
      const offsetY = -minY + margin;
      for (const v of vertices) {
        v.x += offsetX;
        v.y += offsetY;
      }
      
      // Update edge midpoints
      for (const e of edges) {
        if (!e.active) continue;
        const a = vertices[e.a];
        const b = vertices[e.b];
        e.mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
      
      currentPreset = presetName;
      document.getElementById('status').textContent = `Loaded ${presetName} - Ready to download (${canvasWidth}×${canvasHeight}px at 200 PPI)`;
      document.getElementById('currentGoban').textContent = presetName;
      redraw();
    })
    .catch(err => {
      document.getElementById('status').textContent = `Error: ${err.message}`;
    });
}

function draw() {
  background(120, 100, 70);
  drawGobanBorder();
  drawSectors();
  drawFaces();
  drawEdges();
  drawVertices();
  drawSymbols();
}

// Same drawing functions as sketch.js
function drawSectors() {
  // Sector lines removed - they're not needed for the goban
}

function drawGobanBorder() {
  // Draw hexagonal goban border using wood texture
  // Offset outward from edge vertices by spacing/2
  if (!woodTexture) return;
  
  // Find the 6 corner points of the hexagon using all visible vertices
  const cornerPoints = findHexCorners(vertices, width / 2, height / 2);
  if (cornerPoints.length < 6) return;
  
  // Calculate offset outward from center
  const offset = spacing / 2;
  const centerX = width / 2;
  const centerY = height / 2;
  
  // Create inner and outer corner points
  const corners = cornerPoints.map(v => {
    const dx = v.x - centerX;
    const dy = v.y - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist === 0) {
      return { innerX: v.x, innerY: v.y, outerX: v.x, outerY: v.y };
    }
    
    // Normalize direction
    const normX = dx / dist;
    const normY = dy / dist;
    
    return {
      innerX: v.x,
      innerY: v.y,
      outerX: v.x + normX * offset,
      outerY: v.y + normY * offset
    };
  });
  
  // Draw the wood texture as background
  push();
  noStroke();
  
  // Tile the wood texture at full scale
  const textureW = woodTexture.width;
  const textureH = woodTexture.height;
  for (let x = -textureW; x < width + textureW; x += textureW) {
    for (let y = -textureH; y < height + textureH; y += textureH) {
      image(woodTexture, x, y);
    }
  }
  
  // Draw the inner hexagon with background color to mask the playing area
  fill(0);
  beginShape();
  vertex(width, height);
  vertex(width, 0);
  vertex(0, 0);
  vertex(0, height);
  vertex(width, height);
  corners.forEach(c => vertex(c.outerX, c.outerY));
  vertex(corners[0].outerX, corners[0].outerY); // close loop
  endShape(CLOSE);
  
  pop();
}

function drawFaces() {
  // Draw quads - no fill, just outline to show wood texture
  for (const quad of quads) {
    if (!quad.active) continue;
    
    noFill();
    stroke(80, 60, 40);
    strokeWeight(1);
    beginShape();
    for (const vid of quad.verts) {
      const v = vertices[vid];
      vertex(v.x, v.y);
    }
    endShape(CLOSE);
  }
  
  // Draw triangles - no fill, just outline to show wood texture
  for (const tri of triangles) {
    if (!tri.active) continue;
    
    noFill();
    stroke(80, 60, 40);
    strokeWeight(1);
    beginShape();
    for (const vid of tri.verts) {
      const v = vertices[vid];
      vertex(v.x, v.y);
    }
    endShape(CLOSE);
  }
}

function drawEdges() {
  stroke(80, 60, 40);
  strokeWeight(4);
  
  for (const e of edges) {
    if (!e.active) continue;
    const a = vertices[e.a];
    const b = vertices[e.b];
    if (a.visible === false || b.visible === false) continue;
    line(a.x, a.y, b.x, b.y);
  }
}

function drawVertices() {
  for (const v of vertices) {
    if (v.visible === false) continue;
    
    noStroke();
    fill(100, 80, 60);
    circle(v.x, v.y, 8);
  }
}

function drawSymbols() {
  for (const v of vertices) {
    if (v.type !== 'inner') continue; // Only on inner vertices
    const edgeCount = v.neighbors.size;

    if (edgeCount === 6 || edgeCount === 5) {
      // White hole
      if (whi) {
        push();
        imageMode(CENTER);
        image(whi, v.x, v.y, edgeCount*30, edgeCount*30);
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
        image(bhi, v.x, v.y, edgeCount*30, edgeCount*30);
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

function downloadCanvas() {
  if (!currentPreset) {
    alert('Please load a goban first');
    return;
  }
  
  const timestamp = Date.now();
  const filename = `goban_print_${currentPreset}_${timestamp}.png`;
  saveCanvas(filename);
  document.getElementById('status').textContent = `Downloaded: ${filename}`;
}

// Dummy game state variables for compatibility with common.js
let gameStones = new Map();
let stoneOrder = new Map();
let deadStones = new Set();
