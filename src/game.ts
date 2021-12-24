// TODO: Make music play on start
// TODO: Have sound effects and music mute
import { quat, vec3, mat4 } from "gl-matrix";

import * as models from "./models";
import * as render from "./render";
import { SceneObject } from "./render";
import { Debouncer, Keyboard } from "./inputs";
import { Camera } from "./render";

// TODO: Try to split up different loops into different files

type Range = [number, number];

function randf(lo: number, hi: number) {
  return (hi - lo) * Math.random() + lo;
}

function clamp(n: number, range: Range) {
  return Math.min(range[1], Math.max(range[0], n));
}

function interpolate(pos: number, range: Range) {
  return pos * range[1] + (1 - pos) * range[0];
}

function degrees(rads: number) {
  return rads * (Math.PI / 180);
}

// Find a position in the given unit vector direction
function randomArc(direction: vec3, arc: number): vec3 {
  return randomArcRange(direction, [0, arc]);
}

// Find a position in the given unit vector direction
function randomArcRange(direction: vec3, arcRange: Range): vec3 {
  // This fails if direction = [-1,0,0] so we have two alternatives
  let perpendicular = vec3.fromValues(direction[0] + 1, direction[1], direction[2]);
  if (Math.abs(perpendicular[0]) < 0.01) {
    perpendicular = vec3.fromValues(direction[0], direction[1] + 1, direction[2]);
  }
  vec3.cross(perpendicular, direction, perpendicular);
  vec3.normalize(perpendicular, perpendicular);

  let arcVec = vec3.copy(vec3.create(), direction);
  let angleOut = mat4.fromRotation(mat4.create(), randf(...arcRange), perpendicular);
  let angleAround = mat4.fromRotation(mat4.create(), randf(0, 2 * Math.PI), direction);
  vec3.transformMat4(arcVec, arcVec, angleOut);
  vec3.transformMat4(arcVec, arcVec, angleAround);

  return arcVec;
}

const SPAWN_DISTANCE: number = render.FOG_END + 1;
const DESPAWN_DISTANCE: number = SPAWN_DISTANCE + 1;

const NEAR_BOUND: number = 1 / 32;
const VIEW_DISTANCE: number = 32;

// Number of ticks to wait before going to the next level after winning a level
const LEVEL_WAIT_TICKS: number = 30;

const ASTEROID_TIERS: number = 2;
type Tiered<T> = [T, T];
const ASTEROID_RADIUS_TIERS: Tiered<Range> = [
  [1.4, 1.8],
  [0.6, 0.8],
];
const ASTEROID_HEALTH_TIERS: Tiered<number> = [2, 1];
const ASTEROID_POINT_TIERS: Tiered<number> = [100, 50];
const ASTEROID_ROTATION_SPEED: Range = [0.005, 0.1];
const ASTEROID_SPLIT_SPEED: Range = [0.01, 0.08];
const ASTEROID_INITIAL_SPAWN_DISTANCE: Range = [16, 32];
const ASTEROID_SPAWN_DISTANCE: number = SPAWN_DISTANCE;
const ASTEROID_DESPAWN_DISTANCE: number = DESPAWN_DISTANCE;
const ASTEROID_SPAWN_ARC: number = degrees(120);
const ASTEROID_VELOCITY_ARC: number = degrees(45);
// A fudge factor to tweak the asteroid collision in the player's favor
const ASTEROID_RADIUS_FUDGE_FACTOR: number = 0.85;

const SUN_INITIAL_SPAWN_DISTANCE: Range = [10, 28];
const SUN_SPAWN_DISTANCE: number = SPAWN_DISTANCE;
const SUN_DESPAWN_DISTANCE: number = DESPAWN_DISTANCE;
const SUN_SPAWN_ARC: number = degrees(50);

const SHIP_MAX_THRUST: number = 0.001;
const SHIP_THROTTLE_SPEED_LIMIT: Range = [-1 / 9, 1 / 15];
const SHIP_FOV_DEGREES: Range = [80, 86];
const SHIP_CAMERA_CHASE_FACTOR: number = 0.6;

const SHIP_ROTATION_EPSILON: number = 1e-10;
const SHIP_ROTATION_TOPOUT: number = 0.01;
const SHIP_ROTATION_TOPOUT_SCALING: number = 0.925;

const SHIP_MOUSE_TURN_SPEED: number = 0.0001;
const SHIP_GAMEPAD_TURN_SPEED: number = 0.003;
const SHIP_ROLL_SPEED: number = degrees(0.3);

// number of ticks moving at MISSILE_SPEED to travel DESPAWN_DISTANCE
const MISSILE_DISTANCE: number = DESPAWN_DISTANCE;
// This should be notably smaller than the asteroid radius otherwise missiles
// can phase through asteroids
// TODO: Check missile collisions at multiple steps to ensure missiles don't
// "phase through" asteroids
const MISSILE_SPEED: number = 0.7;
const MISSILE_COOLDOWN_TICKS: number = 30;
const MISSILE_LIFE_TICKS: number = Math.round(MISSILE_DISTANCE / MISSILE_SPEED);

const FRECAM_MOUSE_TURN_SPEED: number = 0.002;
const FRECAM_ROLL_SPEED: number = 0.02;
const FREECAM_DEFAULT_MOVE_SPEED: number = 0.04;
const FREECAM_MOVE_SPEED_INCREMENT: number = 0.005;
const FREECAM_NEAR_BOUND: number = 1 / 32;
const FREECAM_FAR_BOUND: number = 64;

const MENU_NUM_ASTEROIDS: number = 64;
// We don't let the angle be 0 or else we get intersections with us
const MENU_ASTEROID_VELOCITY_ARC: Range = [degrees(3), degrees(45)];
const MENU_ASTEROID_SPAWN_ARC: number = degrees(120);
const MENU_ASTEROID_SPAWN_DISTANCE: number = SPAWN_DISTANCE;
const MENU_ASTEROID_SPEED: Range = [0.01, 0.1];

const DEBOUNCE_MS: number = 200;

// TODO: Make these configurable, as well as direction
const CONTROLLER_X_AXIS: number = 0;
const CONTROLLER_Y_AXIS: number = 1;
const DEADZONE: number = 0.15;

