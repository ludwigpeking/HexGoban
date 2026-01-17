// UI State
let currentScreen = "menu"; // 'menu', 'generating', 'result'
let generatedMap = null;

// Generation parameters
let params = {
    hexGridDiameter: 40,
    hexRingCount: 10,
    randomSeed: 0,
    relaxationIterations: 500,
    relaxationStrength: 0.08,
};

// UI elements
let inputFields = {};
let buttons = {};

// Map data
let hexGridDiameter = 40;
let hexRingCount = 10;
let vertices = [];
let edges = [];
let faces = [];
let mergedFaces = [];
let subdivVertices = [];
let edgeMidpointMap = new Map();
let faceCenterVertices = [];
let averageEdgeLength = 0;
let averageFaceArea = 0;

function setup() {
    createCanvas(800, 800);
    setupUI();
    showMenu();
}

function setupUI() {
    // Generate button
    buttons.generate = createButton("Generate Map");
    buttons.generate.position(300, 250);
    buttons.generate.mousePressed(startGeneration);

    // Load button
    buttons.load = createButton("Load Map");
    buttons.load.position(300, 290);
    buttons.load.mousePressed(loadMap);

    // Save button
    buttons.save = createButton("Save Map");
    buttons.save.position(300, 500);
    buttons.save.mousePressed(saveMap);
    buttons.save.hide();

    // Export Image button
    buttons.exportImg = createButton("Export Image");
    buttons.exportImg.position(450, 500);
    buttons.exportImg.mousePressed(exportImage);
    buttons.exportImg.hide();

    // Back to Menu button
    buttons.backMenu = createButton("Back to Menu");
    buttons.backMenu.position(600, 500);
    buttons.backMenu.mousePressed(showMenu);
    buttons.backMenu.hide();

    // Input fields
    inputFields.hexGridDiameter = createInput(
        params.hexGridDiameter.toString()
    );
    inputFields.hexGridDiameter.position(400, 350);
    inputFields.hexGridDiameter.size(100);

    inputFields.hexRingCount = createInput(params.hexRingCount.toString());
    inputFields.hexRingCount.position(400, 385);
    inputFields.hexRingCount.size(100);

    inputFields.randomSeed = createInput(params.randomSeed.toString());
    inputFields.randomSeed.position(400, 420);
    inputFields.randomSeed.size(100);

    inputFields.relaxationIterations = createInput(
        params.relaxationIterations.toString()
    );
    inputFields.relaxationIterations.position(400, 455);
    inputFields.relaxationIterations.size(100);

    inputFields.relaxationStrength = createInput(
        params.relaxationStrength.toString()
    );
    inputFields.relaxationStrength.position(400, 490);
    inputFields.relaxationStrength.size(100);
}
function draw() {
    if (currentScreen === "menu") {
        drawMenu();
    } else if (currentScreen === "generating") {
        // Generation happens automatically, no draw loop needed
    } else if (currentScreen === "result") {
        drawResult();
    }
}

function drawMenu() {
    background(220);
    textSize(32);
    textAlign(CENTER);
    fill(0);
    text("Quadrangulized Map Generator", width / 2, 100);

    textSize(16);
    textAlign(LEFT);
    text("Hex Grid Diameter:", 250, 368);
    text("Hex Ring Count:", 250, 403);
    text("Random Seed:", 250, 438);
    text("Relaxation Iterations:", 250, 473);
    text("Relaxation Strength:", 250, 508);

    textSize(14);
    textAlign(CENTER);
    fill(100);
    text(
        "Generate a new quadrangulated mesh or load an existing one",
        width / 2,
        180
    );
}

function drawResult() {
    background(220);

    // Draw the generated map
    faces.forEach((face) => {
        face.draw();
    });

    // Show statistics
    fill(0);
    noStroke();
    textSize(14);
    textAlign(LEFT);

    // Calculate area statistics
    let areas = faces.map((f) => f.area);
    let minArea = Math.min(...areas);
    let maxArea = Math.max(...areas);
    let areaStdDev = calculateStdDev(areas);
    let areaVariation = ((areaStdDev / averageFaceArea) * 100).toFixed(1);

    text(`Total Quads: ${faces.length}`, 10, 20);
    text(`Total Vertices: ${vertices.length}`, 10, 40);
    text(`Average Area: ${averageFaceArea.toFixed(2)}`, 10, 60);
    text(`Min/Max Area: ${minArea.toFixed(2)} / ${maxArea.toFixed(2)}`, 10, 80);
    text(`Area Variation: ${areaVariation}%`, 10, 100);
}

