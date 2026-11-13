import * as THREE from 'three';
import { ClockTexture } from './clock';
import { sampleBilinear } from './fill';
import type { PreparedAssets } from './prepare';

export type ViewMode = 'composite' | 'background' | 'character' | 'depth';

export interface ViewerSettings {
  /** World-space depth of the full 0..1 depth range (image height = 1). */
  depthScale: number;
  /** How far the camera travels at full mouse deflection (image height = 1). */
  motion: number;
  /** Depth value (0..1) that stays fixed on screen while the camera moves. */
  focus: number;
  /** Crop factor so the frame edges never come into view. */
  zoom: number;
  clock: boolean;
  /** Depth value (0..1) of the clock plane. It is always drawn between the layers. */
  clockDepth: number;
  /** Vertical center of the clock, as a fraction of the visible height from the top. */
  clockY: number;
  /** Clock width as a fraction of the visible width. */
  clockSize: number;
  view: ViewMode;
}

export const DEFAULT_SETTINGS: ViewerSettings = {
  depthScale: 0.5,
  motion: 0.18,
  focus: 0.6,
  zoom: 1.12,
  clock: true,
  clockDepth: 0.45,
  clockY: 0.2,
  clockSize: 0.62,
  view: 'composite',
};

const FOV = 30;
/** Grid extends this far past the image (fraction of the image) so edges never show. */
const MARGIN = 0.15;
/** Mesh segments along the image's long side. */
const SEGMENTS = 320;

// Each vertex is placed along the ray from the centered camera through its
// pixel, at a depth given by the depth map. At rest the render matches the
// source image exactly; moving the camera reveals the depth.
const VERT = /* glsl */ `
attribute float depth;
uniform float uScale;
uniform float uFocus;
uniform float uDist;
uniform float uBias;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position.xy, 0.0, 1.0);
  float z = (depth + uBias - uFocus) * uScale;
  wp.xy *= (uDist - z) / uDist;
  wp.z = z;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

// Textures are premultiplied and carry raw sRGB bytes; pass them through untouched.
const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(map, clamp(vUv, 0.0, 1.0));
  if (c.a < 0.004) discard;
  gl_FragColor = c;
}
`;

function makeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      map: { value: null },
      uScale: { value: 0.5 },
      uFocus: { value: 0.5 },
      uDist: { value: 2 },
      uBias: { value: 0 },
    },
    transparent: true,
    premultipliedAlpha: true,
    depthTest: true,
    depthWrite: true,
  });
}