function asteroidSpeed(level: number): Range {
  let slow = 0.01 + level * 0.005;
  let fast = 0.09 + level * 0.03;
  return [slow, fast];
}

function numAsteroids(level: number): Tiered<number> {
  let big = Math.round((1 / 2) * level * level + 8 * level);
  let small = Math.round((1 / 8) * level * level + 4 * level + 4);
  return [big, small];
}

// function numAsteroids(level: number): Tiered<number> {
//   return [0, 1];
// }

// TODO: Actually mix the volume better
const MISSILE_SFX: HTMLAudioElement = new Audio("missile.mp3");
const MUSIC: HTMLAudioElement = new Audio("music.wav");
const MUSIC_VOLUME: number = 1.0;
const SFX_VOLUME: number = 1.0;
MUSIC.volume = MUSIC_VOLUME * 0.75;
MUSIC.loop = true;

type Missile = {
  birth: number;
  velocity: vec3;
  obj: SceneObject;
};

class Eased {
  want: number;
  current: number;
  speedLimit: Range;

  constructor(value: number, speedLimit: Range) {
    this.want = value;
    this.current = value;
    this.speedLimit = speedLimit;
  }

  set(value: number) {
    this.want = value;
  }

  get() {
    return this.current;
  }

  step() {
    this.current += clamp(this.want - this.current, this.speedLimit);
  }
}

// TODO: Implement an ammo mechanic
class Ship {
  velocity: vec3;

  obj: SceneObject;
  flame: SceneObject;
  flameAccent: SceneObject;
  reticle: SceneObject;

  lastFired: number;
  throttle: Eased;

  worldRotation: quat;
  modelRotation: quat;

  forward: vec3;
  up: vec3;
  right: vec3;

  thrusterSfx: HTMLAudioElement;

  constructor(gl: WebGLRenderingContext) {
    this.velocity = vec3.create();
    this.obj = new SceneObject(gl, models.SHIP);
    this.flame = new SceneObject(gl, models.SHIP_FLAME);
    this.flameAccent = new SceneObject(gl, models.SHIP_FLAME_ACCENT);
    // The flame is always by the flame accent
    this.flameAccent.vertexTransform = this.flame.vertexTransform;
    this.reticle = new SceneObject(gl, models.SHIP_RETICLE);
    // The reticle moves with the ship
    this.reticle.vertexTransform = this.obj.vertexTransform;

    this.lastFired = Number.NEGATIVE_INFINITY;
    this.throttle = new Eased(0, SHIP_THROTTLE_SPEED_LIMIT);

    this.worldRotation = quat.create();
    this.modelRotation = quat.create();

    this.up = vec3.fromValues(0, 0, -1);
    this.forward = vec3.fromValues(0, 1, 0);
    this.right = vec3.fromValues(-1, 0, 0);

    this.thrusterSfx = new Audio("thruster.wav");
    this.thrusterSfx.loop = true;
  }

  *objects(): Iterable<SceneObject> {
    yield this.obj;
    if (this.throttle.get() > 0) {
      yield this.flame;
      yield this.flameAccent;
    }
    yield this.reticle;
  }

  setThrottle(amount: number) {
    if (amount != 0) {
      this.thrusterSfx.play();
    }
    this.throttle.set(amount);
  }

  pitchUp(rads: number) {
    this.rotate(rads, this.right, vec3.fromValues(-1, 0, 0));
  }

  yawLeft(rads: number) {
    this.rotate(rads, this.up, vec3.fromValues(0, 0, -1));
  }

  rollRight(rads: number) {
    this.rotate(rads, this.forward, vec3.fromValues(0, 1, 0));
  }

  private rotate(rads: number, aboutWorld: vec3, aboutModel: vec3) {
    let worldImpulse = quat.setAxisAngle(quat.create(), aboutWorld, rads);
    quat.multiply(this.worldRotation, this.worldRotation, worldImpulse);

    let modelImpulse = quat.setAxisAngle(quat.create(), aboutModel, rads);
    quat.multiply(this.modelRotation, this.modelRotation, modelImpulse);
  }

  collisionPoints(): vec3[] {
    return models.SHIP_COLLISION_POINTS.map((v) =>
      vec3.transformMat4(vec3.create(), v, this.obj.vertexTransform),
    );
  }

  // TODO: Make this a system ?
  refreshThrottle() {
    this.throttle.step();
    let throttle = this.throttle.get();
    mat4.scale(
      this.flame.vertexTransform,
      this.obj.vertexTransform,
      vec3.fromValues(1, throttle, 1),
    );
    this.thrusterSfx.volume = SFX_VOLUME * throttle;
  }

  // TODO: Maybe be a free function
  tryFire(game: Game) {
    if (game.play.ticks - this.lastFired <= MISSILE_COOLDOWN_TICKS) {
      return;
    }

    this.lastFired = game.play.ticks;
    let sfx = <HTMLAudioElement>MISSILE_SFX.cloneNode();
    // TODO: Do actual audio mixing
    sfx.volume = SFX_VOLUME * 0.15;
    sfx.play();

    let missileVelocity = vec3.create();
    vec3.scaleAndAdd(missileVelocity, this.velocity, this.forward, MISSILE_SPEED);
    let obj = new SceneObject(game.gl, models.MISSILE);
    // We don't call translate because we want to translate in model
    // coordinates
    mat4.translate(obj.vertexTransform, obj.vertexTransform, models.SHIP_NOZZLE);
    mat4.multiply(obj.vertexTransform, this.obj.vertexTransform, obj.vertexTransform);

    game.play.missiles.push({
      birth: game.play.ticks,
      velocity: missileVelocity,
      obj: obj,
    });
  }

  eye(): vec3 {
    let eye = this.obj.pos();
    vec3.scaleAndAdd(eye, eye, this.forward, -0.7);
    vec3.scaleAndAdd(eye, eye, this.up, 0.35);
    return eye;
  }