function calculateStdDev(values) {
    let avg = values.reduce((a, b) => a + b, 0) / values.length;
    let squareDiffs = values.map((value) => Math.pow(value - avg, 2));
    let avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
}

function showMenu() {
    currentScreen = "menu";
    buttons.generate.show();
    buttons.load.show();
    buttons.save.hide();
    buttons.exportImg.hide();
    buttons.backMenu.hide();

    Object.values(inputFields).forEach((field) => field.show());
}

function showResult() {
    currentScreen = "result";
    buttons.generate.hide();
    buttons.load.hide();
    buttons.save.show();
    buttons.exportImg.show();
    buttons.backMenu.show();

    Object.values(inputFields).forEach((field) => field.hide());
}

function startGeneration() {
    // Read parameters from input fields
    params.hexGridDiameter = parseFloat(inputFields.hexGridDiameter.value());
    params.hexRingCount = parseInt(inputFields.hexRingCount.value());
    params.randomSeed = parseInt(inputFields.randomSeed.value());
    params.relaxationIterations = parseInt(
        inputFields.relaxationIterations.value()
    );
    params.relaxationStrength = parseFloat(
        inputFields.relaxationStrength.value()
    );

    // Set global variables
    hexGridDiameter = params.hexGridDiameter;
    hexRingCount = params.hexRingCount;

    currentScreen = "generating";
    background(220);
    fill(0);
    textSize(24);
    textAlign(CENTER);
    text("Generating map...", width / 2, height / 2);

    // Generate map after a short delay to show message
    setTimeout(() => {
        generateMap();
        showResult();
    }, 100);
}

function generateMap() {
    // Reset data structures
    vertices = [];
    faces = [];
    mergedFaces = [];
    subdivVertices = [];
    faceCenterVertices = [];
    edgeMidpointMap = new Map();

    randomSeed(params.randomSeed);

    // Create initial hexagonal grid
    const centralPoint = new Vertex(0, 0, 0);
    vertices.push(centralPoint);

    for (let i = 1; i <= hexRingCount; i++) {
        for (let j = 0; j < 6; j++) {
            for (let k = 0; k < i; k++) {
                const p = new Vertex(i, j, k);
                vertices.push(p);
            }
        }
    }

    createFaces();
    mergeTrianglesToQuadsRandomly();
    subdivideMesh();
    vertices = vertices.concat(subdivVertices);
    precalculateAdjacentFaces();
    averageFaceArea = calculateAverageArea(faces);

    // Perform relaxation iterations
    for (let iter = 0; iter < params.relaxationIterations; iter++) {
        // Recalculate face areas every iteration (critical for area-weighted relaxation!)
        faces.forEach((face) => {
            calculateFaceArea(face);
        });

        shuffleArray(vertices);

        // Apply relaxation using area-weighted centroids
        vertices.forEach((vertex) => {
            relaxVertexPosition(vertex, params.relaxationStrength);
        });
    } // Build the final map data structure
    generatedMap = buildMapData();
}

function buildMapData() {
    let mapData = {
        params: params,
        tiles: [],
    };

    // Create a map of vertex to index
    let vertexIndexMap = new Map();
    let allVertices = vertices;
    allVertices.forEach((v, idx) => {
        vertexIndexMap.set(v, idx);
    });

    // Build tile data
    faces.forEach((face, faceIdx) => {
        let tile = {
            id: faceIdx,
            vertices: face.vertices.map((v) => ({
                x: v.x,
                y: v.y,
                index: vertexIndexMap.get(v),
            })),
            center: getFaceCentroid(face),
            neighbors: [],
            area: calculateFaceArea(face),
        };

        mapData.tiles.push(tile);
    });

    // Find neighbors (faces that share edges)
    for (let i = 0; i < faces.length; i++) {
        for (let j = i + 1; j < faces.length; j++) {
            let sharedVertices = faces[i].vertices.filter((v) =>
                faces[j].vertices.includes(v)
            );
            if (sharedVertices.length >= 2) {
                mapData.tiles[i].neighbors.push(j);
                mapData.tiles[j].neighbors.push(i);
            }
        }
    }

    return mapData;
}

