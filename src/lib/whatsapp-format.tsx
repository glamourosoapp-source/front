import type { ReactNode } from "react";

/**
 * Render de texto con formato estilo WhatsApp para las burbujas del inbox:
 * *negritas*, _cursivas_, ~tachado~, ```monoespacio``` y `codigo`.
 * Tolera tambien **negritas** de markdown porque el agente a veces las emite.
 * Los saltos de linea los preserva el CSS (white-space: pre-wrap).
 *
 * Igual que WhatsApp, un delimitador solo aplica si pega con el contenido
 * (sin espacios interiores): "5 * 3 * 2" queda intacto.
 */
const TOKEN_RE =
  /```([\s\S]+?)```|`([^`\n]+)`|\*\*([^*\n]+?)\*\*|\*([^\s*](?:[^*\n]*?[^\s*])?)\*|_([^\s_](?:[^_\n]*?[^\s_])?)_|~([^\s~](?:[^~\n]*?[^\s~])?)~/g;

export function formatWhatsAppText(text: string): ReactNode {
  if (!text) return text;
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;

  for (const match of text.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const [, block, code, mdBold, bold, italic, strike] = match;

    if (block !== undefined || code !== undefined) {
      nodes.push(<code key={key++}>{block ?? code}</code>);
    } else if (mdBold !== undefined || bold !== undefined) {
      nodes.push(<strong key={key++}>{formatWhatsAppText(mdBold ?? bold)}</strong>);
    } else if (italic !== undefined) {
      nodes.push(<em key={key++}>{formatWhatsAppText(italic)}</em>);
    } else {
      nodes.push(<s key={key++}>{formatWhatsAppText(strike!)}</s>);
    }
    last = index + match[0].length;
  }

  if (nodes.length === 0) return text;
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
