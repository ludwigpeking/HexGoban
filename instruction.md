# Hexagonal Goban

## the Goban/Go Chess Board

### the initial shape
a large hexagon that has 9 vertices (8 edges) on each edege of the hex.
the hex started with equal triangles filled in it. making a typical even pattern.

### the UI and Editing
we have an UI that allows the player to edit it. basically, the User is allowed to erase edges (one at the click, only if erasing the edge turning the triangles into quads), to move a vertex (by mouse drag, except of the vertices on the hex edge). 
the UI should highlight the vertex or the edge that

### three sector arrangement
And we assume the chess board is made of three indentical parts, each has 120 degrees from the center, and they are like instancing to each other, just rotated 120 and 240 degree. when we edit the vertices and edges in one of the sectors, the other two sectors change at the same time. 
the border between the two sector is sensitive, and each element should belong to both sides. and affected by the editing on both sides. the center point of the goban is therefore unmovable for its triple ownership.

### geometry tracking
we track the number of vertices, though it is not changed.
all we track the number of quads and triangles.
we keep track of which vertices are the neighbor of any vertex. removing edge will of course removing the neighborhood. also which vertices are forming which triangles or quads. so we keep arrays of vertices, triangles, quads. 

### vertices
vertices has the property of:
- x, y coord;
- being at the edge, at the center, or ordinary; 
- neighbors; 
- be in which quads or triangles

### quads, triangles
- vertices indices

### edge
- two vertices
- the midpoint, when it is the edge deleting mode, the mouse if near the midpoint, the edge is considered being hoistering and waiting for the clicking deleting

### the canvas, and sizes
the canvas: 1920*1080
the initial distance between vertices: 50 px

## tech stack
we use p5js for the interface and goban drawing

## relaxation algorithm
when there's no more triangles, only quads, do an auto relexation algorithm to make the quads as close to squares as possible. 
in the UI, we put an relexation button, to start this relexation. and we show the relexation frames in the canvas as a visualization.

## goban symbols
execpt of the vertices on the edge, we put symbols on the special vertices. 
- on 6 edges: white hole, using the "whitehole.png" in images folder
- on 5 edges: star, draw a white circle
- on 3 edges: black hole, using the "blackhole.png" in images folder

# Menu

## play at random goban
- create a random goban in the background, Hex with 5 edges per border, auto subdivision, show the goban to the player, show auto relexation (100 steps)
- if the player does not like it, he can redo this first step
- the player can save the generated goban
- connect to play mode

## choose from preset gobans
- premade gobans - 
  幽玄 (Yugen - Deep Mystery)，
  星影 (Hoshikage)，
  星屑，Hoshikuzu，Stardust
  演天，Enten，Celestial Deduction
  奇门，Kimon，Mystic Gates
  须弥，Shumi， Mount Sumeru
  阵眼，Jin-gan， Nexus of the Array
- connect to play mode


## design your own goban
- buttons: move, delete, undo/redo, 
- relax (only when full quads)
- connect to play mode

# Playmode
- the mouse has a black/white stone as a hint of who to add stone
- ko(劫争) rule
- stone indexing
- game record saving/loading (loading include the goban shape and the game record)
- scoring at the end
- AI opponent (optional)