function saveMap() {
    if (!generatedMap) return;

    let filename = `quadmap_seed${params.randomSeed}_ring${
        params.hexRingCount
    }_${Date.now()}.json`;
    saveJSON(generatedMap, filename);

    // Show notification
    alert(
        `Map saved to Downloads folder as:\n${filename}\n\nTo save to project:\nMove the file to the 'results' folder in your project directory.`
    );
    console.log("Map saved to Downloads:", filename);
}

function loadMap() {
    // Create file input element
    let input = createFileInput(handleFile);
    input.position(0, -100); // Hide it off-screen
    input.elt.click(); // Trigger file dialog

    function handleFile(file) {
        if (file.type === "application" && file.subtype === "json") {
            loadJSON(file.data, (data) => {
                generatedMap = data;
                reconstructMapFromData(data);
                showResult();
            });
        } else {
            console.error("Please load a JSON file");
        }
        input.remove();
    }
}

function reconstructMapFromData(mapData) {
    // Reset structures
    vertices = [];
    faces = [];
    subdivVertices = [];

    // Restore parameters
    params = mapData.params;
    hexGridDiameter = params.hexGridDiameter;
    hexRingCount = params.hexRingCount;

    // Rebuild vertices from tile data
    let vertexMap = new Map();

    mapData.tiles.forEach((tile) => {
        tile.vertices.forEach((vertexData) => {
            if (!vertexMap.has(vertexData.index)) {
                let v = new SubdivVertex(vertexData.x, vertexData.y);
                vertexMap.set(vertexData.index, v);
                vertices.push(v);
            }
        });
    });

    // Rebuild faces
    mapData.tiles.forEach((tile) => {
        let faceVertices = tile.vertices.map((vData) =>
            vertexMap.get(vData.index)
        );
        let face = new Face(faceVertices);
        faces.push(face);
    });

    precalculateAdjacentFaces();
    averageFaceArea = calculateAverageArea(faces);
}

function exportImage() {
    let filename = `quadmap_seed${params.randomSeed}_ring${params.hexRingCount}`;
    saveCanvas(filename, "png");
    alert(
        `Image saved to Downloads folder as:\n${filename}.png\n\nTo save to project:\nMove the file to the 'results' folder in your project directory.`
    );
    console.log("Image exported:", filename + ".png");
}

function createFaces() {
    //central ring
    const p0 = vertices[0];
    for (let j = 0; j < 6; j++) {
        const p1 = vertices[j + 1];
        const p2 = vertices[((j + 1) % 6) + 1];
        faces.push(new Face([p0, p1, p2]));
        const p3 = vertices[6 + 2 + 2 * j];
        faces.push(new Face([p1, p2, p3]));
    }
    //outer rings
    for (let i = 2; i < hexRingCount + 1; i++) {
        for (let j = 0; j < 6; j++) {
            for (let k = 0; k < i; k++) {
                const p0 =
                    vertices[
                        getVertexIndex(
                            i - 1,
                            (j + floor(k / (i - 1))) % 6,
                            k % (i - 1)
                        )
                    ];
                const p1 = vertices[getVertexIndex(i, j, k)];
                const p2 =
                    vertices[
                        getVertexIndex(
                            i,
                            (j + floor(k / (i - 1))) % 6,
                            (k + 1) % i
                        )
                    ];

                faces.push(new Face([p0, p1, p2]));
                if (i < hexRingCount) {
                    const p3 =
                        vertices[
                            getVertexIndex(
                                i + 1,
                                j + (floor(k / i) % 6),
                                (k + 1) % (i + 1)
                            )
                        ];
                    faces.push(new Face([p1, p2, p3]));
                }
            }
        }
    }
}

