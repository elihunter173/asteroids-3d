import { vec3, mat4 } from "gl-matrix";

import * as models from "./models";
import { Model } from "./models";

export const NUM_SUNS: number = 4;

export const FOG_START = 24;
export const FOG_END = 32;
export const FOG_COLOR = models.SPACE_COLOR;

export class SceneObject {
  // this contains vertex coordinates in triples
  public vertexPosBuffer: WebGLBuffer;
  // this contains indices into vertexBuffer in triples
  public triangleBuffer: WebGLBuffer;
  // the number of indices in the triangle buffer
  public triangleBufferSize: number;
  // The input model this scene comes from
  public model: Model;
  // Model transforms
  public vertexTransform: mat4;

  constructor(gl: WebGLRenderingContext, model: Model, vertexTransform: mat4 = mat4.create()) {
    // Send vertex positions to webgl
    let vertexPosArray = model.vertices.flat();
    let vertexPosBuffer = gl.createBuffer();
    if (vertexPosBuffer == null) {
      throw "could not create webgl buffer";
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexPosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertexPosArray), gl.STATIC_DRAW);

    // Send the triangle indexes to webgl
    let triangleArray = model.triangles.flat();
    let triangleBuffer = gl.createBuffer();
    if (triangleBuffer == null) {
      throw "could not create webgl buffer";
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(triangleArray), gl.STATIC_DRAW);

    this.vertexPosBuffer = vertexPosBuffer;
    this.triangleBuffer = triangleBuffer;
    this.triangleBufferSize = triangleArray.length;
    this.model = model;
    this.vertexTransform = vertexTransform;
  }

  translate(v: vec3) {
    mat4.multiply(
      this.vertexTransform,
      mat4.fromTranslation(mat4.create(), v),
      this.vertexTransform,
    );
  }

  rotate(rads: number) {
    mat4.rotateZ(this.vertexTransform, this.vertexTransform, rads);
  }

  pos(): vec3 {
    return mat4.getTranslation(vec3.create(), this.vertexTransform);
  }
}

const SHADER_ATTRIBUTES = ["aVertexPos"];
const SHADER_UNIFORMS = [
  "uViewingTransform",
  "uPerspectiveTransform",
  "uVertexTransform",
  "uLights",
  "uNumLights",
  "uEyePos",
  "uFog",

  "uMaterial.ambient",
  "uMaterial.diffuse",
  "uMaterial.specular",
  "uMaterial.shine",
];

export type ShaderAttributes = {
  attribs: {
    aVertexPos: number;
  };
  uniforms: {
    uViewingTransform: WebGLUniformLocation;
    uPerspectiveTransform: WebGLUniformLocation;
    uVertexTransform: WebGLUniformLocation;
    uLights: WebGLUniformLocation;
    uNumLights: WebGLUniformLocation;
    uEyePos: WebGLUniformLocation;
    uFog: WebGLUniformLocation;

    "uMaterial.ambient": WebGLUniformLocation;
    "uMaterial.diffuse": WebGLUniformLocation;
    "uMaterial.specular": WebGLUniformLocation;
    "uMaterial.shine": WebGLUniformLocation;

    uSampler: WebGLUniformLocation;
  };
};

export function initWebgl(canvas: HTMLCanvasElement): WebGLRenderingContext {
  let gl = canvas.getContext("webgl");
  if (gl == null) {
    throw "unable to create gl context -- is your browser gl ready?";
  }

  // use max when we clear the depth buffer
  gl.clearDepth(1.0);
  gl.clearColor(...models.SPACE_COLOR, 1);
  // use hidden surface removal (with zbuffering)
  gl.enable(gl.DEPTH_TEST);

  // We must enable blending so that we see the objects behind us

  return gl;
}

