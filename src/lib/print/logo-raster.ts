"use client";

/**
 * Logo del ticket para la impresora térmica.
 *
 * El logo se configura como URL en el panel, pero una térmica no entiende PNG:
 * hay que mandarle un mapa de bits en blanco y negro (`GS v 0`). Esto lo arma en
 * el navegador con un canvas y lo deja listo para `buildTicketEscPos`.
 *
 * Nunca lanza: si la imagen no carga, tarda demasiado o el servidor no manda
 * CORS (el canvas queda "tainted" y `getImageData` tira), devuelve `null` y el
 * ticket sale sin logo en vez de no salir.
 */

const GS = 0x1d;
const TIMEOUT_MS = 5000;
/** Puntos de ancho del cabezal (203 dpi): 80 mm imprime 576, 58 mm imprime 384. */
const MAX_DOTS: Record<number, number> = { 58: 384, 80: 576 };
/** Tope de alto: un logo más grande se come el papel de cada ticket. */
const MAX_HEIGHT_DOTS = 240;
/** Luminancia a partir de la cual el píxel se considera blanco. */
const THRESHOLD = 160;

const cache = new Map<string, Uint8Array | null>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const timer = setTimeout(() => reject(new Error("La imagen del logo tardó demasiado")), TIMEOUT_MS);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error("No se pudo cargar la imagen del logo"));
    };
    image.src = url;
  });
}

/**
 * Convierte el logo en comandos ESC/POS, centrado al ancho del papel.
 * El resultado se memoriza por URL y ancho: el ticket se imprime en cada venta.
 */
export async function rasterizeLogo(
  url: string | null,
  paperWidthMm: number
): Promise<Uint8Array | null> {
  if (!url || typeof window === "undefined") return null;
  const key = `${paperWidthMm}|${url}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let result: Uint8Array | null = null;
  try {
    const image = await loadImage(url);
    const maxDots = MAX_DOTS[paperWidthMm] ?? MAX_DOTS[80];
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    if (naturalWidth > 0 && naturalHeight > 0) {
      // El ancho se redondea a múltiplo de 8: cada byte del raster son 8 puntos.
      const scale = Math.min(maxDots / naturalWidth, MAX_HEIGHT_DOTS / naturalHeight, 1);
      const width = Math.max(8, Math.floor((naturalWidth * scale) / 8) * 8);
      const height = Math.max(1, Math.round(naturalHeight * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context) {
        // Fondo blanco: un PNG con transparencia se vería como manchas negras.
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        result = packRaster(context.getImageData(0, 0, width, height), width, height);
      }
    }
  } catch {
    result = null;
  }

  cache.set(key, result);
  return result;
}

/** Empaqueta el canvas en `GS v 0`: 1 bit por punto, 8 puntos por byte. */
function packRaster(imageData: ImageData, width: number, height: number): Uint8Array {
  const bytesPerRow = width / 8;
  const raster = new Uint8Array(bytesPerRow * height);
  const { data } = imageData;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = (y * width + x) * 4;
      const alpha = data[pixel + 3];
      const luminance = 0.299 * data[pixel] + 0.587 * data[pixel + 1] + 0.114 * data[pixel + 2];
      const isBlack = alpha >= 128 && luminance < THRESHOLD;
      if (isBlack) raster[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }

  const header = [GS, 0x76, 0x30, 0x00, bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff];
  const bytes = new Uint8Array(header.length + raster.length + 1);
  bytes.set(header, 0);
  bytes.set(raster, header.length);
  bytes[bytes.length - 1] = 0x0a;
  return bytes;
}