  camera(lastPos: vec3): render.Camera {
    let eye = this.eye();
    let throttle = this.throttle.get();
    let fov = interpolate(throttle * throttle, SHIP_FOV_DEGREES);
    vec3.lerp(eye, lastPos, eye, SHIP_CAMERA_CHASE_FACTOR);

    let viewingTransform = mat4.lookAt(
      mat4.create(),
      eye, // eye
      vec3.add(vec3.create(), eye, this.forward), // center
      this.up, // up
    );
    let perspectiveTransform = mat4.perspective(
      mat4.create(),
      degrees(fov), // FOV y
      canvas.width / canvas.height, // aspect ratio (W/H)
      NEAR_BOUND, // near bound
      VIEW_DISTANCE, // far bound
    );

    return {
      eye: eye,
      viewingTransform: viewingTransform,
      perspectiveTransform: perspectiveTransform,
    };
  }
}

class Asteroid {
  obj: SceneObject;
  velocity: vec3;
  radius: number;
  tier: number;
  rotationAxis: vec3;
  rotationSpeed: number;
  health: number;

  constructor(
    gl: WebGLRenderingContext,
    tier: number,
    velocity: vec3,
    opt?: { radius: number; rotationAxis: vec3; rotationSpeed: number },
  ) {
    // Clamp the radius to the acceptable values
    let tierRadius = ASTEROID_RADIUS_TIERS[tier];
    let radius =
      opt != undefined
        ? Math.min(tierRadius[1], Math.max(tierRadius[0], opt.radius))
        : randf(...tierRadius);

    let [actualRadius, model] = models.randomAsteroid(radius);
    this.obj = new SceneObject(gl, model);
    this.radius = actualRadius;
    this.tier = tier;
    this.health = ASTEROID_HEALTH_TIERS[tier];
    this.velocity = velocity;
    this.rotationAxis = opt != undefined ? opt.rotationAxis : vec3.random(vec3.create());
    this.rotationSpeed = opt != undefined ? opt.rotationSpeed : randf(...ASTEROID_ROTATION_SPEED);
  }

  split(gl: WebGLRenderingContext): [Asteroid, Asteroid] {
    let direction = vec3.random(vec3.create());
    let speed = randf(...ASTEROID_SPLIT_SPEED);
    let opts = {
      radius: this.radius / 2,
      rotationAxis: vec3.copy(vec3.create(), this.rotationAxis),
      rotationSpeed: this.rotationSpeed,
    };

    let leftVelocity = vec3.scaleAndAdd(vec3.create(), this.velocity, direction, speed);
    let left = new Asteroid(gl, this.tier + 1, leftVelocity, opts);
    let pos = this.obj.pos();
    left.obj.translate(pos);
    let rightVelocity = vec3.scaleAndAdd(vec3.create(), this.velocity, direction, -speed);
    let right = new Asteroid(gl, this.tier + 1, rightVelocity, opts);
    right.obj.translate(pos);

    return [left, right];
  }

  damage() {
    // Smaller asteroids have less health / take more damage. One more at each
    // level
    this.health -= 1;

    let material = this.obj.model.material;
    let healthPercent = this.health / ASTEROID_HEALTH_TIERS[this.tier];
    for (let i = 0; i < 3; i++) {
      let color =
        models.ASTEROID_COLOR[i] * healthPercent +
        models.ASTEROID_DAMAGED_COLOR[i] * (1 - healthPercent);
      material.ambient[i] = color * 0.4;
      material.diffuse[i] = color;
    }
  }
}

// TODO: Make sun a class?
function sunContains(sun: SceneObject, point: vec3): boolean {
  let center = sun.pos();
  return [0, 1, 2].every(
    (i) =>
      center[i] - models.SUN_SIDE_LENGTH / 2 <= point[i] &&
      point[i] <= center[i] + models.SUN_SIDE_LENGTH / 2,
  );
}

enum GameMode {
  Menu,
  Pause,
  Play,
  Freecam,
}

export type Game = {
  gl: WebGLRenderingContext;
  shaderInfo: render.ShaderAttributes;
  mode: GameMode;
  inputs: {
    keyboard: Keyboard;
    gamepad: number;
    pauseDebouncer: Debouncer;
    mouseDown: boolean;
  };
  play: {
    ship: Ship;
    missiles: Missile[];
    tieredAsteroids: Tiered<Asteroid[]>;
    numAsteroids: Tiered<number>;
    suns: SceneObject[];
    ticks: number;
    score: number;
    lastCameraPosition: vec3;
    camera: Camera;
    asteroidSpeed: Range;
    level: number;
    levelFinishedAt: null | number;
  };
  freecam: {
    freecamModeDebouncer: Debouncer;
    generalDebouncer: Debouncer;
    camera: FreeCamera;
    fog: boolean;
    showShipCollisions: boolean;
  };
  menu: {
    camera: FreeCamera;
    asteroids: Asteroid[];
    suns: SceneObject[];
    movingCamera: boolean;
    moveModeDebouncer: Debouncer;
  };
};

function initGame(gl: WebGLRenderingContext): Game {
  let keyboard = new Keyboard();
  keyboard.register();
  let ship = new Ship(gl);

  let game: Game = {
    gl: gl,
    shaderInfo: render.setupShaders(gl),
    mode: GameMode.Menu,
    inputs: {
      keyboard: keyboard,
      // TODO: Don't hardcode
      gamepad: 0,
      pauseDebouncer: new Debouncer(Date.now, DEBOUNCE_MS),
      mouseDown: false,
    },
    play: {
      ship: ship,
      missiles: [],
      tieredAsteroids: [[], []],
      // These get reassigned when we play a level
      numAsteroids: [0, 0],
      suns: [],
      ticks: 0,
      score: 0,
      lastCameraPosition: ship.eye(),
      camera: ship.camera(ship.eye()),
      asteroidSpeed: [0, 0],
      level: 0,
      levelFinishedAt: null,
    },
    freecam: {
      camera: new FreeCamera({
        eye: vec3.fromValues(0, 0, -5),
        lookAt: vec3.fromValues(0, 0, 1),
        lookUp: vec3.fromValues(0, 1, 0),
        width: canvas.width,
        height: canvas.height,
        fovDegrees: SHIP_FOV_DEGREES[0],
        near: FREECAM_NEAR_BOUND,
        far: FREECAM_FAR_BOUND,
        moveSpeed: FREECAM_DEFAULT_MOVE_SPEED,
      }),
      freecamModeDebouncer: new Debouncer(Date.now, DEBOUNCE_MS),
      generalDebouncer: new Debouncer(Date.now, DEBOUNCE_MS),
      fog: true,
      showShipCollisions: false,
    },
    menu: {
      camera: new FreeCamera({
        eye: vec3.fromValues(0, 0, 0),
        lookAt: vec3.fromValues(0, 0, 1),
        lookUp: vec3.fromValues(0, 1, 0),
        width: canvas.width,
        height: canvas.height,
        fovDegrees: SHIP_FOV_DEGREES[0],
        near: NEAR_BOUND,
        far: VIEW_DISTANCE,
        moveSpeed: FREECAM_DEFAULT_MOVE_SPEED,
      }),
      asteroids: [],
      suns: [],
      movingCamera: false,
      moveModeDebouncer: new Debouncer(Date.now, DEBOUNCE_MS),
    },
  };

  // Set up menu
  menuScene(game);

  return game;
}

