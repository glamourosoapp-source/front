/**
 * Captura de un nodo del DOM como PNG, sin dependencias externas: el nodo se
 * serializa a XHTML dentro de un <foreignObject> de un SVG, el navegador lo
 * pinta en un <canvas> y de ahí sale el blob.
 *
 * Sirve para la nota de remisión porque su marcado usa SOLO estilos inline
 * (ver OrderPrintSheet): al clonarlo no se pierde ninguna regla de hoja de
 * estilos. Si algún día la nota usa clases de CSS, hay que inlinear los
 * estilos calculados antes de serializar o la imagen saldrá sin formato.
 */
export async function nodeToPngBlob(
  node: HTMLElement,
  options: { scale?: number; background?: string } = {}
): Promise<Blob> {
  const scale = options.scale ?? 2;
  const background = options.background ?? "#ffffff";
  // offsetWidth/Height y no getBoundingClientRect: el contenedor de la vista
  // previa puede venir con un transform de escala y el rect ya lo trae aplicado.
  const width = node.offsetWidth;
  const height = node.offsetHeight;
  if (!width || !height) throw new Error("El contenido no está visible.");

  const clone = node.cloneNode(true) as HTMLElement;
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.margin = "0";
  clone.style.transform = "none";

  // XMLSerializer ya emite el xmlns XHTML de los nodos HTML y devuelve XML
  // bien formado, que es lo que exige <foreignObject>.
  const serialized = new XMLSerializer().serializeToString(clone);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="100%" height="100%">` +
    `${serialized}</foreignObject></svg>`;

  const image = new Image();
  // data URL y no blob URL: Safari marca el canvas como "tainted" al dibujar un
  // SVG cargado desde blob y toBlob revienta.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("No se pudo renderizar la imagen."));
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("El navegador no soporta canvas.");
  context.scale(scale, scale);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("No se pudo generar la imagen."));
    }, "image/png");
  });
}

/** Descarga un blob con el nombre dado (mismo truco que usan las exportaciones). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // El revoke inmediato corta la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