function buildLayerGeometry(aspect: number, depth: Float32Array, dw: number, dh: number): THREE.BufferGeometry {
  const span = 1 + 2 * MARGIN;
  const segX = Math.max(2, Math.round((aspect >= 1 ? SEGMENTS : SEGMENTS * aspect) * span));
  const segY = Math.max(2, Math.round((aspect >= 1 ? SEGMENTS / aspect : SEGMENTS) * span));
  const nx = segX + 1;
  const ny = segY + 1;
  const pos = new Float32Array(nx * ny * 3);
  const uv = new Float32Array(nx * ny * 2);
  const dep = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const t = -MARGIN + (j / segY) * span; // 0 = top row of the image
    for (let i = 0; i < nx; i++) {
      const u = -MARGIN + (i / segX) * span;
      const k = j * nx + i;
      pos[k * 3] = (u - 0.5) * aspect;
      pos[k * 3 + 1] = 0.5 - t;
      uv[k * 2] = u;
      uv[k * 2 + 1] = 1 - t;
      dep[k] = sampleBilinear(depth, dw, dh, u * dw - 0.5, t * dh - 0.5);
    }
  }
  const index = new Uint32Array(segX * segY * 6);
  let o = 0;
  for (let j = 0; j < segY; j++) {
    for (let i = 0; i < segX; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      index[o++] = a;
      index[o++] = c;
      index[o++] = b;
      index[o++] = b;
      index[o++] = c;
      index[o++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('depth', new THREE.BufferAttribute(dep, 1));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

function buildClockGeometry(): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 0.5);
  g.setAttribute('depth', new THREE.BufferAttribute(new Float32Array(4), 1));
  return g;
}

export class ParallaxViewer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
  private readonly bgScene = new THREE.Scene();
  private readonly clockScene = new THREE.Scene();
  private readonly fgScene = new THREE.Scene();
  private readonly bgMat = makeMaterial();
  private readonly fgMat = makeMaterial();
  private readonly clockMat = makeMaterial();
  private readonly clockTex = new ClockTexture();
  private readonly clockMesh: THREE.Mesh;
  private bgMesh: THREE.Mesh | null = null;
  private fgMesh: THREE.Mesh | null = null;
  private assets: PreparedAssets | null = null;
  private settings: ViewerSettings = DEFAULT_SETTINGS;
  private readonly pointer = { tx: 0, ty: 0, x: 0, y: 0 };
  private readonly resizeObserver: ResizeObserver;
  private raf = 0;
  private lastTime = 0;
  private lastClockCheck = 0;

  private readonly container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.display = 'block';
    container.appendChild(this.renderer.domElement);

    this.clockMat.uniforms.map.value = this.clockTex.texture;
    this.clockMesh = new THREE.Mesh(buildClockGeometry(), this.clockMat);
    this.clockMesh.frustumCulled = false;
    this.clockScene.add(this.clockMesh);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    window.addEventListener('pointermove', this.onPointerMove);
    document.documentElement.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('blur', this.onPointerLeave);
    this.raf = requestAnimationFrame(this.frame);
  }

  setAssets(assets: PreparedAssets | null): void {
    if (assets === this.assets) return;
    this.assets = assets;
    for (const m of [this.bgMesh, this.fgMesh]) {
      if (m) {
        m.removeFromParent();
        m.geometry.dispose();
      }
    }
    this.bgMesh = this.fgMesh = null;
    if (!assets) return;

    const anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    assets.bgTexture.anisotropy = anisotropy;
    assets.fgTexture.anisotropy = anisotropy;

    this.bgMesh = new THREE.Mesh(buildLayerGeometry(assets.aspect, assets.bgDepth, assets.workW, assets.workH), this.bgMat);
    this.fgMesh = new THREE.Mesh(buildLayerGeometry(assets.aspect, assets.fgDepth, assets.workW, assets.workH), this.fgMat);
    this.bgMesh.frustumCulled = this.fgMesh.frustumCulled = false;
    this.bgScene.add(this.bgMesh);
    this.fgScene.add(this.fgMesh);
  }

  setSettings(settings: ViewerSettings): void {
    this.settings = settings;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    window.removeEventListener('pointermove', this.onPointerMove);
    document.documentElement.removeEventListener('pointerleave', this.onPointerLeave);
    window.removeEventListener('blur', this.onPointerLeave);
    this.setAssets(null);
    this.clockMesh.geometry.dispose();
    this.clockTex.dispose();
    for (const m of [this.bgMat, this.fgMat, this.clockMat]) m.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private onPointerMove = (e: PointerEvent): void => {
    const rect = this.container.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    this.pointer.tx = clamp((e.clientX - cx) / (window.innerWidth / 2));
    this.pointer.ty = clamp(-(e.clientY - cy) / (window.innerHeight / 2));
  };

  private onPointerLeave = (): void => {
    this.pointer.tx = 0;
    this.pointer.ty = 0;
  };

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Camera distance at which the focus plane covers the viewport (cover fit + zoom crop). */
  private cameraDistance(): number {
    return this.coverHeight() / this.settings.zoom / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  }

  /** Visible image height (image height = 1) when the image covers the viewport at zoom 1. */
  private coverHeight(): number {
    const imgAspect = this.assets?.aspect ?? 1;
    return Math.min(1, imgAspect / this.camera.aspect);
  }

  private frame = (time: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (time - (this.lastTime || time)) / 1000);
    this.lastTime = time;

    if (time - this.lastClockCheck > 1000) {
      this.lastClockCheck = time;
      this.clockTex.update();
    }

    const s = this.settings;
    const p = this.pointer;
    const k = 1 - Math.exp(-dt * 5);
    p.x += (p.tx - p.x) * k;
    p.y += (p.ty - p.y) * k;

    const dist = this.cameraDistance();
    this.camera.position.set(p.x * s.motion, p.y * s.motion, dist);
    this.camera.lookAt(0, 0, 0);

    for (const m of [this.bgMat, this.fgMat, this.clockMat]) {
      m.uniforms.uScale.value = s.depthScale;
      m.uniforms.uFocus.value = s.focus;
      m.uniforms.uDist.value = dist;
    }

    const a = this.assets;
    const r = this.renderer;
    r.clear();
    if (!a || !this.bgMesh || !this.fgMesh) return;

    const depthView = s.view === 'depth';
    this.bgMat.uniforms.map.value = depthView ? a.bgDepthTexture : a.bgTexture;
    this.fgMat.uniforms.map.value = depthView ? a.fgDepthTexture : a.fgTexture;

    // Clock size and position are relative to the visible part of the image,
    // so they hold up when the viewport crops it (for example a phone screen).
    const visH = this.coverHeight();
    const clockW = s.clockSize * visH * this.camera.aspect;
    this.clockMesh.scale.set(clockW, clockW, 1);
    this.clockMesh.position.set(0, (0.5 - s.clockY) * visH, 0);
    this.clockMat.uniforms.uBias.value = s.clockDepth;

    // Painter's order with a depth clear between layers: the clock is always
    // sandwiched between background and character, whatever their depths.
    if (s.view !== 'character') r.render(this.bgScene, this.camera);
    if (s.clock && s.view !== 'character') {
      r.clearDepth();
      r.render(this.clockScene, this.camera);
    }
    if (s.view !== 'background') {
      r.clearDepth();
      r.render(this.fgScene, this.camera);
    }
  };
}