function* allAsteroids(game: Game): Iterable<Asteroid> {
  for (const tier of game.play.tieredAsteroids) {
    yield* tier;
  }
}

function menuScene(game: Game) {
  let camera = game.menu.camera;
  camera.yawLeft(degrees(-30));
  camera.pitchUp(degrees(-20));
  let sun = new SceneObject(game.gl, models.SUN);
  sun.translate(vec3.fromValues(3.5, -4, 10));
  game.menu.suns.push(sun);
  let backlight = new SceneObject(game.gl, models.SUN);
  backlight.translate(vec3.scaleAndAdd(vec3.create(), camera.eye, camera.forward, -2));
  game.menu.suns.push(backlight);
}

function* playObjects(game: Game): Iterable<SceneObject> {
  yield* game.play.ship.objects();
  if (game.freecam.showShipCollisions) {
    for (const v of game.play.ship.collisionPoints()) {
      let obj = new SceneObject(game.gl, models.DOT);
      obj.translate(v);
      yield obj;
    }
  }
  for (const m of game.play.missiles) {
    yield m.obj;
  }
  for (const a of allAsteroids(game)) {
    yield a.obj;
  }
  yield* game.play.suns;
}

function* playLights(game: Game): Iterable<vec3> {
  for (const sun of game.play.suns) {
    yield sun.pos();
  }
}

function* menuObjects(game: Game): Iterable<SceneObject> {
  for (const a of game.menu.asteroids) {
    yield a.obj;
  }
  yield* game.menu.suns;
}

function* menuLights(game: Game): Iterable<vec3> {
  for (const sun of game.menu.suns) {
    yield sun.pos();
  }
}

// Schedules the next frame based on the game mode
function scheduleNextFrame(game: Game) {
  if (game.mode == GameMode.Menu) {
    requestAnimationFrame(() => menuLoop(game));
  } else if (game.mode == GameMode.Pause) {
    requestAnimationFrame(() => pauseLoop(game));
  } else if (game.mode == GameMode.Play) {
    requestAnimationFrame(() => playLoop(game));
  } else if (game.mode == GameMode.Freecam) {
    requestAnimationFrame(() => devLoop(game));
  }
}

function quitGame(game: Game) {
  display.time.hidden = true;
  display.score.hidden = true;
  display.level.hidden = true;

  display.mainText.innerHTML = "Asteroids";
  display.mainText.hidden = false;
  display.menuButton.innerHTML = "Start";
  display.menuButton.hidden = false;
  display.menuButton.onclick = () => {
    playGame(game, 1);
  };
  display.menuButton2.hidden = true;

  game.mode = GameMode.Menu;
}

function gameOver(game: Game) {
  display.time.hidden = false;
  display.score.hidden = false;
  display.level.hidden = false;

  display.mainText.innerHTML = "Game Over";
  display.mainText.hidden = false;
  display.menuButton.innerHTML = "Restart";
  display.menuButton.hidden = false;
  display.menuButton.onclick = () => {
    playGame(game, 1);
  };
  display.menuButton2.innerHTML = "Quit";
  display.menuButton2.hidden = false;
  display.menuButton2.onclick = () => {
    quitGame(game);
  };

  game.play.ship.thrusterSfx.pause();

  document.exitPointerLock();
  game.mode = GameMode.Pause;
}

function pauseGame(game: Game) {
  display.score.hidden = false;
  display.time.hidden = false;
  display.level.hidden = false;

  display.mainText.innerHTML = "Pause";
  display.mainText.hidden = false;
  display.menuButton.innerHTML = "Unpause";
  display.menuButton.hidden = false;
  display.menuButton.onclick = () => {
    unpauseGame(game);
  };
  display.menuButton2.innerHTML = "Quit";
  display.menuButton2.hidden = false;
  display.menuButton2.onclick = () => {
    quitGame(game);
  };

  MUSIC.pause();
  game.play.ship.thrusterSfx.pause();

  document.exitPointerLock();
  game.mode = GameMode.Pause;
}

function unpauseGame(game: Game) {
  display.time.hidden = false;
  display.score.hidden = false;
  display.level.hidden = false;

  display.mainText.hidden = true;
  display.menuButton.hidden = true;
  display.menuButton2.hidden = true;

  MUSIC.play();

  canvas.requestPointerLock();
  game.mode = GameMode.Play;
}

function playGame(game: Game, level: number) {
  display.time.hidden = false;
  display.score.hidden = false;
  display.level.hidden = false;

  display.mainText.hidden = true;
  display.menuButton.hidden = true;
  display.menuButton2.hidden = true;

  if (level == 1) {
    MUSIC.play();
    MUSIC.currentTime = 0.0;
  }

  canvas.requestPointerLock();
  game.mode = GameMode.Play;

  game.play.ship = new Ship(game.gl);
  game.play.missiles = [];
  game.play.tieredAsteroids = [[], []];
  game.play.numAsteroids = numAsteroids(level);
  game.play.asteroidSpeed = asteroidSpeed(level);
  game.play.suns = [];
  game.play.score = 0;
  game.play.ticks = 0;
  game.play.lastCameraPosition = game.play.ship.eye();
  game.play.camera = game.play.ship.camera(game.play.ship.eye());
  game.play.level = level;
  game.play.levelFinishedAt = null;
  updateScore(game);
  updateClock(game);
  updateLevel(game);

  for (const [tier, numAsteroids] of game.play.numAsteroids.entries()) {
    for (let i = 0; i < numAsteroids; i++) {
      let pos = randomArc(game.play.ship.forward, ASTEROID_SPAWN_ARC);
      let velocity = randomArc(vec3.scale(vec3.create(), pos, -1), ASTEROID_VELOCITY_ARC);
      vec3.scale(pos, pos, randf(...ASTEROID_INITIAL_SPAWN_DISTANCE));
      vec3.scale(velocity, velocity, randf(...game.play.asteroidSpeed));

      let asteroid = new Asteroid(game.gl, tier, velocity);
      asteroid.velocity = velocity;
      asteroid.obj.translate(pos);
      game.play.tieredAsteroids[tier].push(asteroid);
    }
  }

  for (let i = 0; i < render.NUM_SUNS; i++) {
    // TODO: Ensure suns aren't close together?
    let sun = new SceneObject(game.gl, models.SUN);
    sun.translate(vec3.random(vec3.create(), randf(...SUN_INITIAL_SPAWN_DISTANCE)));
    game.play.suns.push(sun);
  }
}