// setup the webGL shaders
export function setupShaders(gl: WebGLRenderingContext): ShaderAttributes {
  gl.getExtension("OES_standard_derivatives");

  let vShaderCode = `
precision highp float;

uniform mat4 uViewingTransform;
uniform mat4 uPerspectiveTransform;

uniform mat4 uVertexTransform;

attribute vec3 aVertexPos;
varying vec4 vSurfacePos;

void main(void) {
  vSurfacePos = uVertexTransform * vec4(aVertexPos, 1.0);

  gl_Position = uPerspectiveTransform * uViewingTransform * vSurfacePos;
}
`;

  // create vertex shader
  let vShader = gl.createShader(gl.VERTEX_SHADER);
  if (vShader == null) {
    throw "could not create webgl shader";
  }
  gl.shaderSource(vShader, vShaderCode);
  gl.compileShader(vShader);
  if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) {
    throw "error during vertex shader compile: " + gl.getShaderInfoLog(vShader);
  }

  let fShaderCode = `
#extension GL_OES_standard_derivatives : enable

precision highp float;

const int NUM_SUNS = ${NUM_SUNS};
const float FOG_START = ${FOG_START.toFixed(10)};
const float FOG_END = ${FOG_END.toFixed(10)};
const vec3 FOG_COLOR = vec3(${FOG_COLOR[0]}, ${FOG_COLOR[1]}, ${FOG_COLOR[2]});

uniform vec3 uLights[NUM_SUNS];
uniform int uNumLights;
uniform vec3 uEyePos;
uniform int uFog;

struct Material {
  vec3 ambient;
  vec3 diffuse;
  vec3 specular;
  float shine;
};

uniform Material uMaterial;

varying vec4 vSurfacePos;

void main(void) {
  vec3 color = uMaterial.ambient;

  vec3 viewVector = normalize(uEyePos - vSurfacePos.xyz);
  vec3 normalVector = normalize(cross(
    dFdx(vSurfacePos.xyz),
    dFdy(vSurfacePos.xyz)
  ));

  for (int i = 0; i < NUM_SUNS; i++) {
    if (i >= uNumLights) {
      break;
    }

    vec3 lightVector = normalize(uLights[i] - vSurfacePos.xyz);
    vec3 halfVector = normalize(viewVector + lightVector);

    float lightDist = length(uLights[i] - vSurfacePos.xyz);
    float attenuation = 1.0 / (1.0 + 0.01*lightDist + 0.002*lightDist*lightDist*lightDist);

    vec3 diffuse = attenuation * uMaterial.diffuse * max(0.0, dot(normalVector, lightVector));
    vec3 specular = attenuation * uMaterial.specular * pow(max(0.0, dot(normalVector, halfVector)), uMaterial.shine);
    color += diffuse + specular;
  }

  float fogFactor = 0.0;
  if (uFog == 1) {
    float dist = length(uEyePos - vSurfacePos.xyz);
    fogFactor = min(1.0, max(0.0, dist - FOG_START) / (FOG_END - FOG_START));
  }

  gl_FragColor = vec4(mix(color, FOG_COLOR, fogFactor), 1.0);
}
`;

  // create frag shader
  let fShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (fShader == null) {
    throw "could not create webgl shader";
  }
  gl.shaderSource(fShader, fShaderCode);
  gl.compileShader(fShader);
  if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) {
    throw "error during fragment shader compile: " + gl.getShaderInfoLog(fShader);
  }

  // create the single shader program
  let shaderProgram = gl.createProgram();
  if (shaderProgram == null) {
    throw "could not create webgl program";
  }
  gl.attachShader(shaderProgram, fShader);
  gl.attachShader(shaderProgram, vShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    throw "error during shader program linking: " + gl.getProgramInfoLog(shaderProgram);
  }

  gl.useProgram(shaderProgram);

  let shaderAttributes = {
    attribs: {},
    uniforms: {},
  };

  for (const name of SHADER_ATTRIBUTES) {
    let attrib = gl.getAttribLocation(shaderProgram, name);
    if (attrib == -1) {
      throw `invalid attribute ${name}`;
    }
    gl.enableVertexAttribArray(attrib);
    shaderAttributes.attribs[name] = attrib;
  }

  for (const name of SHADER_UNIFORMS) {
    let uniform = gl.getUniformLocation(shaderProgram, name);
    shaderAttributes.uniforms[name] = uniform;
  }

  return shaderAttributes as ShaderAttributes;
}

export interface Camera {
  eye: vec3;
  viewingTransform: mat4;
  perspectiveTransform: mat4;
}

// TODO: Just use array rather than iterable?
export function render(
  gl: WebGLRenderingContext,
  lights: Iterable<vec3>,
  objects: Iterable<SceneObject>,
  shaderInfo: ShaderAttributes,
  camera: Camera,
  opts?: {
    fog: boolean;
  },
) {
  if (opts == undefined) {
    opts = { fog: true };
  }

  // clear frame/depth buffers
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  function bindBufferTo(buffer: WebGLBuffer, attrib: GLuint, size: number) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(
      attrib,
      size, // size
      gl.FLOAT, // type
      false, // normalized
      0, // stride
      0, // offset
    );
  }

  let lightsArr: number[] = [];
  let numLights: number = 0;
  for (let lightPos of lights) {
    lightsArr.push(...lightPos);
    numLights += 1;
  }
  gl.uniform3fv(shaderInfo.uniforms.uLights, lightsArr);
  gl.uniform1i(shaderInfo.uniforms.uNumLights, numLights);

  gl.uniform1i(shaderInfo.uniforms.uFog, opts.fog ? 1 : 0);

  // These uniforms don't change across the models
  gl.uniform3fv(shaderInfo.uniforms.uEyePos, camera.eye);

  gl.uniformMatrix4fv(shaderInfo.uniforms.uViewingTransform, false, camera.viewingTransform);
  gl.uniformMatrix4fv(
    shaderInfo.uniforms.uPerspectiveTransform,
    false,
    camera.perspectiveTransform,
  );

  // We cannot use an iterable repeatedly
  let objectsArr = Array.from(objects);
  for (const obj of objectsArr) {
    bindBufferTo(obj.vertexPosBuffer, shaderInfo.attribs.aVertexPos, 3);

    gl.uniformMatrix4fv(shaderInfo.uniforms.uVertexTransform, false, obj.vertexTransform);

    let material = obj.model.material;
    gl.uniform3fv(shaderInfo.uniforms["uMaterial.ambient"], material.ambient);
    gl.uniform3fv(shaderInfo.uniforms["uMaterial.diffuse"], material.diffuse);
    gl.uniform3fv(shaderInfo.uniforms["uMaterial.specular"], material.specular);
    gl.uniform1f(shaderInfo.uniforms["uMaterial.shine"], material.n);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, obj.triangleBuffer);
    gl.drawElements(gl.TRIANGLES, obj.triangleBufferSize, gl.UNSIGNED_SHORT, 0);
  }
}