function mergeTrianglesToQuadsRandomly() {
    let toRemove = new Set();
    let mergedFacesTemp = [];

    // Create a list of all possible pairs
    let pairs = [];
    for (let i = 0; i < faces.length; i++) {
        for (let j = i + 1; j < faces.length; j++) {
            pairs.push([i, j]);
        }
    }

    // Shuffle the pairs to randomize the order of processing
    shuffleArray(pairs);

    // Attempt to merge pairs in the randomized order
    for (let [i, j] of pairs) {
        if (toRemove.has(i) || toRemove.has(j)) continue;

        let sharedVertices = faces[i].vertices.filter((v) =>
            faces[j].vertices.includes(v)
        );
        if (sharedVertices.length === 2) {
            let nonSharedVertices = faces[i].vertices
                .concat(faces[j].vertices)
                .filter((v) => !sharedVertices.includes(v));
            let orderedVertices = [
                sharedVertices[0],
                nonSharedVertices[0],
                sharedVertices[1],
                nonSharedVertices[1],
            ];

            mergedFacesTemp.push(new Face(orderedVertices));
            toRemove.add(i).add(j);
        }
    }

    // Update the faces array
    faces = faces.filter((_, index) => !toRemove.has(index));
    faces = mergedFaces.concat(mergedFacesTemp, faces);
}

function relaxVertices(iterations) {
    // Combine original and subdivided vertices for processing
    let allVertices = vertices.concat(subdivVertices);

    for (let it = 0; it < iterations; it++) {
        let vertexAdjustments = new Map();

        allVertices.forEach((vertex) => {
            if (vertex.edgy) return; // Skip vertices marked as 'edgy'

            let adjacentCentroids = [];
            faces.forEach((face) => {
                if (face.vertices.includes(vertex)) {
                    let centroid = getFaceCentroid(face);
                    adjacentCentroids.push(centroid);
                }
            });

            // If a vertex is not part of any face, don't adjust it
            if (adjacentCentroids.length === 0) return;

            // Calculate the average centroid for the current vertex
            let avgCentroid = {
                x:
                    adjacentCentroids.reduce((sum, c) => sum + c.x, 0) /
                    adjacentCentroids.length,
                y:
                    adjacentCentroids.reduce((sum, c) => sum + c.y, 0) /
                    adjacentCentroids.length,
            };

            vertexAdjustments.set(vertex, avgCentroid);
        });

        // Apply adjustments to vertices based on the calculated average centroids
        vertexAdjustments.forEach((centroid, vertex) => {
            vertex.x = centroid.x;
            vertex.y = centroid.y;
        });
    }
}

function getFaceCentroid(face) {
    let x = 0,
        y = 0;
    face.vertices.forEach((v) => {
        x += v.x;
        y += v.y;
    });
    return { x: x / face.vertices.length, y: y / face.vertices.length };
}

function drawMesh() {
    // Draw faces
    faces.forEach((face) => {
        beginShape();
        stroke(0);
        fill(200, 10); // Set face color
        face.vertices.forEach((v) => vertex(v.x, v.y));
        endShape(CLOSE);
        noStroke();
        fill(0, 50, 50);
    });

    // Draw vertices
    let allVertices = vertices.concat(subdivVertices);
    allVertices.forEach((v) => {
        stroke(0);
        fill(v.edgy ? "red" : "blue"); // Color-code based on the 'edgy' property
        ellipse(v.x, v.y, 5, 5);
    });
}

function relaxVerticesForArea(iterations, averageArea, vertices, faces) {
    for (let it = 0; it < iterations; it++) {
        faces.forEach((face) => {
            let faceArea = calculateFaceArea(face);
            const areaFactor =
                faceArea < averageArea * 0.8
                    ? -1
                    : faceArea > averageArea * 1.25
                    ? 1
                    : 0;
            if (areaFactor !== 0) {
                // Activate only if adjustment is needed
                let centroid = calculateFaceCentroid(face);
                face.vertices.forEach((vertex) => {
                    if (!vertex.edgy) {
                        // Calculate direction from vertex to centroid
                        let direction = {
                            x: centroid.x - vertex.x,
                            y: centroid.y - vertex.y,
                        };
                        let magnitude = Math.sqrt(
                            direction.x ** 2 + direction.y ** 2
                        );
                        direction.x /= magnitude; // Normalize
                        direction.y /= magnitude;

                        // Move vertex away from centroid to adjust area
                        vertex.x += direction.x * areaFactor; // The factor controls how much to adjust
                        vertex.y += direction.y * areaFactor;
                    }
                });
            }
        });
    }
}