function devMode(game: Game) {
  game.freecam.camera.sync(game.play.ship, game.play.camera);
  game.mode = GameMode.Freecam;
}

function undevMode(game: Game) {
  game.mode = GameMode.Play;
}

function checkNextLevel(game: Game) {
  if (game.play.levelFinishedAt != null) {
    // We'eve finished the level
    if (game.play.ticks - game.play.levelFinishedAt < LEVEL_WAIT_TICKS) {
      return;
    } else {
      playGame(game, game.play.level + 1);
    }
  }

  if (game.play.numAsteroids.every((n) => n == 0)) {
    game.play.levelFinishedAt = game.play.ticks;
  }
}

export class FreeCamera {
  public eye: vec3;
  public forward: vec3;
  public up: vec3;
  public right: vec3;

  public moveSpeed: number;

  public readonly viewingTransform: mat4;
  public readonly perspectiveTransform: mat4;

  constructor({
    eye,
    lookAt,
    lookUp,
    width,
    height,
    fovDegrees,
    near,
    far,
    moveSpeed,
  }: {
    eye: vec3;
    lookAt: vec3;
    lookUp: vec3;
    width: number;
    height: number;
    fovDegrees: number;
    near: number;
    far: number;
    moveSpeed: number;
  }) {
    this.eye = eye;
    this.forward = lookAt;
    this.up = lookUp;
    this.right = vec3.cross(vec3.create(), lookAt, lookUp);

    this.moveSpeed = moveSpeed;

    this.viewingTransform = mat4.create();
    this.perspectiveTransform = mat4.create();
    this.refreshView();
    mat4.perspective(
      this.perspectiveTransform,
      degrees(fovDegrees), // FOV y
      width / height, // aspect ratio (W/H)
      near, // near bound
      far, // far bound
    );
  }

  private refreshView() {
    mat4.lookAt(
      this.viewingTransform,
      this.eye, // eye
      vec3.add(vec3.create(), this.eye, this.forward), // center
      this.up, // up
    );
  }

  move(direction: vec3, distance: number) {
    vec3.scaleAndAdd(this.eye, this.eye, direction, distance);
    this.refreshView();
  }

  pitchUp(rads: number) {
    this.transformView(mat4.fromRotation(mat4.create(), rads, this.right));
    this.refreshView();
  }

  yawLeft(rads: number) {
    this.transformView(mat4.fromRotation(mat4.create(), rads, this.up));
    this.refreshView();
  }

  rollRight(rads: number) {
    this.transformView(mat4.fromRotation(mat4.create(), rads, this.forward));
    this.refreshView();
  }

  private transformView(transform: mat4) {
    vec3.transformMat4(this.forward, this.forward, transform);
    vec3.transformMat4(this.up, this.up, transform);
    vec3.transformMat4(this.right, this.right, transform);
  }

  sync(ship: Ship, cam: Camera) {
    vec3.copy(this.forward, ship.forward);
    vec3.copy(this.up, ship.up);
    vec3.copy(this.right, ship.right);
    vec3.copy(this.eye, cam.eye);
    mat4.copy(this.viewingTransform, cam.viewingTransform);
  }
}

function handleKeyboard(game: Game) {
  let keyboard = game.inputs.keyboard;

  if (game.inputs.mouseDown) {
    game.play.ship.tryFire(game);
  }

  if (keyboard.pressed.has("KeyP")) {
    game.inputs.pauseDebouncer.try(() => pauseGame(game));
  }

  if (keyboard.pressed.has("KeyE")) {
    game.play.ship.rollRight(SHIP_ROLL_SPEED);
  }
  if (keyboard.pressed.has("KeyQ")) {
    game.play.ship.rollRight(-SHIP_ROLL_SPEED);
  }

  if (keyboard.pressed.has("KeyW")) {
    game.play.ship.setThrottle(1.0);
  } else {
    game.play.ship.setThrottle(0.0);
  }

  if (keyboard.pressed.has("Space")) {
    game.play.ship.tryFire(game);
  }
}

function handleGamepad(game: Game) {
  let gamepad = navigator.getGamepads()[game.inputs.gamepad];
  if (gamepad == null) {
    return;
  }

  const PITCH_AXIS = 1;
  const YAW_AXIS = 0;
  const ROLL_AXIS = 2;
  const THROTTLE_TRIGGER = 7;
  const BUTTON_A = 0;
  const BUTTON_R = 5;

  game.play.ship.pitchUp(SHIP_GAMEPAD_TURN_SPEED * gamepad.axes[PITCH_AXIS]);
  game.play.ship.yawLeft(-SHIP_GAMEPAD_TURN_SPEED * gamepad.axes[YAW_AXIS]);
  game.play.ship.rollRight(SHIP_GAMEPAD_TURN_SPEED * gamepad.axes[ROLL_AXIS]);
  game.play.ship.setThrottle(gamepad.buttons[THROTTLE_TRIGGER].value);
  if (gamepad.buttons[BUTTON_R].pressed || gamepad.buttons[BUTTON_A].pressed) {
    game.play.ship.tryFire(game);
  }

  console.log(gamepad);
}

