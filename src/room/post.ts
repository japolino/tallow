/**
 * The look of the picture: the room is drawn small into an off-screen
 * buffer, then one pass turns that into the frame on screen: a glow around
 * anything bright, filmic tone mapping, a heavy vignette, a little colour
 * fringing at the edges, grain, and a coarse ordered dither so dark gradients
 * break into texture instead of bands. Chunky pixels are part of the mood,
 * and drawing fewer of them is also what keeps the frame rate steady.
 *
 * The one exception is a page held up to be read: small writing cannot be
 * read through all that, so the room then draws the buffer finer and this
 * pass leaves off the fringing and most of the grain (`clear`).
 */
import {
  HalfFloatType,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  GLSL3,
  RawShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from "three";

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform vec2 uTexel;      // one buffer pixel, in uv
uniform float uTime;
uniform float uExposure;
uniform float uGrain;
uniform float uVignette;
uniform float uDither;
uniform float uCold;      // 0..1: cools the grade a little
uniform vec3 uHaze;       // fog in the room: this colour is laid over the picture, by uHazeK
uniform float uHazeK;
uniform float uClear;     // 0..1: a page is up to be read: no fringing, little grain, fine steps of colour
uniform float uLod;       // how many times finer than usual the buffer is, as a power of two: the glow stays as wide
in vec2 vUv;
out vec4 outColor;

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[idx]) + 0.5) / 16.0;
}
vec3 scene(vec2 uv) {
  // Snap to the centre of a buffer pixel: the picture stays chunky when scaled up.
  vec2 s = (floor(uv / uTexel) + 0.5) * uTexel;
  return textureLod(tScene, s, 0.0).rgb;
}
void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  // Colour fringing, growing toward the corners.
  vec2 fr = c * r2 * 0.012 * (1.0 - uClear);
  vec3 col = vec3(scene(vUv + fr).r, scene(vUv).g, scene(vUv - fr).b);
  // Glow: the blurred levels of the buffer, kept only where they are bright.
  vec3 glow = vec3(0.0);
  glow += max(textureLod(tScene, vUv, 3.0 + uLod).rgb - 0.9, 0.0) * 0.5;
  glow += max(textureLod(tScene, vUv, 4.5 + uLod).rgb - 0.6, 0.0) * 0.45;
  glow += max(textureLod(tScene, vUv, 6.0 + uLod).rgb - 0.35, 0.0) * 0.35;
  // A lit page would glow over its own writing: less of it while one is being read.
  col += glow * (1.0 - 0.6 * uClear);
  col *= uExposure;
  // The vignette is applied before tone mapping, so it swallows the corners into black.
  vec2 vc = vUv - vec2(0.5, 0.44);
  float vig = smoothstep(1.0, 0.24, length(vc) * 1.36);
  col *= mix(1.0, vig, uVignette);
  // Fog in the room greys everything a little and lifts the blacks.
  col = mix(col, uHaze, uHazeK);
  col = aces(col);
  // The grade: lifted warm shadows by fire, a colder cast in the snow.
  col = mix(col, col * vec3(0.9, 0.98, 1.12), uCold * 0.55);
  col = pow(col, vec3(1.0 / 2.2));
  vec2 px = floor(vUv / uTexel);
  float g = hash(px + floor(uTime * 12.0) * 17.0) - 0.5;
  col += g * uGrain * (1.0 - 0.8 * uClear) * (1.0 - 0.6 * dot(col, vec3(0.3, 0.59, 0.11)));
  // Ordered dither down to a few levels per channel.
  float levels = mix(40.0, 255.0, uClear);
  col = floor(col * levels + bayer4(px) * uDither + (1.0 - uDither) * 0.5) / levels;
  outColor = vec4(col, 1.0);
}`;

const VERT = /* glsl */ `
in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export class Post {
  private target: WebGLRenderTarget;
  private quad: Mesh;
  private scene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: RawShaderMaterial;
  private size = new Vector2(2, 2);

  constructor(private renderer: WebGLRenderer) {
    // The stencil is for the page in your hands, which marks where it is so the hands behind it are left out there.
    this.target = new WebGLRenderTarget(2, 2, { type: HalfFloatType, depthBuffer: true, stencilBuffer: true, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter });
    this.mat = new RawShaderMaterial({
      glslVersion: GLSL3,
      uniforms: {
        tScene: { value: this.target.texture },
        uTexel: { value: new Vector2(0.5, 0.5) },
        uTime: { value: 0 },
        uExposure: { value: 1 },
        uGrain: { value: 0.06 },
        uVignette: { value: 1 },
        uDither: { value: 1 },
        uCold: { value: 0 },
        uHaze: { value: [0, 0, 0] },
        uHazeK: { value: 0 },
        uClear: { value: 0 },
        uLod: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /**
   * Size of the off-screen buffer in pixels.
   * @param finer how many times finer than usual that is (1 as a rule; more while a page is being read)
   */
  resize(w: number, h: number, finer = 1): void {
    this.size.set(Math.max(2, Math.round(w)), Math.max(2, Math.round(h)));
    this.target.setSize(this.size.x, this.size.y);
    (this.mat.uniforms.uTexel!.value as Vector2).set(1 / this.size.x, 1 / this.size.y);
    this.mat.uniforms.uLod!.value = Math.log2(Math.max(1, finer));
  }

  get bufferSize(): Vector2 {
    return this.size;
  }

  /** @param o.clear 0..1: how far a page is up to be read, when the picture is to be plain enough to read small writing in */
  set(o: { time: number; exposure: number; cold: number; still: boolean; haze?: [number, number, number]; hazeK?: number; clear?: number }): void {
    const u = this.mat.uniforms;
    u.uClear!.value = o.clear ?? 0;
    u.uHaze!.value = o.haze ?? [0, 0, 0];
    u.uHazeK!.value = o.hazeK ?? 0;
    u.uTime!.value = o.still ? 0 : o.time;
    u.uExposure!.value = o.exposure;
    u.uCold!.value = o.cold;
  }

  render(scene: Scene, camera: Camera): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.cam);
  }

  dispose(): void {
    this.target.dispose();
    this.mat.dispose();
    this.quad.geometry.dispose();
  }
}
