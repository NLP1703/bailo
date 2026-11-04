// Rendu lisible du corps HTML d'un contrat (le même HTML qui part au PDF côté serveur).
// Le téléphone n'embarque pas de moteur HTML (pas de WebView) : on réduit le sous-ensemble
// de balises que le modèle standard produit (h1/h2/h3, p, strong/b, em/i, br, p.sign) à des
// blocs typés que React Native sait afficher. Les balises inconnues sont ignorées, leur texte
// conservé. Fonction pure, sans dépendance React Native, pour rester testable.

export interface ContractSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type ContractBlockKind = 'h1' | 'h2' | 'h3' | 'p' | 'sign';

export interface ContractBlock {
  kind: ContractBlockKind;
  spans: ContractSpan[];
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

/** Retire les balises résiduelles d'un fragment déjà vidé de ses balises inline connues. */
function stripTags(fragment: string): string {
  return fragment.replace(/<[^>]*>/g, '');
}

// Sentinelle de saut de ligne : survit à la réduction des espaces, restaurée en « \n » à la fin.
const BR = '\u0000';

/** Découpe le contenu d'un bloc en segments gras/italiques, en gardant les espaces internes. */
function parseSpans(inner: string): ContractSpan[] {
  const normalized = inner.replace(/<br\s*\/?>/gi, BR);
  const spans: ContractSpan[] = [];
  const tagRe = /<(\/?)(strong|b|em|i)\s*>/gi;
  let bold = 0;
  let italic = 0;
  let last = 0;
  let m: RegExpExecArray | null;

  const push = (raw: string) => {
    // On réduit les suites d'espaces (indentation, retours ligne du gabarit) à une espace,
    // sans rogner les bords : l'espace entre un mot gras et le suivant doit survivre. Les
    // sauts de ligne voulus (<br>) ont été mis de côté et sont rétablis après la réduction.
    const text = decodeEntities(stripTags(raw).replace(/[ \t\r\n]+/g, ' ')).split(BR).join('\n');
    if (text.length === 0) return;
    spans.push({
      text,
      ...(bold > 0 ? { bold: true } : {}),
      ...(italic > 0 ? { italic: true } : {}),
    });
  };

  while ((m = tagRe.exec(normalized)) !== null) {
    push(normalized.slice(last, m.index));
    const closing = m[1] === '/';
    const tag = (m[2] ?? '').toLowerCase();
    if (tag === 'strong' || tag === 'b') bold = Math.max(0, bold + (closing ? -1 : 1));
    else italic = Math.max(0, italic + (closing ? -1 : 1));
    last = tagRe.lastIndex;
  }
  push(normalized.slice(last));

  // Rogne l'espace de tête/queue du bloc (laissé par l'indentation du gabarit).
  const first = spans[0];
  if (first) first.text = first.text.replace(/^ /, '');
  const lastSpan = spans[spans.length - 1];
  if (lastSpan) lastSpan.text = lastSpan.text.replace(/ $/, '');
  return spans.filter((sp) => sp.text.length > 0);
}

/**
 * Transforme le corps HTML d'un contrat en une suite de blocs affichables.
 * Ne reconnaît que les blocs h1/h2/h3 et p (p.sign = mention de signature en pied).
 */
export function parseContractBody(html: string): ContractBlock[] {
  const blocks: ContractBlock[] = [];
  const blockRe = /<(h1|h2|h3|p)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html)) !== null) {
    const tag = (m[1] ?? 'p').toLowerCase() as 'h1' | 'h2' | 'h3' | 'p';
    const attrs = m[2] ?? '';
    const spans = parseSpans(m[3] ?? '');
    if (spans.length === 0) continue;
    const isSign = tag === 'p' && /class\s*=\s*["'][^"']*\bsign\b/i.test(attrs);
    blocks.push({ kind: isSign ? 'sign' : tag, spans });
  }
  return blocks;
}
