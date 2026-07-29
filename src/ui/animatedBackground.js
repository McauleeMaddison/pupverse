let animationFrameId = null;
let resizeHandler = null;
let motionHandler = null;
let visibilityHandler = null;

export function startAnimatedBackground() {
  const canvas = document.querySelector("#spaceCanvas");

  if (!canvas) return;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
  }

  if (motionHandler) {
    window.matchMedia("(prefers-reduced-motion: reduce)").removeEventListener("change", motionHandler);
  }

  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
  }

  const ctx = canvas.getContext("2d", { alpha: true });
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const reducedMotion = motionQuery.matches;
  const lowPowerDevice = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
    || (navigator.deviceMemory && navigator.deviceMemory <= 4);
  const particleCount = reducedMotion ? 24 : lowPowerDevice ? 38 : coarsePointer ? 58 : 82;
  const frameInterval = lowPowerDevice || coarsePointer ? 1000 / 30 : 1000 / 45;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let lastFrame = performance.now();
  let nebula = null;

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    nebula = ctx.createRadialGradient(width * 0.72, height * 0.18, 0, width * 0.72, height * 0.18, width * 0.55);
    nebula.addColorStop(0, "rgba(103, 244, 231, 0.09)");
    nebula.addColorStop(0.46, "rgba(156, 114, 255, 0.045)");
    nebula.addColorStop(1, "rgba(0, 0, 0, 0)");
  }

  resizeCanvas();

  function createParticle(y = Math.random() * height) {
    const depth = Math.random();

    return {
      x: Math.random() * width,
      y,
      depth,
      radius: 0.55 + depth * 1.9,
      drift: (Math.random() - 0.5) * (0.12 + depth * 0.2),
      speed: 0.16 + depth * 0.56,
      hue: Math.random() > 0.66 ? 318 : Math.random() > 0.42 ? 184 : 216,
      twinkle: Math.random() * Math.PI * 2,
    };
  }

  const particles = Array.from({ length: particleCount }, () => createParticle());

  function drawNebula() {
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, width, height);
  }

  function animate(now = performance.now()) {
    if (document.hidden) return;
    if (!reducedMotion && now - lastFrame < frameInterval) {
      animationFrameId = requestAnimationFrame(animate);
      return;
    }
    const delta = Math.min(32, now - lastFrame) / 16.67;
    lastFrame = now;

    ctx.clearRect(0, 0, width, height);
    drawNebula();
    ctx.globalCompositeOperation = "lighter";

    particles.forEach((particle) => {
      const twinkle = 0.42 + Math.sin(now * 0.0018 + particle.twinkle) * 0.26 + particle.depth * 0.28;

      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${particle.hue}, 100%, ${78 + particle.depth * 12}%, ${twinkle})`;
      ctx.fill();

      if (!reducedMotion) {
        particle.y += particle.speed * delta;
        particle.x += particle.drift * delta;
      }

      if (particle.y > height + 8 || particle.x < -8 || particle.x > width + 8) {
        Object.assign(particle, createParticle(-8));
      }
    });

    ctx.globalCompositeOperation = "source-over";

    if (!reducedMotion) {
      animationFrameId = requestAnimationFrame(animate);
    }
  }

  resizeHandler = resizeCanvas;
  motionHandler = () => startAnimatedBackground();
  visibilityHandler = () => {
    if (!document.hidden) {
      lastFrame = performance.now();
      animationFrameId = requestAnimationFrame(animate);
    }
  };
  window.addEventListener("resize", resizeHandler);
  motionQuery.addEventListener("change", motionHandler);
  document.addEventListener("visibilitychange", visibilityHandler);

  animate();
}
