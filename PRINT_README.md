# HexGoban Print Version

## Overview

This project now includes a high-resolution print version of the Hexagonal Goban, designed for printing at 200 PPI with 3cm spacing between vertices.

## File Structure

### Core Files

- **`common.js`** - Shared utility functions and algorithms used by both screen and print versions
- **`sketch.js`** - Screen version (interactive editor and game play)
- **`print_sketch.js`** - Print version (high-resolution rendering for printing)

### HTML Files

- **`index.html`** - Main interactive application
- **`print.html`** - Print version interface

## Print Version Specifications

### Dimensions

- **Resolution**: 200 PPI (pixels per inch)
- **Vertex Spacing**: 3 cm = 236 pixels
- **Canvas Size**: A4 equivalent (1654 × 2339 pixels)
- **Scale Factor**: 6× larger than screen version

### Calculation

```
spacing = (200 PPI / 2.54 cm/inch) × 3 cm = 236 pixels
```

### Visual Elements

- **Line Weight**: 12 pixels (2mm at print size)
- **Vertex Points**: 48 pixels diameter
- **Wood Texture**: Scaled 6× for print resolution

## Usage

### Screen Version (index.html)

1. Open `index.html` in a web browser
2. Choose from:
   - Play at Random Goban
   - Choose from Preset Gobans
   - Design Your Own Goban
   - Load Goban
3. Interactive editor with full game play support

### Print Version (print.html)

1. Open `print.html` in a web browser
2. Select a preset goban from the list
3. The goban will render at print resolution
4. Click "Download High-Res PNG" to save the image
5. Print the downloaded PNG at 100% scale (no scaling)

## Preset Gobans

The following preset gobans are available:

- **須弥 (Shumi - Mount Sumeru)**
- **須弥大 (Shumi Large)**
- **幽玄 (Yugen - Deep Mystery)**
- **星影 (Hoshikage - Star Shadow)**
- **星屑 (Hoshikuzu - Stardust)**
- **演天 (Enten - Celestial Deduction)**
- **奇门 (Kimon - Mystic Gates)**
- **陣眼 (Jin-gan - Nexus of the Array)**

All preset files are stored in the `gobans/` directory.

## Code Architecture

### common.js Functions

The following functions are shared between versions:

#### Coordinate & Geometry
- `axialToPixel(q, r, spacing, centerX, centerY)` - Convert hex coordinates to pixel positions
- `keyCoord(q, r)` - Create unique key for coordinate
- `edgeKey(a, b)` - Create unique key for edge

#### Grid Operations
- `calculateQuadArea(quad)` - Calculate area using shoelace formula
- `getFaceCentroid(face)` - Get centroid of face
- `findHexCorners(vertices, centerX, centerY)` - Find 6 corner vertices
- `findAndMarkBorderVertices()` - Identify border vs interior vertices

#### Edge Manipulation
- `addEdge(a, b)` - Add edge to structures
- `refreshAllEdgeMidpoints()` - Update all edge midpoints
- `deleteEdgeSingle(edgeId)` - Delete edge and merge triangles
- `rebuildEdgesFromFaces()` - Rebuild edge structures from faces

#### Relaxation
- `relaxVertices(iterations, spacing)` - Apply force-directed relaxation

#### Goban Data
- `captureGobanData()` - Serialize goban state
- `restoreGoban(data)` - Deserialize goban state
- `centerAndFitGoban(canvasWidth, canvasHeight)` - Center and scale goban to fit canvas

#### Go Game Logic
- `getGroupLiberties(vid)` - Calculate liberties for a stone group
- `captureGroup(vid)` - Get all stones in a connected group
- `removeGroup(group)` - Remove captured stones
- `computeTrompTaylorScore()` - Calculate final score using Tromp-Taylor rules

#### Utilities
- `orderPolygon(ids)` - Order vertices by angle around centroid
- `shuffleArray(arr)` - Fisher-Yates shuffle
- `deactivateTriangle(tid)` - Mark triangle as inactive
- `addEdgeTriangleMapped(a, b, triId)` - Map edge to triangle

### Screen Version (sketch.js)

Contains additional functions for:
- Interactive editing (drag vertices, delete edges)
- UI management and event handlers
- Undo/Redo system
- Game play controls
- Save/Load with user interaction

### Print Version (print_sketch.js)

Simplified version focusing on:
- High-resolution rendering
- Preset loading
- PNG export functionality
- No interaction or editing features

## Development Notes

### Why Separate Print Version?

1. **Fixed Canvas Size**: Print version uses exact dimensions for consistent output
2. **Higher Resolution**: All elements scaled 6× for print quality
3. **Simplified Interface**: No game play or editing features
4. **File Size**: Smaller file for dedicated print purpose

### Modifying Dimensions

To change print specifications, edit `print_sketch.js`:

```javascript
const PRINT_SPACING = 236; // Adjust for different vertex spacing
const PRINT_SCALE_FACTOR = 6; // Adjust scale relative to screen
const PRINT_CANVAS_WIDTH = 1654; // Adjust for different paper size
const PRINT_CANVAS_HEIGHT = 2339;
```

### Adding New Presets

1. Create JSON file in `gobans/` directory
2. Add entry to both `index.html` and `print.html` preset buttons
3. Add file path mapping in preset files object

## Git and Vercel Deployment

**Important**: Vercel is case-sensitive for file names, but Git on Windows is not by default.

To ensure filename changes are tracked properly:

```bash
git config core.ignorecase false
```

This was necessary to properly rename files like `enten.json` → `Enten.json`.

## License

© 2026 Richard Qian Li. All rights reserved.

星旋圍碁 VorteGo - A Richard Qian Li Game
