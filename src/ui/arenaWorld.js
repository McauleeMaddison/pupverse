import * as T from 'three';
import { WORLDS } from './worlds.js';

// One lazily created WebGL context across previews, battles and pack reveals.
// Geometry is procedural and repeated scenery is instanced: no texture downloads,
// shadow maps, bloom buffers or extra rendering passes on a mobile device.
let renderer;
let disposeScene = () => {};

export function mountWorld(host, options = {}) {
  disposeScene();
  disposeScene = () => {};
  if (!host) return;
  const worldId = WORLDS[options.world] ? options.world : 'nebula';
  const world = WORLDS[worldId];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(pointer: coarse)').matches;
  const limited = mobile || navigator.hardwareConcurrency <= 4 || navigator.deviceMemory <= 4;
  let eco = options.quality === 'eco' || (options.quality !== 'high' && limited);
  let pixelRatio = Math.min(devicePixelRatio || 1, eco ? 1 : 1.5);
  try {
    renderer ||= new T.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
  } catch {
    host.dataset.fallback = 'true';
    return;
  }
  const canvas = renderer.domElement;
  host.append(canvas);
  host.dataset.rendered = 'true';
  host.dataset.renderQuality = eco ? 'eco' : 'high';
  delete host.dataset.fallback;
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(world.sky, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(world.sky, .025);
  const camera = new T.PerspectiveCamera(43, 1, .1, 90);
  camera.position.set(0, 7.3, 19.5);
  camera.lookAt(0, 1.0, -1);
  scene.add(new T.HemisphereLight(world.color, '#101121', 2.25));
  const sun = new T.DirectionalLight(world.accent, 3.1);
  sun.position.set(-7, 11, 5);
  scene.add(sun);
  const rim = new T.DirectionalLight(world.color, 2.2);
  rim.position.set(7, 3, -8);
  scene.add(rim);

  const materials = new Set();
  const geometries = new Set();
  const geometryCache = new Map();
  const batches = new Map();
  const dummy = new T.Object3D();
  const keepGeometry = (geometry) => { geometries.add(geometry); return geometry; };
  const geo = (key, factory) => {
    if (!geometryCache.has(key)) geometryCache.set(key, keepGeometry(factory()));
    return geometryCache.get(key);
  };
  const material = (color, emissive = false) => {
    const result = emissive
      ? new T.MeshBasicMaterial({ color })
      : new T.MeshStandardMaterial({ color, roughness: .66, metalness: .24, flatShading: true });
    materials.add(result);
    return result;
  };
  const stone = material(worldId === 'coast' ? '#1b5762' : worldId === 'cyber' ? '#172b4d' : '#362959');
  const face = material(worldId === 'coast' ? '#42747b' : '#625382');
  const dark = material(worldId === 'coast' ? '#123a47' : '#171a31');
  const metal = material(worldId === 'coast' ? '#c3a37b' : '#8474a7');
  const foliage = material(worldId === 'coast' ? '#248c87' : '#885bb0');
  const glow = material(options.color || world.color, true);
  const accent = material(world.accent, true);
  const pale = material('#e8f8ff', true);
  const box = geo('box', () => new T.BoxGeometry(1, 1, 1));
  const rock = geo('rock', () => new T.IcosahedronGeometry(1, 0));
  const crystal = geo('crystal', () => new T.OctahedronGeometry(1, 0));
  const hex = geo('hex', () => new T.CylinderGeometry(1, 1, 1, 6));
  const spire = geo('spire', () => new T.ConeGeometry(1, 1, 6));
  const pillar = geo('pillar', () => new T.CylinderGeometry(1, 1, 1, 8));
  const ringGeo = geo('ring', () => new T.TorusGeometry(1, .013, 5, eco ? 48 : 72));
  const shard = geo('shard', () => new T.ConeGeometry(1, 1, 4));

  // Static geometry/material pairs share one draw call, even across many objects.
  function instance(geometry, surface, x, y, z, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const key = `${geometry.id}:${surface.id}`;
    if (!batches.has(key)) batches.set(key, { geometry, surface, matrices: [] });
    dummy.position.set(x, y, z);
    dummy.rotation.set(...rotation);
    dummy.scale.set(...scale);
    dummy.updateMatrix();
    batches.get(key).matrices.push(dummy.matrix.clone());
  }
  function mesh(geometry, surface, x, y, z, parent = scene) {
    const item = new T.Mesh(geometry, surface);
    item.position.set(x, y, z);
    parent.add(item);
    return item;
  }
  function ring(x, y, z, radius, surface = glow, tilt = -Math.PI / 2) {
    instance(ringGeo, surface, x, y, z, [radius, radius, radius], [tilt, 0, 0]);
  }
  function beam(surface, from, to, width = .08) {
    const a = new T.Vector3(...from), b = new T.Vector3(...to);
    dummy.position.copy(a).add(b).multiplyScalar(.5);
    dummy.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    dummy.scale.set(width, a.distanceTo(b), width);
    dummy.updateMatrix();
    const key = `${pillar.id}:${surface.id}`;
    if (!batches.has(key)) batches.set(key, { geometry: pillar, surface, matrices: [] });
    batches.get(key).matrices.push(dummy.matrix.clone());
  }

  const haloMaterial = new T.ShaderMaterial({
    uniforms: { tint: { value: new T.Color(options.color || world.color) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec2 vUv; uniform vec3 tint; void main(){ float d=length(vUv-.5)*2.; float a=pow(max(0.,1.-d),2.)*.26; gl_FragColor=vec4(tint,a); }',
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
  });
  materials.add(haloMaterial);
  const haloGeo = geo('halo', () => new T.PlaneGeometry(1, 1));

  // Floating arena: faceted islands, luminous seams and inset runic battle floors.
  for (const x of [-4.35, 4.35]) {
    instance(hex, stone, x, -.55, 1, [3.22, .62, 3.22]);
    instance(hex, glow, x, -.24, 1, [3.26, .045, 3.26]);
    instance(hex, dark, x, -.13, 1, [3.1, .17, 3.1]);
    instance(hex, face, x, -.035, 1, [2.91, .055, 2.91]);
    instance(hex, dark, x, .005, 1, [2.32, .04, 2.32]);
    instance(spire, stone, x, -1.72, 1, [3, 2.25, 3], [0, .18, Math.PI]);
    instance(spire, dark, x + .25, -2.75, .8, [1.1, 1.65, 1.1], [0, .3, Math.PI]);
    ring(x, .045, 1, 2.29, accent);
    ring(x, .045, 1, 1.73, glow);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const px = x + Math.cos(a) * 2.71, pz = 1 + Math.sin(a) * 2.71;
      instance(box, glow, px, .017, pz, [.36, .022, .075], [0, -a, 0]);
      instance(rock, stone, x + Math.cos(a) * 2.15, -1.05 - i % 2 * .3, 1 + Math.sin(a) * 2.15, [.65, .7, .7], [0, a, .2]);
    }
    const halo = mesh(haloGeo, haloMaterial, x, -3.4, 1);
    halo.rotation.x = -Math.PI / 2;
    halo.scale.set(12, 12, 1);
  }
  // Center bridge and foreground markers give the stage a legible physical scale.
  for (let i = 0; i < 5; i++) {
    instance(box, dark, (i - 2) * .57, -.38, .1, [.48, .21, 1.05]);
    instance(box, glow, (i - 2) * .57, -.266, .1, [.13, .012, .65]);
  }
  for (const x of [-8, 8]) {
    instance(hex, dark, x, -1.75, 4.2, [1.15, .8, 1.15]);
    instance(spire, stone, x, -2.6, 4.2, [1.12, 1.35, 1.12], [0, 0, Math.PI]);
    instance(hex, glow, x, -1.32, 4.2, [1.12, .035, 1.12]);
    instance(crystal, glow, x, -.38, 4.2, [.34, .84, .34], [0, .3, .1]);
  }

  // An architectural dimensional gate: segmented stone ribs, inner light tracks,
  // a softly animated energy surface and illuminated plinths.
  const portal = new T.Group();
  portal.position.set(0, 3.15, -7.5);
  scene.add(portal);
  const gateGeometry = geo('gate', () => new T.TorusGeometry(3.55, .21, 6, 48));
  mesh(gateGeometry, stone, 0, 0, 0, portal);
  const outerOrbit = mesh(ringGeo, accent, 0, 0, -.045, portal);
  outerOrbit.scale.setScalar(4.05);
  const innerOrbit = mesh(ringGeo, glow, 0, 0, .24, portal);
  innerOrbit.scale.setScalar(3.33);
  ring(0, 3.15, -7.21, 3.57, glow, 0);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    instance(box, metal, Math.cos(a) * 3.61, 3.15 + Math.sin(a) * 3.61, -7.42, [.3, .65, .46], [0, 0, a - Math.PI / 2]);
    instance(box, i % 3 === 0 ? pale : glow, Math.cos(a) * 3.63, 3.15 + Math.sin(a) * 3.63, -7.17, [.065, .39, .022], [0, 0, a - Math.PI / 2]);
  }
  for (const x of [-4.7, 4.7]) {
    instance(hex, stone, x, -.5, -7.4, [1.15, .7, 1.15]);
    instance(box, stone, x, 1.45, -7.6, [.7, 3.4, .85], [0, 0, -Math.sign(x) * .15]);
    instance(box, glow, x + Math.sign(x) * .1, 1.52, -7.12, [.075, 2.55, .06], [0, 0, -Math.sign(x) * .15]);
    instance(crystal, accent, x - Math.sign(x) * .22, 3.65, -7.5, [.35, .73, .35]);
  }
  const portalMaterial = new T.ShaderMaterial({
    uniforms: { time: { value: 0 }, tint: { value: new T.Color(options.color || world.color) }, accent: { value: new T.Color(world.accent) } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform float time; uniform vec3 tint; uniform vec3 accent;
      void main(){
        vec2 p=(vUv-.5)*2.; float r=length(p); float a=atan(p.y,p.x);
        float edge=pow(r,5.)*.36;
        float spiral=pow(max(0.,sin(r*20.-time*.6+a*2.)),14.)*.14;
        float core=pow(max(0.,1.-r),3.)*.14;
        float lane=pow(max(0.,sin(a*6.+r*9.-time*.22)),20.)*.055;
        vec3 c=mix(tint,accent,sin(a+r*3.-time*.1)*.5+.5);
        gl_FragColor=vec4(c,(edge+spiral+core+lane)*(1.-smoothstep(.92,1.,r)));
      }`,
    transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
  });
  materials.add(portalMaterial);
  mesh(geo('portal-disc', () => new T.CircleGeometry(3.3, eco ? 48 : 72)), portalMaterial, 0, 0, .08, portal);
  const portalHalo = mesh(haloGeo, haloMaterial, 0, 3.15, -7.8);
  portalHalo.scale.set(15, 15, 1);

  const floaters = [];
  function floatingCrystal(x, y, z, scale, index) {
    const group = new T.Group();
    group.position.set(x, y, z);
    scene.add(group);
    const shell = mesh(crystal, index % 3 ? foliage : glow, 0, 0, 0, group);
    shell.scale.set(scale * .55, scale * 1.75, scale * .55);
    shell.rotation.z = .12;
    if (index % 3) {
      const light = mesh(crystal, glow, scale * .07, scale * .05, scale * .33, group);
      light.scale.set(scale * .1, scale * 1.5, scale * .08);
      light.rotation.z = .12;
    }
    floaters.push({ group, y, phase: index });
  }

  if (worldId === 'nebula') {
    // Crystalline garden islands grow larger toward the viewer.
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (6.4 + i % 3 * 2.5);
      const z = -4.5 - Math.floor(i / 2) * 2.9;
      const y = -.8 + Math.sin(i * 1.7) * 1.3;
      const size = .8 + (i % 3) * .28;
      instance(rock, stone, x, y - .7, z, [size * 1.8, size * .8, size * 1.4], [0, i, 0]);
      instance(spire, dark, x, y - 1.55, z, [size * 1.45, size * 2.2, size * 1.2], [0, i, Math.PI]);
      instance(hex, foliage, x, y - .09, z, [size * 1.35, .14, size * 1.08]);
      if (i < (eco ? 4 : 6)) floatingCrystal(x, y + 1.8, z, size, i);
      else instance(crystal, i % 3 ? foliage : glow, x, y + 1.45, z, [size * .55, size * 1.8, size * .55], [0, i, .12]);
      for (let j = 0; j < 3; j++) {
        const a = j * 2.1 + i;
        instance(crystal, j === 0 ? accent : foliage, x + Math.cos(a) * size, y + .4, z + Math.sin(a) * size, [.18, .52, .18], [0, a, .23]);
      }
    }
    const planet = mesh(geo('planet', () => new T.IcosahedronGeometry(2.6, 2)), material('#6a498b'), -10.5, 8.8, -22);
    planet.rotation.z = .4;
    instance(geo('planet-ring', () => new T.TorusGeometry(3.8, .1, 5, 72)), accent, -10.5, 8.8, -22, [1, 1, 1], [1.08, .18, -.4]);
    ring(-10.5, 8.8, -22, 4.15, glow, 1.08);
    floaters.push({ group: planet, y: 8.8, phase: 3, amplitude: .06 });
  } else if (worldId === 'coast') {
    // A calm stylised ocean, stepped limestone outcrops, palms and tidal beacons.
    const water = mesh(geo('water', () => new T.CircleGeometry(42, 48)), material('#083645'), 0, -3.55, -6);
    water.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (7.5 + i % 3 * 2.2);
      const z = -3 - Math.floor(i / 2) * 3.5;
      const size = 1.1 + i % 3 * .4;
      instance(rock, stone, x, -2.35, z, [size * 1.8, 1.4, size * 1.5], [0, i, 0]);
      instance(hex, face, x, -1.4, z, [size * 1.45, .23, size * 1.1], [0, i, 0]);
      instance(hex, foliage, x, -1.25, z, [size * 1.22, .12, size * .92], [0, i, 0]);
      ring(x, -3.49, z, size * 2.05, glow);
      if (i % 3 !== 2) {
        const lean = side * .4;
        beam(metal, [x, -1.2, z], [x + lean * .35, .6, z], .12);
        beam(metal, [x + lean * .35, .6, z], [x + lean, 2.2, z], .09);
        for (let leaf = 0; leaf < 6; leaf++) {
          const angle = leaf * Math.PI / 3;
          instance(shard, foliage, x + lean + Math.cos(angle) * .6, 2.25, z + Math.sin(angle) * .6, [.48, 2, .12], [.2, angle, 1.25]);
          instance(rock, metal, x + lean + Math.cos(angle) * .12, 1.99, z + Math.sin(angle) * .12, [.14, .18, .14]);
        }
      } else {
        instance(hex, metal, x, .6, z, [.48, 3.4, .48]);
        instance(hex, glow, x, 2.33, z, [.52, .13, .52]);
        instance(spire, stone, x, 2.7, z, [.82, .6, .82]);
      }
    }
    const sunset = mesh(geo('sun', () => new T.IcosahedronGeometry(2.4, 2)), accent, -10, 7.1, -25);
    const sunlight = mesh(haloGeo, haloMaterial, -10, 7.1, -25.3);
    sunlight.scale.set(17, 17, 1);
    sunset.rotation.z = .2;
    for (let i = 0; i < 10; i++) {
      instance(box, glow, Math.sin(i * 9.1) * 19, -3.52, -4 - i * 2.7, [1 + i % 3 * 1.5, .015, .035]);
      instance(rock, dark, Math.sin(i * 3.3) * 24, -1.8, -24 - i % 3 * 2, [3 + i % 3, 2 + i % 2 * 2, 3]);
    }
  } else {
    // A layered neon megastructure with aerial transit rails and rooftop hardware.
    const ground = mesh(geo('cyber-ground', () => new T.CircleGeometry(40, 40)), dark, 0, -3.6, -7);
    ground.rotation.x = -Math.PI / 2;
    const grid = new T.GridHelper(60, eco ? 30 : 40, world.color, world.color);
    grid.position.y = -3.56;
    grid.material.transparent = true;
    grid.material.opacity = .1;
    geometries.add(grid.geometry);
    materials.add(grid.material);
    scene.add(grid);
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (7.5 + (i % 4) * 2.1);
      const z = -4 - Math.floor(i / 2) * 2.2;
      const height = 2.7 + (i * 7 % 6) * .85;
      const width = .85 + i % 3 * .32;
      instance(box, i % 2 ? stone : dark, x, height / 2 - 3.5, z, [width, height, width * 1.3]);
      instance(box, metal, x, height - 3.45, z, [width * 1.12, .13, width * 1.42]);
      instance(box, i % 3 ? glow : accent, x - side * width * .4, height / 2 - 3.5, z + width * .67, [.045, height * .88, .025]);
      instance(box, glow, x, height - 3.32, z, [width * .6, .09, width * .8]);
      if (i % 3 === 0) {
        instance(pillar, metal, x, height - 2.55, z, [.035, 1.45, .035]);
        instance(crystal, accent, x, height - 1.75, z, [.09, .17, .09]);
      }
      for (let row = 0; row < 4; row++) {
        instance(box, row % 3 ? glow : accent, x + side * .14, -2.6 + row * height / 5, z + width * .66, [width * .28, .075, .028]);
      }
    }
    for (const side of [-1, 1]) {
      beam(stone, [side * 6.1, -.85, -4], [side * 6.1, -.85, -27], .19);
      beam(glow, [side * 6.1, -.62, -4], [side * 6.1, -.62, -27], .025);
      for (let i = 0; i < 4; i++) {
        beam(stone, [side * 6.1, -3.5, -7 - i * 5], [side * 6.1, -.85, -7 - i * 5], .12);
      }
    }
    for (let i = 0; i < (eco ? 2 : 4); i++) {
      const drone = new T.Group();
      drone.position.set((i % 2 ? -1 : 1) * (7.2 + i), 4.6 + i % 2, -11 - i * 3);
      scene.add(drone);
      const body = mesh(crystal, metal, 0, 0, 0, drone);
      body.scale.set(.55, .18, .34);
      const trail = mesh(box, glow, 0, -.08, .25, drone);
      trail.scale.set(.5, .045, .06);
      floaters.push({ group: drone, y: drone.position.y, phase: i });
    }
    ring(-10, 8, -23, 2.5, accent, .12);
    ring(-10, 8, -23, 2.1, glow, .12);
  }

  for (const { geometry, surface, matrices } of batches.values()) {
    const objects = new T.InstancedMesh(geometry, surface, matrices.length);
    matrices.forEach((matrix, index) => objects.setMatrixAt(index, matrix));
    objects.instanceMatrix.needsUpdate = true;
    objects.computeBoundingSphere();
    scene.add(objects);
  }
  batches.clear();

  const particleCount = eco ? 85 : 180;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = Math.sin(i * 127.1) * 22;
    positions[i * 3 + 1] = (i * .73) % 15 - 1;
    positions[i * 3 + 2] = Math.cos(i * 311.7) * 17 - 10;
  }
  const particleGeometry = keepGeometry(new T.BufferGeometry());
  particleGeometry.setAttribute('position', new T.BufferAttribute(positions, 3));
  const particleMaterial = new T.PointsMaterial({ color: worldId === 'coast' ? world.accent : options.color || world.color, size: worldId === 'coast' ? .045 : .06, transparent: true, opacity: .7, depthWrite: false });
  materials.add(particleMaterial);
  const particles = new T.Points(particleGeometry, particleMaterial);
  scene.add(particles);
  const shock = mesh(ringGeo, accent, 0, 2.5, 3);
  shock.visible = Boolean(options.burst) && !reduced.matches;

  let frame = 0, lastRender = 0, lastFrame = 0, visible = true, stopped = false;
  let samples = 0, sampleTime = 0, elapsed = 0;
  const startedAt = performance.now();
  function draw(now) {
    if (stopped || document.hidden || !visible || renderer.getContext().isContextLost()) return;
    const delta = lastFrame ? Math.min(now - lastFrame, 100) : 0;
    lastFrame = now;
    elapsed += delta / 1000;
    // Detect sustained frame pressure after warm-up. Stay downgraded for this
    // mount to avoid resolution oscillation; an explicit High choice is respected.
    if (options.quality !== 'high' && !reduced.matches && now - startedAt > 1200 && delta > 0) {
      sampleTime += delta;
      samples++;
      if (samples >= 90) {
        const average = sampleTime / samples;
        if ((!eco && average > 24) || (eco && pixelRatio > .8 && average > 42)) {
          eco = true;
          pixelRatio = average > 42 ? .8 : Math.min(pixelRatio, 1);
          renderer.setPixelRatio(pixelRatio);
          renderer.setSize(host.clientWidth, host.clientHeight, false);
          particleGeometry.setDrawRange(0, Math.min(particleCount, 70));
          host.dataset.renderQuality = 'eco';
        }
        samples = 0;
        sampleTime = 0;
      }
    }
    if (now - lastRender >= (eco ? 1000 / 30 - .6 : 1000 / 60 - .6) || reduced.matches) {
      lastRender = now;
      const t = reduced.matches ? 0 : elapsed;
      portalMaterial.uniforms.time.value = t;
      outerOrbit.rotation.z = t * .025;
      outerOrbit.rotation.y = Math.sin(t * .24) * .045;
      particles.rotation.y = t * .012;
      floaters.forEach(({ group, y, phase, amplitude = .18 }) => {
        group.rotation.y = t * .1 + phase;
        group.position.y = y + Math.sin(t * .7 + phase) * amplitude;
      });
      shock.visible = Boolean(options.burst) && !reduced.matches && t < 2.5;
      if (shock.visible) shock.scale.setScalar(1 + t * 7);
      renderer.render(scene, camera);
    }
    if (!reduced.matches) frame = requestAnimationFrame(draw);
  }
  function resume() {
    if (stopped) return;
    cancelAnimationFrame(frame);
    lastFrame = 0;
    lastRender = 0;
    samples = 0;
    sampleTime = 0;
    frame = requestAnimationFrame(draw);
  }
  function resize() {
    if (stopped || !host.clientWidth || !host.clientHeight) return;
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    camera.aspect = host.clientWidth / host.clientHeight;
    // Pull back a little on portrait stages without flattening the scene depth.
    camera.position.z = camera.aspect < .9 ? 23 : 19.5;
    camera.lookAt(0, 1, -1);
    camera.updateProjectionMatrix();
    resume();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    resume();
  });
  intersection.observe(host);
  const lost = (event) => {
    event.preventDefault();
    host.dataset.fallback = 'true';
    cancelAnimationFrame(frame);
  };
  const restored = () => { delete host.dataset.fallback; resize(); };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  document.addEventListener('visibilitychange', resume);
  reduced.addEventListener('change', resume);
  resize();
  disposeScene = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    intersection.disconnect();
    document.removeEventListener('visibilitychange', resume);
    reduced.removeEventListener('change', resume);
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
    // InstancedMesh owns its instance buffer; dispose it in addition to shared
    // geometry/material resources so switching worlds does not accumulate GPU RAM.
    scene.traverse((object) => { if (object.isInstancedMesh) object.dispose(); });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((surface) => surface.dispose());
    scene.clear();
    renderer.renderLists.dispose();
    delete host.dataset.rendered;
    delete host.dataset.renderQuality;
    canvas.remove();
  };
}