function spawnSuns(game: Game) {
  // TODO: Make sure the suns never appear close together?
  while (game.play.suns.length < render.NUM_SUNS) {
    let sun = new SceneObject(game.gl, models.SUN);
    let direction = vec3.normalize(vec3.create(), game.play.ship.velocity);
    let pos = randomArc(direction, SUN_SPAWN_ARC);
    vec3.scaleAndAdd(pos, game.play.ship.obj.pos(), pos, SUN_SPAWN_DISTANCE);
    sun.translate(pos);
    game.play.suns.push(sun);
  }
}

// Make the object appear vaguely in the direction we're going
function spawnMenuAsteroids(game: Game) {
  let camera = game.menu.camera;
  while (game.menu.asteroids.length < MENU_NUM_ASTEROIDS) {
    let pos = randomArc(camera.forward, MENU_ASTEROID_SPAWN_ARC);
    // Now generate a velocity arc in the opposite direction
    let velocity = randomArcRange(vec3.scale(vec3.create(), pos, -1), MENU_ASTEROID_VELOCITY_ARC);
    vec3.scaleAndAdd(pos, camera.eye, pos, MENU_ASTEROID_SPAWN_DISTANCE);
    vec3.scale(velocity, velocity, randf(...MENU_ASTEROID_SPEED));

    let asteroid = new Asteroid(game.gl, 1, velocity);
    asteroid.velocity = velocity;
    asteroid.obj.translate(pos);
    game.menu.asteroids.push(asteroid);
  }
}

// Make the object appear vaguely in the direction we're going
function despawnMenuAsteroids(game: Game) {
  let deadAsteroids: number[] = [];
  for (const [asteroidId, asteroid] of game.menu.asteroids.entries()) {
    if (vec3.distance(game.menu.camera.eye, asteroid.obj.pos()) > ASTEROID_DESPAWN_DISTANCE) {
      deadAsteroids.push(asteroidId);
    }
  }
  for (let i = deadAsteroids.length - 1; i >= 0; i--) {
    game.menu.asteroids.splice(deadAsteroids[i], 1);
  }
}

// Make the object appear vaguely in the direction we're going
function spawnAsteroids(game: Game) {
  for (let tier = 0; tier < ASTEROID_TIERS; tier++) {
    while (game.play.tieredAsteroids[tier].length < game.play.numAsteroids[tier]) {
      let pos = randomArc(game.play.ship.forward, ASTEROID_SPAWN_ARC);
      // Now generate a velocity arc in the opposite direction
      let velocity = randomArc(
        vec3.scale(vec3.create(), game.play.ship.forward, -1),
        ASTEROID_VELOCITY_ARC,
      );
      vec3.scaleAndAdd(pos, game.play.ship.obj.pos(), pos, ASTEROID_SPAWN_DISTANCE);
      vec3.scale(velocity, velocity, randf(...game.play.asteroidSpeed));

      let asteroid = new Asteroid(game.gl, tier, velocity);
      asteroid.velocity = velocity;
      asteroid.obj.translate(pos);
      game.play.tieredAsteroids[tier].push(asteroid);
    }
  }
}

function despawnSuns(game: Game) {
  let deadSuns: number[] = [];
  for (const [sunId, sun] of game.play.suns.entries()) {
    if (vec3.distance(game.play.ship.obj.pos(), sun.pos()) > SUN_DESPAWN_DISTANCE) {
      deadSuns.push(sunId);
    }
  }
  for (let i = deadSuns.length - 1; i >= 0; i--) {
    game.play.suns.splice(deadSuns[i], 1);
  }
}

function despawnAsteroids(game: Game) {
  let deadAsteroids: Tiered<number[]> = [[], []];
  for (const [tier, asteroids] of game.play.tieredAsteroids.entries()) {
    for (const [asteroidId, asteroid] of asteroids.entries()) {
      if (vec3.distance(game.play.ship.obj.pos(), asteroid.obj.pos()) > ASTEROID_DESPAWN_DISTANCE) {
        deadAsteroids[tier].push(asteroidId);
      }
    }
  }
  for (const [tier, dead] of deadAsteroids.entries()) {
    for (let i = dead.length - 1; i >= 0; i--) {
      game.play.tieredAsteroids[tier].splice(dead[i], 1);
    }
  }
}

function despawnMissiles(game: Game) {
  // TODO: Use a queue or something more efficient?
  while (
    game.play.missiles.length > 0 &&
    game.play.ticks - game.play.missiles[0].birth > MISSILE_LIFE_TICKS
  ) {
    game.play.missiles.shift();
  }
}

function handleDeadAsteroids(game: Game) {
  for (let tier = 0; tier < ASTEROID_TIERS; tier++) {
    for (let i = game.play.tieredAsteroids[tier].length - 1; i >= 0; i--) {
      let asteroid = game.play.tieredAsteroids[tier][i];
      if (asteroid.health <= 0) {
        if (tier + 1 < ASTEROID_TIERS) {
          let children = asteroid.split(game.gl);
          game.play.tieredAsteroids[tier + 1].push(...children);
          game.play.numAsteroids[tier + 1] += children.length;
        }
        game.play.tieredAsteroids[tier].splice(i, 1);
        game.play.numAsteroids[tier] -= 1;
        game.play.score += ASTEROID_POINT_TIERS[tier];
        updateScore(game);
      }
    }
  }
}

function accelerateShip(game: Game) {
  vec3.scaleAndAdd(
    game.play.ship.velocity,
    game.play.ship.velocity,
    game.play.ship.forward,
    SHIP_MAX_THRUST * game.play.ship.throttle.get(),
  );
}

function rotateShip(game: Game) {
  let ship = game.play.ship;

  // In radians per tick
  let turnSpeed = Math.hypot(ship.worldRotation[0], ship.worldRotation[1], ship.worldRotation[2]);
  let rotationFactor =
    (Math.log(turnSpeed) - Math.log(SHIP_ROTATION_EPSILON)) /
    (Math.log(SHIP_ROTATION_TOPOUT) - Math.log(SHIP_ROTATION_EPSILON));
  rotationFactor = clamp(rotationFactor, [0, 1]);
  const scaleFactor = rotationFactor * SHIP_ROTATION_TOPOUT_SCALING;
  quat.scale(ship.worldRotation, ship.worldRotation, scaleFactor);
  quat.calculateW(ship.worldRotation, ship.worldRotation);
  quat.scale(ship.modelRotation, ship.modelRotation, scaleFactor);
  quat.calculateW(ship.modelRotation, ship.modelRotation);

  // Rotate
  vec3.transformQuat(ship.forward, ship.forward, ship.worldRotation);
  vec3.transformQuat(ship.up, ship.up, ship.worldRotation);
  vec3.transformQuat(ship.right, ship.right, ship.worldRotation);

  let modelTransform = mat4.fromQuat(mat4.create(), ship.modelRotation);
  mat4.multiply(ship.obj.vertexTransform, ship.obj.vertexTransform, modelTransform);
}

