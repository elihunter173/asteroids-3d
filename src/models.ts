import { vec3 } from "gl-matrix";

// Vertex [x, y, z]
type Vector = [number, number, number];
// Some aliases which are useful for documentation
// Color [r, g, b]
type ColorVector = Vector;
// Point (x, y, z)
type Point = Vector;

export type Material = {
  ambient: ColorVector;
  diffuse: ColorVector;
  specular: ColorVector;
  n: number;
};

function rgb(r: number, g: number, b: number): Vector {
  return [r / 255, g / 255, b / 255];
}

// Description of triangle JSON.
//
// Note: The arrays of `ambient`, `diffuse`, `specular`, and `triangles` all
// have the same length.
export type Model = {
  material: Material;
  vertices: Array<Point>;
  // Numbers are integer references to vertexes within `vertices`
  triangles: Array<[number, number, number]>;
};

// Center model on origin. This should be done for all models not tied to
// another
function center(model: Model): Model {
  // Preprocess all vertexes so their centroid is the origin
  let centroid = vec3.create();
  for (const v of model.vertices) {
    vec3.add(centroid, centroid, v);
  }
  vec3.scale(centroid, centroid, 1 / model.vertices.length);
  for (const v of model.vertices) {
    vec3.subtract(v, v, centroid);
  }
  return model;
}

export const SUN_COLOR: Vector = rgb(252, 229, 112);
export const SPACE_COLOR: Vector = rgb(29, 17, 53);

export const SUN_SIDE_LENGTH: number = 2.0;
export const SUN: Model = center({
  material: {
    ambient: SUN_COLOR,
    diffuse: [0.0, 0.0, 0.0],
    specular: [0.0, 0.0, 0.0],
    n: 11,
  },
  vertices: [
    [0, 0, 0],
    [SUN_SIDE_LENGTH, 0, 0],
    [SUN_SIDE_LENGTH, 0, SUN_SIDE_LENGTH],
    [0, 0, SUN_SIDE_LENGTH],
    [0, SUN_SIDE_LENGTH, 0],
    [SUN_SIDE_LENGTH, SUN_SIDE_LENGTH, 0],
    [SUN_SIDE_LENGTH, SUN_SIDE_LENGTH, SUN_SIDE_LENGTH],
    [0, SUN_SIDE_LENGTH, SUN_SIDE_LENGTH],
  ],
  triangles: [
    [0, 1, 2],
    [2, 3, 0],
    [4, 5, 6],
    [6, 7, 4],
    [0, 1, 4],
    [4, 5, 1],
    [1, 2, 5],
    [2, 5, 6],
    [2, 3, 6],
    [3, 6, 7],
    [3, 0, 7],
    [0, 7, 4],
  ],
});

const DOT_S: number = 0.1;
export const DOT: Model = center({
  material: {
    ambient: [1.0, 1.0, 1.0],
    diffuse: [0.0, 0.0, 0.0],
    specular: [0.0, 0.0, 0.0],
    n: 11,
  },
  vertices: [
    [0, 0, 0],
    [DOT_S, 0, 0],
    [DOT_S, 0, DOT_S],
    [0, 0, DOT_S],
    [0, DOT_S, 0],
    [DOT_S, DOT_S, 0],
    [DOT_S, DOT_S, DOT_S],
    [0, DOT_S, DOT_S],
  ],
  triangles: [
    [0, 1, 2],
    [2, 3, 0],
    [4, 5, 6],
    [6, 7, 4],
    [0, 1, 4],
    [4, 5, 1],
    [1, 2, 5],
    [2, 5, 6],
    [2, 3, 6],
    [3, 6, 7],
    [3, 0, 7],
    [0, 7, 4],
  ],
});

export const SHIP: Model = center({
  material: {
    ambient: [0.125, 0.125, 0.125],
    diffuse: [0.325, 0.325, 0.325],
    specular: [0.45, 0.45, 0.45],
    n: 31,
  },
  vertices: [
    [0.0, 0.0, 0],
    [0.3, 0.6, 0],
    [0.6, 0.0, 0],
    [0.3, 0.15, 0.08],
    [0.3, 0.15, -0.08],
  ],
  triangles: [
    [0, 1, 3],
    [0, 1, 4],
    [0, 3, 4],
    [2, 1, 3],
    [2, 1, 4],
    [2, 3, 4],
  ],
});
export const SHIP_NOZZLE: vec3 = SHIP.vertices[1];
export const SHIP_COLLISION_POINTS: vec3[] = SHIP.vertices.map((v) => vec3.fromValues(...v));

export const SHIP_FLAME: Model = {
  material: {
    ambient: rgb(226, 88, 34),
    diffuse: [0.0, 0.0, 0.0],
    specular: [0.0, 0.0, 0.0],
    n: 17,
  },
  vertices: [
    [5 / 32, 0, 0],
    [0, 0, 5 / 128],
    [-5 / 32, 0, 0],
    [0, 0, -5 / 128],
    [0, -0.4, 0],
  ],
  triangles: [
    [0, 1, 2],
    [2, 3, 0],
    [0, 1, 4],
    [1, 2, 4],
    [2, 3, 4],
    [3, 0, 4],
  ],
};

