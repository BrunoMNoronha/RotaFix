/**
 * Extrai dados de entrega do texto OCR de uma etiqueta (Mercado Livre, Amazon,
 * Shopee, Correios…). Etiquetas trazem destinatário E remetente, então o
 * parser delimita a seção do destinatário antes de procurar CEP e número.
 */

export interface ParsedLabel {
  cep: string | null;
  number: string | null;
  label: string | null; // nome do destinatário
  complement: string | null;
  /** CEPs encontrados em todo o texto, para o usuário escolher se o automático errar. */
  allCeps: string[];
}

const CEP_RE = /\b(\d{5})\s?[-.]?\s?(\d{3})\b/g;

const RECIPIENT_MARKERS = [
  /destinat[aá]rio/i,
  /\bentregar\s+(a|para)\b/i,
  /\bship\s*to\b/i,
  /\bdeliver\s*to\b/i,
  /\bpara\s*:/i,
  /\bcomprador\b/i,
  /\breceiver\b/i,
];

const SENDER_MARKERS = [/remetente/i, /\bsender\b/i, /\bfrom\s*:/i, /\bship\s*from\b/i, /\bvendedor\b/i, /\bdevolu[cç][aã]o\b/i];

const NOISE_LINE = /^(nome|name|endere[cç]o|address|cep|cidade|bairro|uf|telefone|tel|cpf|cnpj|pedido|order|nf|nota|rastreio|tracking|c[oó]digo|sku|qtd|peso|volume|data)\b[:\s]*$/i;

function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
}

function findIndex(lines: string[], markers: RegExp[], from = 0): number {
  for (let i = from; i < lines.length; i++) {
    if (markers.some((m) => m.test(lines[i]))) return i;
  }
  return -1;
}

export function extractCeps(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CEP_RE)) {
    const cep = `${m[1]}${m[2]}`;
    // Ignora sequências que são claramente outra coisa (CNPJ/telefone colados)
    if (!out.includes(cep)) out.push(cep);
  }
  return out;
}

/** Remove rótulo inicial ("Destinatário:", "Nome:") e devolve o nome, se sobrar algo. */
function cleanName(line: string): string | null {
  const s = line
    .replace(/^(destinat[aá]rio|ship\s*to|deliver\s*to|para|nome|name|comprador|receiver)\s*[:\-–]?\s*/i, '')
    .replace(/\s*[-–]\s*$/, '')
    .trim();
  if (!s || s.length < 3) return null;
  if (/\d{5}\s?-?\s?\d{3}/.test(s)) return null; // é a linha do CEP
  if (/^\d+$/.test(s)) return null;
  if (NOISE_LINE.test(s)) return null;
  return s;
}

const NUMBER_PATTERNS: RegExp[] = [
  /\bn[º°o.]?\s*[:.]?\s*(\d{1,6})\b/i, // Nº 123, N° 123, n. 123
  /\bn[uú]mero\s*[:.]?\s*(\d{1,6})\b/i,
  /,\s*(\d{1,6})(?:\s*[-–,]|\s+(?:apto|ap|apartamento|bloco|bl|casa|cs|sala|lote|lt|fundos|cond|conj)|\s*$)/i, // "Rua X, 123"
  /\b(\d{1,6})\s*[-–]?\s*(?:apto|ap|apartamento|bloco|bl|casa|cs|sala|lote|lt|fundos|cond|torre|andar)\b/i, // "1811 Bloco B"
  /^[^\d]+\s(\d{1,6})\s*$/, // linha "Rua Tal 123"
];

// "Conjunto" fica fora: no DF faz parte do nome da quadra, não é complemento.
const COMPLEMENT_RE =
  /\b(apto\.?|ap\.?|apartamento|bloco|bl\.?|casa|cs\.?|sala|lote|lt\.?|fundos|cond(?:om[ií]nio)?\.?|torre|andar|loja|galp[aã]o|km)\b\s*[:.]?\s*[A-Za-z0-9\-/ ]{1,30}/i;

export function parseLabel(text: string): ParsedLabel {
  const lines = normalizeLines(text);
  const allCeps = extractCeps(text);

  // Delimita a seção do destinatário
  const recIdx = findIndex(lines, RECIPIENT_MARKERS);
  let sendIdx = findIndex(lines, SENDER_MARKERS, recIdx >= 0 ? recIdx + 1 : 0);
  if (sendIdx >= 0 && recIdx > sendIdx) sendIdx = -1; // remetente aparece antes: seção vai até o fim
  const start = recIdx >= 0 ? recIdx : 0;
  const end = sendIdx >= 0 ? sendIdx : lines.length;
  let section = lines.slice(start, end);

  // Caso remetente venha antes do destinatário, remova o bloco do remetente
  if (recIdx < 0) {
    const s0 = findIndex(lines, SENDER_MARKERS);
    if (s0 >= 0) {
      const nextCepLine = lines.findIndex((l, i) => i > s0 && CEP_RE.test(l));
      CEP_RE.lastIndex = 0;
      if (nextCepLine >= 0) section = [...lines.slice(0, s0), ...lines.slice(nextCepLine + 1)];
    }
  }
  const sectionText = section.join('\n');

  // CEP: prefere o que vem rotulado "CEP" na seção, depois o primeiro da seção, depois qualquer um
  let cep: string | null = null;
  const labeled = sectionText.match(/CEP\s*[:.]?\s*(\d{5})\s?[-.]?\s?(\d{3})/i);
  if (labeled) cep = `${labeled[1]}${labeled[2]}`;
  else cep = extractCeps(sectionText)[0] ?? allCeps[0] ?? null;

  // Nome: linha do marcador (após o rótulo) ou a seguinte
  let label: string | null = null;
  if (recIdx >= 0) {
    label = cleanName(lines[recIdx]);
    for (let i = recIdx + 1; !label && i < Math.min(recIdx + 3, end); i++) {
      label = cleanName(lines[i]);
    }
  }

  // Número: procura nas linhas da seção que parecem endereço (antes da linha do CEP)
  let number: string | null = null;
  const cepLineIdx = section.findIndex((l) => cep && l.replace(/\D/g, '').includes(cep));
  const addressLines = section.slice(recIdx >= 0 ? 1 : 0, cepLineIdx >= 0 ? cepLineIdx + 1 : undefined);
  for (const line of addressLines) {
    for (const re of NUMBER_PATTERNS) {
      const m = line.match(re);
      if (m) {
        number = m[1];
        break;
      }
    }
    if (number) break;
  }

  // Complemento
  let complement: string | null = null;
  for (const line of addressLines) {
    const m = line.match(COMPLEMENT_RE);
    if (m) {
      complement = m[0].replace(/\s+/g, ' ').trim();
      break;
    }
  }

  return { cep, number, label, complement, allCeps };
}