function moveShip(game: Game) {
  game.play.ship.obj.translate(game.play.ship.velocity);
}

function moveMissiles(game: Game) {
  for (const missile of game.play.missiles) {
    missile.obj.translate(missile.velocity);
  }
}

function moveAsteroids(game: Game) {
  for (const asteroid of allAsteroids(game)) {
    asteroid.obj.translate(asteroid.velocity);
    mat4.rotate(
      asteroid.obj.vertexTransform,
      asteroid.obj.vertexTransform,
      asteroid.rotationSpeed,
      asteroid.rotationAxis,
    );
  }
}

function collideShipAsteroid(game: Game) {
  // TODO: Do more intelligent things on a loss. Also probably just lower
  // health and do certain things when health hits 0 collisions better
  for (const asteroid of allAsteroids(game)) {
    // TODO: Add asteroid momentum
    for (const v of game.play.ship.collisionPoints()) {
      // We use a slightly smaller radius to tilt errors in the players favor
      if (vec3.distance(asteroid.obj.pos(), v) <= ASTEROID_RADIUS_FUDGE_FACTOR * asteroid.radius) {
        // TODO: Add health and collisions
        gameOver(game);
      }
    }
  }
}

function collideShipSun(game: Game) {
  for (const sun of game.play.suns) {
    for (const v of game.play.ship.collisionPoints()) {
      if (sunContains(sun, v)) {
        gameOver(game);
      }
    }
  }
}

function collideMissileAsteroid(game: Game) {
  let deadMissiles: number[] = [];
  for (const asteroid of allAsteroids(game)) {
    for (const [missileId, missile] of game.play.missiles.entries()) {
      let dist = vec3.distance(asteroid.obj.pos(), missile.obj.pos());
      if (dist <= asteroid.radius) {
        deadMissiles.push(missileId);
        asteroid.damage();
      }
    }
  }
  for (let i = deadMissiles.length - 1; i >= 0; i--) {
    game.play.missiles.splice(deadMissiles[i], 1);
  }
}

function collideMissileSun(game: Game) {
  let deadMissiles: number[] = [];
  for (const sun of game.play.suns) {
    for (const [missileId, missile] of game.play.missiles.entries()) {
      if (sunContains(sun, missile.obj.pos())) {
        deadMissiles.push(missileId);
      }
    }
  }
  for (let i = deadMissiles.length - 1; i >= 0; i--) {
    game.play.missiles.splice(deadMissiles[i], 1);
  }
}

function updatePlayCamera(game: Game) {
  game.play.camera = game.play.ship.camera(game.play.lastCameraPosition);
  game.play.lastCameraPosition = game.play.ship.eye();
}

function updateScore(game: Game) {
  display.score.innerText = `Score: ${game.play.score}`;
}

