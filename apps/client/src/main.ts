import { POOL_9FT } from "@tacazo/core";
import { COLORES } from "./marca.js";

// Dibujo provisional de la mesa a partir de sus datos. PixiJS llega con #15.
const canvas = document.querySelector<HTMLCanvasElement>("#mesa");
const g = canvas?.getContext("2d");
if (canvas && g) {
  const k = canvas.width / POOL_9FT.width;
  g.fillStyle = COLORES.pano;
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = COLORES.noche;
  for (const p of POOL_9FT.pockets) {
    g.beginPath();
    g.arc(p.center.x * k, canvas.height - p.center.y * k, p.radius * k, 0, Math.PI * 2);
    g.fill();
  }
}