function precalculateAdjacentFaces() {
    vertices.forEach((vertex) => {
        vertex.adjacentFaces = []; // Initialize the array to hold adjacent faces
    });

    faces.forEach((face) => {
        face.vertices.forEach((vertex) => {
            if (vertex.adjacentFaces) {
                vertex.adjacentFaces.push(face); // Add this face to the vertex's list of adjacent faces
            }
        });
    });
}

function relaxVertexPosition(vertex, strength = 0.1) {
    if (
        vertex.edgy ||
        !vertex.adjacentFaces ||
        vertex.adjacentFaces.length === 0
    )
        return;

    let weightedSumX = 0;
    let weightedSumY = 0;
    let totalWeight = 0;

    // Calculate the weighted centroid based on the area of adjacent faces
    vertex.adjacentFaces.forEach((face) => {
        let centroid = getFaceCentroid(face);
        let weight = face.area;

        weightedSumX += centroid.x * weight;
        weightedSumY += centroid.y * weight;
        totalWeight += weight;
    });

    if (totalWeight > 0) {
        // Calculate the average position based on the weighted centroid
        let avgX = weightedSumX / totalWeight;
        let avgY = weightedSumY / totalWeight;

        // Apply the adjustment with specified strength
        vertex.x += (avgX - vertex.x) * strength;
        vertex.y += (avgY - vertex.y) * strength;
    }
}

function calculateAverageEdgeLength() {
    let totalLength = 0;
    let edgeCount = 0;

    faces.forEach((face) => {
        for (let i = 0; i < face.vertices.length; i++) {
            let startVertex = face.vertices[i];
            let endVertex = face.vertices[(i + 1) % face.vertices.length];
            let edgeLength = dist(
                startVertex.x,
                startVertex.y,
                endVertex.x,
                endVertex.y
            );

            totalLength += edgeLength;
            edgeCount++;
        }
    });

    return totalLength / edgeCount;
}

function getAdjacentQuads(vertex) {
    let adjacentFaces = [];
    for (let face of faces) {
        if (face.vertices.includes(vertex)) {
            adjacentFaces.push(face);
        }
    }
    return adjacentFaces;
}

function calculateWeightedCentroid(vertex, faces) {
    let weightedSumX = 0;
    let weightedSumY = 0;
    let totalWeight = 0;

    const adjacentFaces = getAdjacentQuads(vertex);

    adjacentFaces.forEach((face) => {
        const area = calculateFaceArea(face);
        const centroid = calculateFaceCentroid(face);

        weightedSumX += centroid.x * area;
        weightedSumY += centroid.y * area;
        totalWeight += area;
    });

    if (totalWeight === 0) {
        // Avoid division by zero
        return { x: vertex.x, y: vertex.y };
    }

    return {
        x: weightedSumX / totalWeight,
        y: weightedSumY / totalWeight,
    };
}

function relaxVerticesUsingWeightedCentroids(vertices, faces, strength = 0.01) {
    // Note the reduced strength for finer control
    vertices.forEach((vertex) => {
        if (vertex.edgy) return; // Skip 'edgy' vertices

        const weightedCentroid = calculateWeightedCentroid(vertex, faces);
        let dx = weightedCentroid.x - vertex.x;
        let dy = weightedCentroid.y - vertex.y;
        let distance = Math.sqrt(dx * dx + dy * dy);

        // Normalize the direction vector
        if (distance > 0) {
            dx /= distance;
            dy /= distance;
        }

        // Apply the adjustment with reduced strength, ensuring it's towards the weighted centroid
        vertex.x += dx * strength * distance;
        vertex.y += dy * strength * distance;
    });
}

function showInitialGraph() {
    for (let face of faces) {
        fill(200);
        face.draw();
    }
    for (let face of mergedFaces) {
        fill(0, 255, 255);
        face.draw();
    }

    for (let i = 0; i < vertices.length; i++) {
        stroke(0);
        if (vertices[i].edgy) {
            stroke(255, 255, 0);
        }
        circle(vertices[i].x, vertices[i].y, 6);
        noStroke();
        text(i, vertices[i].x, vertices[i].y + 20);
    }

    for (let vertex of subdivVertices) {
        stroke(255, 0, 0);
        if (vertex.edgy) {
            stroke(255, 255, 0);
        }
        circle(vertex.x, vertex.y, 4);
    }
    for (let vertex of faceCenterVertices) {
        stroke(0, 255, 0);
        circle(vertex.x, vertex.y, 4);
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]]; // Swap elements
    }
}