function updateClock(game: Game) {
  let totalSeconds = Math.floor(game.play.ticks / 60);
  let minutes = Math.floor(totalSeconds / 60);
  let seconds = totalSeconds % 60;
  display.time.innerText = `Time: ${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function updateLevel(game: Game) {
  display.level.innerText = `Level: ${game.play.level}`;
}

function handleFreecamMoves(keyboard: Keyboard, camera: FreeCamera) {
  let camMove = vec3.create();

  // Camera movements
  if (keyboard.pressed.has("KeyA")) {
    vec3.scaleAndAdd(camMove, camMove, camera.right, -1);
  }
  if (keyboard.pressed.has("KeyD")) {
    vec3.add(camMove, camMove, camera.right);
  }
  if (keyboard.pressed.has("KeyW")) {
    vec3.add(camMove, camMove, camera.forward);
  }
  if (keyboard.pressed.has("KeyS")) {
    vec3.scaleAndAdd(camMove, camMove, camera.forward, -1);
  }
  if (keyboard.pressed.has("ShiftLeft")) {
    vec3.scaleAndAdd(camMove, camMove, camera.up, -1);
  }
  if (keyboard.pressed.has("Space")) {
    vec3.add(camMove, camMove, camera.up);
  }

  if (!vec3.exactEquals(camMove, vec3.create())) {
    vec3.normalize(camMove, camMove);
    camera.move(camMove, camera.moveSpeed);
  }

  if (keyboard.pressed.has("KeyE")) {
    camera.rollRight(FRECAM_ROLL_SPEED);
  }
  if (keyboard.pressed.has("KeyQ")) {
    camera.rollRight(-FRECAM_ROLL_SPEED);
  }

  if (keyboard.pressed.has("ArrowUp")) {
    camera.moveSpeed += FREECAM_MOVE_SPEED_INCREMENT;
  }
  if (keyboard.pressed.has("ArrowDown") && camera.moveSpeed > FREECAM_MOVE_SPEED_INCREMENT) {
    camera.moveSpeed -= FREECAM_MOVE_SPEED_INCREMENT;
  }
}

function devLoop(game: Game) {
  let keyboard = game.inputs.keyboard;

  handleFreecamMoves(keyboard, game.freecam.camera);

  if (keyboard.pressed.has("ArrowLeft")) {
    game.freecam.generalDebouncer.try(() => {
      game.play.level = Math.max(1, game.play.level - 1);
      game.play.numAsteroids = numAsteroids(game.play.level);
      updateLevel(game);
    });
  }
  if (keyboard.pressed.has("ArrowRight")) {
    game.freecam.generalDebouncer.try(() => {
      game.play.level += 1;
      game.play.numAsteroids = numAsteroids(game.play.level);
      updateLevel(game);
    });
  }

  if (keyboard.pressed.has("KeyF")) {
    game.freecam.generalDebouncer.try(() => {
      game.freecam.fog = !game.freecam.fog;
    });
  }

  if (keyboard.pressed.has("KeyC")) {
    game.freecam.generalDebouncer.try(() => {
      game.freecam.showShipCollisions = !game.freecam.showShipCollisions;
    });
  }

  if (keyboard.pressed.has("KeyB")) {
    game.freecam.freecamModeDebouncer.try(() => undevMode(game));
  }
  render.render(
    game.gl,
    playLights(game),
    playObjects(game),
    game.shaderInfo,
    game.freecam.camera,
    {
      fog: game.freecam.fog,
    },
  );

  scheduleNextFrame(game);
}

function menuLoop(game: Game) {
  despawnMenuAsteroids(game);
  spawnMenuAsteroids(game);

  for (const asteroid of game.menu.asteroids) {
    asteroid.obj.translate(asteroid.velocity);
    mat4.rotate(
      asteroid.obj.vertexTransform,
      asteroid.obj.vertexTransform,
      asteroid.rotationSpeed,
      asteroid.rotationAxis,
    );
  }

  if (game.inputs.keyboard.pressed.has("KeyB")) {
    game.menu.moveModeDebouncer.try(() => {
      if (game.menu.movingCamera) {
        document.exitPointerLock();
        game.menu.movingCamera = false;
      } else {
        canvas.requestPointerLock();
        game.menu.movingCamera = true;
      }
    });
  }

  if (game.menu.movingCamera) {
    handleFreecamMoves(game.inputs.keyboard, game.menu.camera);
  }

  render.render(game.gl, menuLights(game), menuObjects(game), game.shaderInfo, game.menu.camera);

  scheduleNextFrame(game);
}

function pauseLoop(game: Game) {
  if (game.inputs.keyboard.pressed.has("KeyP")) {
    game.inputs.pauseDebouncer.try(() => unpauseGame(game));
  }

  render.render(game.gl, playLights(game), playObjects(game), game.shaderInfo, game.play.camera);

  scheduleNextFrame(game);
}

function playLoop(game: Game) {
  checkNextLevel(game);

  handleKeyboard(game);
  handleGamepad(game);

  // Despawn far away objects
  despawnSuns(game);
  despawnAsteroids(game);
  despawnMissiles(game);

  // Handle new object creation
  spawnSuns(game);
  spawnAsteroids(game);

  // Handle collisions
  collideMissileSun(game);
  collideMissileAsteroid(game);

  // Destroy objects
  handleDeadAsteroids(game);

  // Handle acceleration
  accelerateShip(game);

  // Handle velocity
  moveShip(game);
  moveMissiles(game);
  moveAsteroids(game);

  // Possibly kill ship
  // We don't want to kill the ship if we've finished the level
  if (game.play.levelFinishedAt == null) {
    collideShipAsteroid(game);
    collideShipSun(game);
  }

  updateClock(game);

  updatePlayCamera(game);

  // Sync the ship's model
  game.play.ship.refreshThrottle();
  rotateShip(game);

  if (game.inputs.keyboard.pressed.has("KeyB")) {
    game.freecam.freecamModeDebouncer.try(() => devMode(game));
  }

  game.play.ticks += 1;
  render.render(game.gl, playLights(game), playObjects(game), game.shaderInfo, game.play.camera);

  scheduleNextFrame(game);
}

const canvas = <HTMLCanvasElement>document.getElementById("game-canvas");
// TODO: Make this dynamic instead of hardcoding certain positions. Also move
// to "text" module
const display = {
  score: <HTMLElement>document.getElementById("score-text"),
  time: <HTMLElement>document.getElementById("time-text"),
  level: <HTMLElement>document.getElementById("level-text"),
  menuButton: <HTMLButtonElement>document.getElementById("menu-button"),
  menuButton2: <HTMLButtonElement>document.getElementById("menu-button2"),
  mainText: <HTMLElement>document.getElementById("main-text"),
};

// function updateControllers() {
//   // We leave option 0 for the empty option
//   for (let i = controllers.length - 1; i > 0; i--) {
//     controllers.remove(i);
//   }

//   for (const gamepad of navigator.getGamepads()) {
//     if (gamepad == null) {
//       continue;
//     }
//     controllers.add(new Option(gamepad.id, gamepad.index.toString()));
//   }
// }

function main() {
  // window.addEventListener("gamepadconnected", updateControllers);
  // window.addEventListener("gamepadconnected", updateControllers);
  let gl = render.initWebgl(canvas);
  let game = initGame(gl);

  window.addEventListener("blur", () => {
    if (game.mode == GameMode.Play) {
      pauseGame(game);
    }
    MUSIC.pause();
  });

  display.menuButton.onclick = () => {
    playGame(game, 1);
  };

  // updateControllers();
  // let selectedController = 0;
  // controllers.addEventListener("change", (_: Event) => {
  //   selectedController = parseInt(
  //     (<HTMLOptionElement>controllers[controllers.selectedIndex]).value,
  //   );
  // });

  canvas.onclick = () => {
    if (game.mode == GameMode.Play || game.mode == GameMode.Freecam) {
      canvas.requestPointerLock();
    }
  };
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas) {
      document.addEventListener("mousemove", updatePosition);
    } else {
      document.removeEventListener("mousemove", updatePosition);
    }
  });
  function updatePosition(e: MouseEvent) {
    if (game.mode == GameMode.Freecam) {
      game.freecam.camera.yawLeft(-FRECAM_MOUSE_TURN_SPEED * e.movementX);
      game.freecam.camera.pitchUp(-FRECAM_MOUSE_TURN_SPEED * e.movementY);
    } else if (game.mode == GameMode.Play) {
      game.play.ship.yawLeft(-SHIP_MOUSE_TURN_SPEED * e.movementX);
      game.play.ship.pitchUp(-SHIP_MOUSE_TURN_SPEED * e.movementY);
    } else if (game.mode == GameMode.Menu) {
      game.menu.camera.yawLeft(-FRECAM_MOUSE_TURN_SPEED * e.movementX);
      game.menu.camera.pitchUp(-FRECAM_MOUSE_TURN_SPEED * e.movementY);
    }
  }
  document.addEventListener("mousedown", () => {
    game.inputs.mouseDown = true;
  });
  document.addEventListener("mouseup", () => {
    game.inputs.mouseDown = false;
  });

  scheduleNextFrame(game);
}

main();
