/**
 * Propiedades que se copian de los estilos calculados al clon. El clon se pinta
 * dentro de un SVG, sin las hojas de estilo de la app, así que hay que llevarle
 * todo lo que decide la maqueta: sin esto `box-sizing` volvía a `content-box`
 * (la hoja de 816px se rearmaba como 816 + 48 de padding y la imagen salía
 * cortada esos 48px de la derecha) y el reparto de columnas de la tabla cambiaba
 * respecto a lo que se ve e imprime.
 *
 * `width` es clave: el valor calculado es el ancho YA resuelto por el navegador,
 * así que fija el reparto de columnas exacto de la nota. Las alturas NO se
 * copian a propósito: si el texto se acomodara distinto, una altura fija lo
 * recortaría; libres, la caja crece.
 */
const COPIED_PROPERTIES = [
  "box-sizing",
  "display",
  "width",
  "min-width",
  "max-width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-collapse",
  "border-spacing",
  "table-layout",
  "vertical-align",
  "color",
  "background-color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-align",
  "text-transform",
  "text-decoration",
  "white-space",
  "overflow-wrap",
];

/** Copia los estilos calculados de cada nodo del original al nodo equivalente del clon. */
function inlineComputedStyles(source: HTMLElement, clone: HTMLElement) {
  const sourceNodes: Element[] = [source, ...source.querySelectorAll("*")];
  const cloneNodes: Element[] = [clone, ...clone.querySelectorAll("*")];
  for (let i = 0; i < sourceNodes.length; i += 1) {
    const target = cloneNodes[i] as HTMLElement | undefined;
    if (!target?.style) continue;
    const computed = getComputedStyle(sourceNodes[i]);
    for (const property of COPIED_PROPERTIES) {
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, value);
    }
  }
}

/**
 * Captura de un nodo del DOM como PNG, sin dependencias externas: el nodo se
 * serializa a XHTML dentro de un <foreignObject> de un SVG, el navegador lo
 * pinta en un <canvas> y de ahí sale el blob.
 *
 * Lo que se captura son los estilos YA calculados del nodo vivo, así que la
 * imagen sale igual a lo que se ve en pantalla (y a lo que se imprime). No se
 * copian imágenes de fondo ni recursos externos: la nota de remisión no usa.
 */
export async function nodeToPngBlob(
  node: HTMLElement,
  options: { scale?: number; background?: string } = {}
): Promise<Blob> {
  const scale = options.scale ?? 2;
  const background = options.background ?? "#ffffff";
  // offsetWidth/Height y no getBoundingClientRect: el contenedor de la vista
  // previa puede venir con un transform de escala y el rect ya lo trae aplicado.
  // scrollWidth/Height como red de seguridad: si algo se sale de la caja, el
  // lienzo crece en vez de recortarlo.
  const width = Math.ceil(Math.max(node.offsetWidth, node.scrollWidth));
  const height = Math.ceil(Math.max(node.offsetHeight, node.scrollHeight));
  if (!width || !height) throw new Error("El contenido no está visible.");

  const clone = node.cloneNode(true) as HTMLElement;
  inlineComputedStyles(node, clone);
  clone.style.width = `${width}px`;
  clone.style.margin = "0";
  clone.style.transform = "none";

  const wrapper = document.createElement("div");
  wrapper.style.background = background;
  wrapper.appendChild(clone);

  // Se serializa un wrapper armado por DOM y no un string a mano: XMLSerializer
  // escapa los valores (p. ej. las comillas de font-family) y devuelve el XML
  // bien formado que exige <foreignObject>; concatenando a mano, una comilla
  // rompe el SVG entero y la imagen no se genera.
  const serialized = new XMLSerializer().serializeToString(wrapper);
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
