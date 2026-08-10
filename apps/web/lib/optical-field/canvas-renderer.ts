import { sampleDiffractionWavefront, type OpticalSample, type OpticalViewport } from './field-model';

function renderDiffractionField(context: CanvasRenderingContext2D, sample: OpticalSample, mobile: boolean) {
  const { aperture } = sample;
  const intensity = 0.24 + sample.evidence * 0.56;
  const reach = mobile ? 5 : 8;
  const slitHalfHeight = mobile ? 15 : 23;
  const baffleHeight = mobile ? 72 : 112;

  context.save();
  context.globalAlpha = intensity;
  context.lineWidth = 1;

  context.strokeStyle = 'rgba(241, 238, 231, 0.5)';
  context.beginPath();
  context.moveTo(aperture.x, aperture.y - baffleHeight);
  context.lineTo(aperture.x, aperture.y - slitHalfHeight);
  context.moveTo(aperture.x, aperture.y + slitHalfHeight);
  context.lineTo(aperture.x, aperture.y + baffleHeight);
  context.stroke();

  for (let step = 0; step <= reach; step += 1) {
    const upper = sampleDiffractionWavefront(aperture, step, -1, sample.phase);
    const lower = sampleDiffractionWavefront(aperture, step, 1, sample.phase);
    const alpha = Math.max(0.05, 0.34 - step * 0.03);
    context.strokeStyle = `rgba(241, 238, 231, ${alpha})`;
    context.beginPath();
    context.moveTo(aperture.x + 2, aperture.y);
    context.quadraticCurveTo(upper.x - 12, aperture.y, upper.x, upper.y);
    context.moveTo(aperture.x + 2, aperture.y);
    context.quadraticCurveTo(lower.x - 12, aperture.y, lower.x, lower.y);
    context.stroke();
  }

  context.strokeStyle = 'rgba(241, 238, 231, 0.2)';
  for (let band = 1; band <= (mobile ? 3 : 5); band += 1) {
    const radiusX = band * (mobile ? 22 : 31);
    const radiusY = band * (mobile ? 34 : 48);
    context.beginPath();
    context.ellipse(aperture.x + 2, aperture.y, radiusX, radiusY, 0, -Math.PI / 2, Math.PI / 2);
    context.stroke();
  }

  context.fillStyle = 'rgba(241, 238, 231, 0.9)';
  context.beginPath();
  context.arc(aperture.x, aperture.y, 2.2 + sample.evidence * 1.6, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

export function renderOpticalField(
  context: CanvasRenderingContext2D,
  sample: OpticalSample,
  viewport: OpticalViewport,
) {
  const { width, height, dpr } = viewport;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const spacing = Math.round(18 / sample.density);
  context.fillStyle = 'rgba(241, 238, 231, 0.17)';

  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) {
      const dx = x - sample.origin.x;
      const dy = y - sample.origin.y;
      const distance = Math.hypot(dx, dy);
      const influence = Math.max(0, 1 - distance / sample.radius);
      const angle = Math.atan2(dy, dx) + Math.sin(sample.phase + distance * 0.025) * 0.3;
      const offset = influence * influence * sample.displacement;
      const radius = 0.65 + influence * 1.55;

      context.beginPath();
      context.arc(x + Math.cos(angle) * offset, y + Math.sin(angle) * offset, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.strokeStyle = 'rgba(241, 238, 231, 0.24)';
  context.lineWidth = 1;
  context.beginPath();
  context.arc(sample.origin.x, sample.origin.y, sample.radius * 0.2, 0, Math.PI * 2);
  context.stroke();

  if (sample.evidence > 0.01) {
    context.globalAlpha = sample.evidence;
    context.strokeStyle = 'rgba(241, 238, 231, 0.72)';
    const width = sample.radius * 0.84;
    for (let row = -2; row <= 2; row += 1) {
      const y = sample.origin.y + row * 12;
      context.beginPath();
      context.moveTo(sample.origin.x - width / 2, y);
      context.lineTo(sample.origin.x + width * (0.14 + (row + 2) * 0.08), y);
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  renderDiffractionField(context, sample, width < 640);
}