function getVertexIndex(i, j, k) {
    if (i === 0) return 0; // Central point
    return 1 + (i * 6 * (i - 1)) / 2 + j * i + k;
}

// Function to create or retrieve a vertex at an edge midpoint
function getOrCreateEdgeMidpoint(v1, v2) {
    let edgeKey = `${Math.min(v1.index, v2.index)}-${Math.max(
        v1.index,
        v2.index
    )}`;
    if (edgeMidpointMap.has(edgeKey)) {
        return edgeMidpointMap.get(edgeKey);
    } else {
        let midpoint = new SubdivVertex((v1.x + v2.x) / 2, (v1.y + v2.y) / 2);
        if (v1.edgy && v2.edgy) {
            midpoint.edgy = true;
        }
        subdivVertices.push(midpoint);
        edgeMidpointMap.set(edgeKey, midpoint);
        return midpoint;
    }
}

// Function to create a vertex at the center of a face
function createFaceCenter(vertices) {
    let centerX = vertices.reduce((sum, v) => sum + v.x, 0) / vertices.length;
    let centerY = vertices.reduce((sum, v) => sum + v.y, 0) / vertices.length;
    let centerVertex = new SubdivVertex(centerX, centerY);
    faceCenterVertices.push(centerVertex);
    subdivVertices.push(centerVertex);
    return centerVertex;
}

