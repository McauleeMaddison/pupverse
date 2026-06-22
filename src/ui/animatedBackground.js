let animationFrameId = null;
let resizeHandler = null;

export function startAnimatedBackground() {
  const canvas = document.querySelector("#spaceCanvas");

  if (!canvas) return;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
  }

  const ctx = canvas.getContext("2d");

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  resizeCanvas();

  const particles = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    radius: Math.random() * 2 + 0.5,
    speed: Math.random() * 0.7 + 0.2,
  }));

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((particle) => {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.fill();

      particle.y += particle.speed;

      if (particle.y > canvas.height) {
        particle.y = 0;
        particle.x = Math.random() * canvas.width;
      }
    });

    animationFrameId = requestAnimationFrame(animate);
  }

  resizeHandler = resizeCanvas;
  window.addEventListener("resize", resizeHandler);

  animate();
}