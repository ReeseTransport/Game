// ============================================================
// Post-processing: MSAA + bloom + a speed-driven radial-blur /
// vignette / chromatic-aberration pass, then AgX tone-mapping output.
// ============================================================
import * as THREE from 'three';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { clamp, damp } from './util.js';

// Fullscreen "sense of speed" effect.
const SpeedFXShader = {
  uniforms: {
    tDiffuse: { value: null },
    uAmount: { value: 0 },   // 0..1 speed-driven
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      vec2 center = vec2(0.5);
      vec2 dir = vUv - center;
      float dist = length(dir);
      float edge = smoothstep(0.12, 0.72, dist);
      float amt = uAmount * edge;

      // radial zoom blur toward the centre
      vec3 col = vec3(0.0);
      float tot = 0.0;
      for (int i = 0; i < 8; i++) {
        float t = float(i) / 7.0;
        float s = 1.0 - amt * 0.22 * t;
        float w = 1.0 - t * 0.4;
        col += texture2D(tDiffuse, center + dir * s).rgb * w;
        tot += w;
      }
      col /= tot;

      // chromatic aberration along the radial direction
      vec2 ca = dir * (amt * 0.012 + 0.0006);
      col.r = texture2D(tDiffuse, vUv + ca).r;
      col.b = texture2D(tDiffuse, vUv - ca).b;

      // vignette (subtle at rest, stronger at speed)
      col *= 1.0 - edge * (0.26 + uAmount * 0.22);

      // gentle saturation lift
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.08);

      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4, // MSAA
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.7, 0.85);
    this.composer.addPass(this.bloom);

    this.speed = new ShaderPass(SpeedFXShader);
    this.composer.addPass(this.speed);

    this.composer.addPass(new OutputPass());
    this._amt = 0;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  render(dt, speedFrac) {
    this._amt = damp(this._amt, clamp(speedFrac, 0, 1), 5, dt);
    this.speed.uniforms.uAmount.value = this._amt;
    this.composer.render(dt);
  }
}