function subdivideMesh() {
    let newFaces = []; // Store new subdivided faces here

    faces.forEach((face) => {
        // Compute edge midpoints
        let midpoints = [];
        for (let i = 0; i < face.vertices.length; i++) {
            let v1 = face.vertices[i];
            let v2 = face.vertices[(i + 1) % face.vertices.length];
            midpoints.push(getOrCreateEdgeMidpoint(v1, v2));
        }

        // Compute face center
        let centerVertex = createFaceCenter(face.vertices);

        // Form new quads for each segment of the original face
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

    faces = newFaces; // Replace old faces with the new subdivided faces
}

function calculateFaceArea(face) {
    let area = 0;
    for (let i = 0; i < face.vertices.length; i++) {
        let v1 = face.vertices[i];
        let v2 = face.vertices[(i + 1) % face.vertices.length];
        area += v1.x * v2.y - v2.x * v1.y;
    }
    face.area = Math.abs(area / 2);
    return Math.abs(area / 2);
}

function calculateAverageArea(faces) {
    let totalArea = 0;
    faces.forEach((face) => {
        totalArea += calculateFaceArea(face);
    });
    return totalArea / faces.length;
}

function calculateFaceCentroid(face) {
    let centroidX = 0;
    let centroidY = 0;
    for (let i = 0; i < face.vertices.length; i++) {
        let v1 = face.vertices[i];
        let v2 = face.vertices[(i + 1) % face.vertices.length];
        let crossProduct = v1.x * v2.y - v2.x * v1.y;
        centroidX += (v1.x + v2.x) * crossProduct;
        centroidY += (v1.y + v2.y) * crossProduct;
    }
    let area = calculateFaceArea(face);
    return new SubdivVertex(centroidX / (6 * area), centroidY / (6 * area));
}

// Assuming calculateVertexCentroid returns the centroid of all faces adjacent to this vertex
function calculateVertexCentroid(vertex, faces) {
    let centroidX = 0;
    let centroidY = 0;
    for (let face of faces) {
        let area = calculateFaceArea(face);
        centroidX += face.centroid.x * area;
        centroidY += face.centroid.y * area;
    }
    let totalArea = faces.reduce(
        (sum, face) => sum + calculateFaceArea(face),
        0
    );
    return new SubdivVertex(centroidX / totalArea, centroidY / totalArea);
}

// Example of shuffling faces array
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

// Use this function to shuffle faces at the start of each relaxation iteration
class Vertex {
    constructor(i, j, k) {
        //i: hexagon ring count : 1 ~ hexRingCount
        //j: hexagon sector count: 0 ~ 5
        //k: index in a hexagon sector: 0 ~ (i-1)
        this.i = i;
        this.j = j;
        this.k = k;
        if (i + j + k === 0) {
            this.index = 0;
        } else {
            this.index = 1 + (i * 6 * (i - 1)) / 2 + j * i + k;
        }
        this.edgy = false;
        if (i === hexRingCount) {
            this.edgy = true;
        }

        this.p1 = { x: 0, y: 0 };
        this.p2 = { x: 0, y: 0 };
        this.p1.x = width / 2 + i * hexGridDiameter * cos((j * PI) / 3);
        this.p1.y = height / 2 + i * hexGridDiameter * sin((j * PI) / 3);
        this.p2.x = width / 2 + i * hexGridDiameter * cos(((j + 1) * PI) / 3);
        this.p2.y = height / 2 + i * hexGridDiameter * sin(((j + 1) * PI) / 3);
        //lerp between p1 and p2 by k, k is between 0 and i
        if (i == 0) {
            this.x = this.p1.x;
            this.y = this.p1.y;
        } else {
            this.x = lerp(this.p1.x, this.p2.x, k / i);
            this.y = lerp(this.p1.y, this.p2.y, k / i);
        }
    }
    draw() {
        ellipse(this.x, this.y, 2, 2);
        textSize(12);
        fill(255, 0, 0);
        text(
            "(" + this.i + "," + this.j + "," + this.k + ")",
            this.x + 2,
            this.y
        );
        text(this.index, this.x + 2, this.y + 10);
    }
}

class SubdivVertex {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

class Edge {
    constructor(v1, v2) {
        this.v1 = v1;
        this.v2 = v2;
    }
    draw() {
        line(this.v1.x, this.v1.y, this.v2.x, this.v2.y);
    }
}

class Face {
    constructor(vertices) {
        this.vertices = vertices;
        this.centerHairLength = 2;
    }
    draw() {
        fill(200, 20);
        stroke(20);
        strokeWeight(0.3);
        beginShape();
        for (let v of this.vertices) {
            vertex(v.x, v.y);
        }
        endShape(CLOSE);
        //draw a cross at the center of the face, from the middle points from the opposite edges. the hair of the cross is 5 pixels
        let mid1 = {
            x: (this.vertices[0].x + this.vertices[3].x) / 2,
            y: (this.vertices[0].y + this.vertices[3].y) / 2,
        };
        let mid2 = {
            x: (this.vertices[3].x + this.vertices[2].x) / 2,
            y: (this.vertices[3].y + this.vertices[2].y) / 2,
        };
        let mid3 = {
            x: (this.vertices[2].x + this.vertices[1].x) / 2,
            y: (this.vertices[2].y + this.vertices[1].y) / 2,
        };
        let mid4 = {
            x: (this.vertices[1].x + this.vertices[0].x) / 2,
            y: (this.vertices[1].y + this.vertices[0].y) / 2,
        };

        const interSection = findIntersection(mid1, mid3, mid2, mid4);
        drawLineOfLengthAFromV1ToV2Direction(
            interSection,
            mid1,
            this.centerHairLength
        );
        drawLineOfLengthAFromV1ToV2Direction(
            interSection,
            mid2,
            this.centerHairLength
        );
        drawLineOfLengthAFromV1ToV2Direction(
            interSection,
            mid3,
            this.centerHairLength
        );
        drawLineOfLengthAFromV1ToV2Direction(
            interSection,
            mid4,
            this.centerHairLength
        );
    }
}

function findIntersection(v1, v2, v3, v4) {
    let x1 = v1.x;
    let y1 = v1.y;
    let x2 = v2.x;
    let y2 = v2.y;
    let x3 = v3.x;
    let y3 = v3.y;
    let x4 = v4.x;
    let y4 = v4.y;
    let x =
        ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) /
        ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4));
    let y =
        ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) /
        ((x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4));
    return { x: x, y: y };
}

function drawLineOfLengthAFromV1ToV2Direction(v1, v2, a) {
    let x1 = v1.x;
    let y1 = v1.y;
    let x2 = v2.x;
    let y2 = v2.y;
    let d = dist(x1, y1, x2, y2);
    let x = x1 + ((x2 - x1) * a) / d;
    let y = y1 + ((y2 - y1) * a) / d;
    line(x1, y1, x, y);
}
