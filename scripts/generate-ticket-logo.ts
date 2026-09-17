/**
 * Logo del ticket impreso.
 *
 * La impresora térmica no entiende SVG ni color: imprime un mapa de bits de un
 * solo bit. Este script saca del logotipo de marca
 * (`public/branding/glamouroso-logo-azul-sobre-blanco.svg`) un PNG en **negro
 * sobre blanco** al ancho del cabezal, que es lo que se rasteriza en la caja.
 *
 * Por qué un PNG aparte y no el SVG de marca:
 *
 * 1. El SVG no declara `width`/`height`, solo `viewBox`. Al dibujarlo en un
 *    canvas el navegador no siempre le da tamaño intrínseco y el logo salía
 *    vacío o deformado.
 * 2. El azul de marca se convierte a negro igual al binarizar, pero partiendo de
 *    negro el contorno queda más limpio y no depende del umbral.
 *
 * Se corre a mano cuando cambia el logotipo: `bun run logo:ticket`.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_SVG = path.join(ROOT, "public/branding/glamouroso-logo-azul-sobre-blanco.svg");
const OUTPUT = path.join(ROOT, "public/branding/glamouroso-logo-ticket.png");

/** Puntos de ancho del cabezal de 80 mm a 203 dpi; el de 58 mm reescala. */
const WIDTH = 576;

async function main() {
  const svg = await readFile(SOURCE_SVG, "utf8");

  // El logotipo viene en el azul de marca; para el ticket va en negro.
  const black = svg.replace(/fill="rgb\([^)]*\)"/g, 'fill="#000000"').replace(/#22b6eb/gi, "#000000");

  const png = await sharp(Buffer.from(black), { density: 600 })
    .resize({ width: WIDTH, fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .greyscale()
    .png({ compressionLevel: 9 })
    .toBuffer();

  await writeFile(OUTPUT, png);
  const { width, height } = await sharp(png).metadata();
  console.log(`Logo del ticket: ${path.relative(ROOT, OUTPUT)} (${width}x${height})`);
}

await main();
