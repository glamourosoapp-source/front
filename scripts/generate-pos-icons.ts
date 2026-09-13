/**
 * Iconos de la app del punto de venta.
 *
 * Genera los PNG del manifiesto y el `.ico` del acceso directo de Windows a
 * partir de la **G de Glamouroso** (`src/app/icon.svg`), que es la única fuente
 * del trazo: así el icono del escritorio, el de la ventana de la caja y el de
 * la pestaña no se separan nunca.
 *
 * Se corre a mano cuando cambia el logo, y los PNG quedan versionados:
 * `bun run icons:pos`.
 *
 * Por qué PNG y no el SVG que ya existía: Chrome **no** instala una PWA cuyo
 * manifiesto solo trae SVG, y el `sizes` declarado tiene que coincidir con el
 * real. El manifiesto anterior apuntaba a un SVG y a `don-glamouroso.png`
 * declarado 512×512 cuando mide 90×150, así que Chrome nunca ofrecía instalar y
 * el escritorio no podía tener el logo.
 *
 * El maskable va a sangre con la G al 62% (la zona segura de Android/Windows
 * recorta hasta un 20% de cada lado); el normal lleva el cuadrado redondeado.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE_SVG = path.join(ROOT, "src/app/icon.svg");
const OUT_DIR = path.join(ROOT, "public/icons");
/** Copia para el instalador del agente, que crea el acceso directo. */
const AGENT_ICO = path.resolve(ROOT, "../PrintAgent/installer/glamouroso-pos.ico");

const NAVY = "#262d60";
const WHITE = "#ffffff";

/** Tamaños del `.ico`: los que pide el shell de Windows (escritorio, barra, alt-tab). */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

interface Glyph {
  viewBox: string;
  d: string;
}

/** La G, leída del icono de la pestaña para no duplicar el trazo. */
async function readGlyph(): Promise<Glyph> {
  const svg = await readFile(SOURCE_SVG, "utf8");
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1];
  const d = /\sd="([^"]+)"/.exec(svg)?.[1];
  if (!viewBox || !d) throw new Error(`No pude leer viewBox y path de ${SOURCE_SVG}`);
  return { viewBox, d };
}

/**
 * Un icono cuadrado: fondo navy y la G en blanco.
 *
 * La G se anida en un `<svg>` propio con su viewBox, así se centra y escala sin
 * recalcular coordenadas a mano. `ratio` es cuánto del lienzo ocupa.
 */
function iconSvg(glyph: Glyph, size: number, { ratio, radius }: { ratio: number; radius: number }) {
  const inner = Math.round(size * ratio);
  const offset = Math.round((size - inner) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${NAVY}"/>
  <svg x="${offset}" y="${offset}" width="${inner}" height="${inner}" viewBox="${glyph.viewBox}" preserveAspectRatio="xMidYMid meet">
    <path fill-rule="nonzero" fill="${WHITE}" d="${glyph.d}"/>
  </svg>
</svg>`;
}

/**
 * Rasteriza a `size` exacto.
 *
 * Se dibuja primero en grande (`density` sube los DPI del SVG, que trae ancho
 * en px) y se reduce con Lanczos: el trazo de la G sale limpio a 16 px, donde
 * rasterizar directo lo deja dentado. El `resize` NO es opcional —sin él sharp
 * devuelve el lienzo escalado por los DPI, y un `.ico` cuyo directorio dice
 * 16×16 con un PNG de 85×85 dentro se rompe en el shell de Windows.
 */
async function png(glyph: Glyph, size: number, opts: { ratio: number; radius: number }) {
  return sharp(Buffer.from(iconSvg(glyph, size, opts)), { density: 384 })
    .resize(size, size, { fit: "cover", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Contenedor ICO con PNG dentro (soportado por Windows desde Vista, y estas son
 * PC con Windows 10/11). Se arma a mano para no meter una dependencia por un
 * archivo que se genera una vez al año.
 */
function buildIco(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reservado
  header.writeUInt16LE(1, 2); // 1 = icono
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach((image, index) => {
    const entry = index * 16;
    // 256 se codifica como 0: el campo es de un byte.
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry);
    directory.writeUInt8(image.size >= 256 ? 0 : image.size, entry + 1);
    directory.writeUInt8(0, entry + 2); // paleta: ninguna
    directory.writeUInt8(0, entry + 3); // reservado
    directory.writeUInt16LE(1, entry + 4); // planos
    directory.writeUInt16LE(32, entry + 6); // bits por pixel
    directory.writeUInt32LE(image.data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += image.data.length;
  });

  return Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

async function main() {
  const glyph = await readGlyph();
  await mkdir(OUT_DIR, { recursive: true });

  const rounded = (size: number) => ({ ratio: 0.72, radius: Math.round(size * 0.2) });
  const maskable = () => ({ ratio: 0.62, radius: 0 });

  const files: { name: string; data: Buffer }[] = [
    { name: "pos-192.png", data: await png(glyph, 192, rounded(192)) },
    { name: "pos-512.png", data: await png(glyph, 512, rounded(512)) },
    { name: "pos-maskable-192.png", data: await png(glyph, 192, maskable()) },
    { name: "pos-maskable-512.png", data: await png(glyph, 512, maskable()) },
  ];

  for (const file of files) {
    await writeFile(path.join(OUT_DIR, file.name), file.data);
    console.log(`  ${file.name} · ${(file.data.length / 1024).toFixed(1)} kB`);
  }

  /*
   * Icono de pantalla de inicio de iOS (por si la caja o fábrica se abren en un
   * iPad): va como `app/apple-icon.png`, la convención de archivo de Next.
   * Declararlo en `metadata.icons` no sirve — con `app/icon.svg` presente, Next
   * ignora ese campo. Safari no respeta transparencia ni maskable: cuadrado
   * lleno y sin redondeo, que iOS ya lo redondea.
   */
  const apple = await png(glyph, 180, { ratio: 0.68, radius: 0 });
  await writeFile(path.join(ROOT, "src/app/apple-icon.png"), apple);
  console.log(`  src/app/apple-icon.png · ${(apple.length / 1024).toFixed(1)} kB`);

  const ico = buildIco(
    await Promise.all(
      ICO_SIZES.map(async (size) => ({ size, data: await png(glyph, size, rounded(size)) }))
    )
  );
  await writeFile(path.join(OUT_DIR, "glamouroso-pos.ico"), ico);
  await writeFile(AGENT_ICO, ico);
  console.log(`  glamouroso-pos.ico · ${(ico.length / 1024).toFixed(1)} kB (${ICO_SIZES.join(", ")} px)`);
  console.log(`  copiado a ${path.relative(path.resolve(ROOT, ".."), AGENT_ICO)}`);
}

await main();
