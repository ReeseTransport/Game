// ============================================================
// World: renderer, scene, sky, sun, fog, ground, clouds, mountains
// ============================================================
import * as THREE from 'three';
import { canvasTexture, radialSprite, cloudTexture, rand, TAU, clamp } from './util.js';
import { RoomEnvironment } from '../vendor/jsm/environments/RoomEnvironment.js';

const SKY_TOP = new THREE.Color('#3f86dd');
const SKY_BOTTOM = new THREE.Color('#d4e6f3');
const FOG_COLOR = new THREE.Color('#cfe2f0');
const SUN_DIR = new THREE.Vector3(-0.55, 0.62, -0.56).normalize();

export class World {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.AgXToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(FOG_COLOR, 420, 2600);

    // neutral studio IBL immediately; replaced by the HDRI sky once it streams in
    this._pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this._pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this._buildSky();
    this._buildLights();
    this._buildGround();
    this._buildClouds();
    this._buildMountains();
    this._loadHDRI();

    this.clock = new THREE.Clock();
  }

  // Real-sky HDRI for background + image-based lighting (CC0, Poly Haven).
  async _loadHDRI() {
    try {
      const { RGBELoader } = await import('../vendor/jsm/loaders/RGBELoader.js');
      const tex = await new RGBELoader().loadAsync('./assets/sky.hdr');
      tex.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.environment = this._pmrem.fromEquirectangular(tex).texture;
      this.scene.background = tex;
      this.scene.backgroundIntensity = 1.05;
      if (this._skyDome) this._skyDome.visible = false;
      if (this._sunSprite) this._sunSprite.visible = false;
      this.hdriLoaded = true;
    } catch (e) {
      console.warn('[world] HDRI load failed, using gradient sky:', (e && e.message) || e);
    }
  }

  // ---- Sky dome with vertical gradient + sun glow ----
  _buildSky() {
    const uniforms = {
      topColor: { value: SKY_TOP },
      bottomColor: { value: SKY_BOTTOM },
      offset: { value: 120 },
      exponent: { value: 0.7 },
    };
    const skyGeo = new THREE.SphereGeometry(4000, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec3 vWorldPosition;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPosition = wp.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          float t = pow(clamp(h, 0.0, 1.0), exponent);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }`,
    });
    this._skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this._skyDome);

    // Sun glow billboard high in the sky (hidden once the HDRI sun takes over).
    const sunMat = new THREE.SpriteMaterial({
      map: radialSprite('rgba(255,250,235,1)', 0.15),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this._sunSprite = new THREE.Sprite(sunMat);
    this._sunSprite.scale.set(620, 620, 1);
    this._sunSprite.position.copy(SUN_DIR).multiplyScalar(2600);
    this.scene.add(this._sunSprite);
  }

  // ---- Lighting ----
  _buildLights() {
    const hemi = new THREE.HemisphereLight('#cfe2f5', '#5b6438', 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff4e0', 2.3);
    sun.position.copy(SUN_DIR).multiplyScalar(220);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 90;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 600;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.5;
    this.scene.add(sun);
    this.scene.add(sun.target);
    this.sun = sun;

    this.scene.add(new THREE.AmbientLight('#ffffff', 0.18));
  }

  // ---- Ground ----
  _buildGround() {
    const tex = canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#6f8a3c';
      ctx.fillRect(0, 0, w, h);
      // mottled grass
      for (let i = 0; i < 2600; i++) {
        const g = 90 + Math.floor(rand(-26, 34));
        const r = 70 + Math.floor(rand(-18, 28));
        const b = 40 + Math.floor(rand(-14, 22));
        ctx.fillStyle = `rgba(${r},${g},${b},${rand(0.15, 0.5).toFixed(2)})`;
        const s = rand(2, 9);
        ctx.fillRect(rand(0, w), rand(0, h), s, s);
      }
    }, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, repeat: [260, 260], anisotropy: 8 });

    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.96, metalness: 0 });
    const geo = new THREE.PlaneGeometry(7000, 7000);
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  // ---- Drifting clouds ----
  _buildClouds() {
    this.clouds = new THREE.Group();
    const mat = new THREE.SpriteMaterial({
      map: cloudTexture(),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      fog: false,
    });
    for (let i = 0; i < 16; i++) {
      const s = new THREE.Sprite(mat.clone());
      const scl = rand(420, 820);
      s.scale.set(scl, scl * 0.5, 1);
      s.position.set(rand(-2600, 2600), rand(620, 1150), rand(-2600, 2600));
      s.material.opacity = rand(0.55, 0.95);
      s.userData.speed = rand(2, 6);
      this.clouds.add(s);
    }
    this.scene.add(this.clouds);
  }

  // ---- Hazy mountain ring ----
  _buildMountains() {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: '#6f86a6',
      roughness: 1,
      metalness: 0,
      flatShading: true,
    });
    const count = 50;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + rand(-0.04, 0.04);
      const dist = rand(1750, 2200);
      const height = rand(260, 560);
      const radius = rand(280, 520);
      const geo = new THREE.ConeGeometry(radius, height, 6, 1);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(a) * dist, height / 2 - 30, Math.sin(a) * dist);
      m.rotation.y = rand(0, TAU);
      m.scale.x = rand(0.8, 1.5);
      group.add(m);
    }
    this.scene.add(group);
  }

  // Keep the sun's shadow frustum centred on the car.
  update(dt, focus) {
    if (focus && this.sun) {
      this.sun.position.copy(SUN_DIR).multiplyScalar(220).add(focus);
      this.sun.target.position.copy(focus);
      this.sun.target.updateMatrixWorld();
    }
    if (this.clouds) {
      for (const c of this.clouds.children) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 2700) c.position.x = -2700;
      }
    }
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}

export { SUN_DIR };