export const SHIP_FLAME_ACCENT: Model = {
  material: {
    ambient: rgb(255, 247, 110),
    diffuse: [0.0, 0.0, 0.0],
    specular: [0.0, 0.0, 0.0],
    n: 17,
  },
  vertices: [
    [4.5 / 32, 0, 0],
    [0, 0, 6 / 128],
    [-4.5 / 32, 0, 0],
    [0, 0, -6 / 128],
    [0, -0.36, 0],
  ],
  triangles: [
    [0, 1, 2],
    [2, 3, 0],
    [0, 1, 4],
    [1, 2, 4],
    [2, 3, 4],
    [3, 0, 4],
  ],
};


const RETICLE_S: number = 0.1;
const RETICLE_DIST: number = 5;
export const SHIP_RETICLE: Model = {
  material: {
    ambient: rgb(255, 255, 255),
    diffuse: [0.0, 0.0, 0.0],
    specular: [0.0, 0.0, 0.0],
    n: 11,
  },
  vertices: [
    [-RETICLE_S / 2, -RETICLE_S / 2 + RETICLE_DIST, -RETICLE_S / 2],
    [RETICLE_S / 2, -RETICLE_S / 2 + RETICLE_DIST, -RETICLE_S / 2],
    [RETICLE_S / 2, -RETICLE_S / 2 + RETICLE_DIST, RETICLE_S / 2],
    [-RETICLE_S / 2, -RETICLE_S / 2 + RETICLE_DIST, RETICLE_S / 2],
    [-RETICLE_S / 2, RETICLE_S / 2 + RETICLE_DIST, -RETICLE_S / 2],
    [RETICLE_S / 2, RETICLE_S / 2 + RETICLE_DIST, -RETICLE_S / 2],
    [RETICLE_S / 2, RETICLE_S / 2 + RETICLE_DIST, RETICLE_S / 2],
    [-RETICLE_S / 2, RETICLE_S / 2 + RETICLE_DIST, RETICLE_S / 2],
  ],
  triangles: [
    [0, 1, 2],
    [2, 3, 0],
    [4, 5, 6],
    [6, 7, 4],
    [0, 1, 4],
    [4, 5, 1],
    [1, 2, 5],
    [2, 5, 6],
    [2, 3, 6],
    [3, 6, 7],
    [3, 0, 7],
    [0, 7, 4],
  ],
};

export const MISSILE: Model = center({
  material: {
    ambient: [1.0, 0.2, 0.2],
    diffuse: [0.0, 0.0, 0.0],
    specular: [0.0, 0.0, 0.0],
    n: 11,
  },
  vertices: [
    [1 / 32, 0.0, 0.0],
    [0.0, 0.0, 1 / 32],
    [-1 / 32, 0.0, 0.0],
    [0.0, 0.0, -1 / 32],
    [1 / 32, 0.5, 0.0],
    [0.0, 0.5, 1 / 32],
    [-1 / 32, 0.5, 0.0],
    [0.0, 0.5, -1 / 32],
  ],
  triangles: [
    [0, 1, 2],
    [2, 3, 0],
    [4, 5, 6],
    [6, 7, 4],
    [0, 1, 4],
    [4, 5, 1],
    [1, 2, 5],
    [2, 5, 6],
    [2, 3, 6],
    [3, 6, 7],
    [3, 0, 7],
    [0, 7, 4],
  ],
});

export const ASTEROID_COLOR: Vector = rgb(88, 69, 56);
export const ASTEROID_DAMAGED_COLOR: Vector = [1, 0, 0];

function randf(lo: number, hi: number) {
  return (hi - lo) * Math.random() + lo;
}

export const ASTEROID_AMBIENT_SCALAR: number = 0.5;
export const ASTEROID_DIFFUSE_SCALAR: number = 1.0;
const ASTEROID_MATERIAL = {
  ambient: <Vector>ASTEROID_COLOR.map((x) => x * ASTEROID_AMBIENT_SCALAR),
  diffuse: <Vector>ASTEROID_COLOR.map((x) => x * ASTEROID_DIFFUSE_SCALAR),
  specular: [0.0, 0.0, 0.0],
  n: 11,
};

export function randomAsteroid(radius: number): [number, Model] {
  let sideLength = radius * (2 / Math.sqrt(3));
  let template = [
    [0, 0, 0],
    [sideLength, 0, 0],
    [sideLength, 0, sideLength],
    [0, 0, sideLength],
    [0, sideLength, 0],
    [sideLength, sideLength, 0],
    [sideLength, sideLength, sideLength],
    [0, sideLength, sideLength],
  ];

  let vertexes: Vector[] = template.map((v) => {
    let disp = vec3.random(vec3.create(), randf(0, sideLength / 2));
    return [v[0] + disp[0], v[1] + disp[1], v[2] + disp[2]];
  });

  let asteroid = center({
    // Deep clone the material since we modify the color later
    material: JSON.parse(JSON.stringify(ASTEROID_MATERIAL)),
    vertices: vertexes,
    triangles: [
      [0, 1, 2],
      [2, 3, 0],
      [4, 5, 6],
      [6, 7, 4],
      [0, 1, 4],
      [4, 5, 1],
      [1, 2, 5],
      [2, 5, 6],
      [2, 3, 6],
      [3, 6, 7],
      [3, 0, 7],
      [0, 7, 4],
    ],
  });

  let avgRadius = 0.0;
  for (const v of asteroid.vertices) {
    avgRadius += Math.hypot(...v);
  }
  avgRadius /= asteroid.vertices.length;

  return [avgRadius, asteroid];
}
