import * as THREE from 'three';

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function randRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Builds a floating text label (sprite) that always faces the camera.
export function makeTextLabel(text, { fontSize = 64, color = '#ffffff', bg = 'rgba(0,0,0,0.45)' } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${fontSize}px 'Malgun Gothic', sans-serif`;
  const padding = 24;
  const width = Math.ceil(ctx.measureText(text).width) + padding * 2;
  const height = fontSize + padding * 2;
  canvas.width = width;
  canvas.height = height;

  ctx.font = `bold ${fontSize}px 'Malgun Gothic', sans-serif`;
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, width, height, 16);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: true, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  const scale = 0.045;
  sprite.scale.set(width * scale, height * scale, 1);
  return sprite;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
