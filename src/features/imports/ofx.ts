import {
  parseSignedAmount,
  parseSignedDotAmount,
  type ParsedNature,
  type ParsedStatement,
  type ParsedStatementRow,
  type StatementIssue,
} from "./statementValues";

export const MAX_OFX_BYTES = 5 * 1024 * 1024;
export const MAX_OFX_TRANSACTIONS = 10_000;

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Entidades que os bancos escrevem dentro de `<MEMO>` em OFX 2.x. */
export function decodeOfxEntities(value: string): string {
  return value.replace(
    /&(#[0-9]+|#x[0-9a-f]+|[a-z]+);/gi,
    (original, code: string) => {
      if (code[0] === "#") {
        const codePoint =
          code[1].toLowerCase() === "x"
            ? Number.parseInt(code.slice(2), 16)
            : Number.parseInt(code.slice(1), 10);
        if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
          return original;
        }
        return String.fromCodePoint(codePoint);
      }
      return XML_ENTITIES[code.toLowerCase()] ?? original;
    },
  );
}

export function decodeOfx(bytes: ArrayBuffer): string {
  if (bytes.byteLength === 0) throw new Error("Arquivo OFX vazio");
  if (bytes.byteLength > MAX_OFX_BYTES) {
    throw new Error("Arquivo OFX excede o limite de 5 MiB");
  }

  // OFX 1.02 declara CHARSET:1252 e é comum o banco escrever acentos nesse
  // encoding; OFX 2.x costuma vir em UTF-8. A mesma estratégia do CSV resolve
  // os dois sem precisar confiar no cabeçalho, que nem sempre é fiel.
  const text = (() => {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder("windows-1252").decode(bytes);
    }
  })().replace(/^\uFEFF/, "");

  if (!/<OFX(?:\s[^>]*)?>/i.test(text)) {
    throw new Error("Formato OFX não suportado");
  }
  return text;
}

/**
 * DTPOSTED vem como `20261103100000[-03:EST]` (ou só `20261103`). A data do
 * lançamento são os oito primeiros dígitos; fuseau e hora não entram no app,
 * que trabalha só com datas ISO.
 */
export function parseOfxDate(value: string): string | null {
  const match =
    /^(\d{4})(\d{2})(\d{2})(?:\d{6})?(?:\.\d+)?(?:\[[^\]]+\])?$/.exec(
      value.trim(),
    );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/**
 * OFX usa ponto decimal. O fallback com vírgula atende os bancos que exportam
 * no formato brasileiro; um valor com ponto e três casas (`1.234`) não é
 * aceito de propósito, para não virar 1234 reais por engano.
 */
export function parseOfxAmount(value: string) {
  const text = value.trim().replace(/\s/g, "");
  const dotAmount = parseSignedDotAmount(text);
  if (dotAmount) return dotAmount;
  return text.includes(",") ? parseSignedAmount(text) : null;
}

/** Lê o valor de uma tag SGML (`<TAG>valor`) ou XML (`<TAG>valor</TAG>`). */
export function readOfxTag(block: string, tag: string): string {
  const pattern = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)(?=<[A-Za-z/]|$)`,
    "i",
  );
  const value = pattern.exec(block)?.[1] ?? "";
  return decodeOfxEntities(value).trim();
}

export interface OfxTransactionBlock {
  block: string;
  sourceRow: number;
}

/**
 * OFX 1.x permite omitir `</STMTTRN>`; por isso o limite de cada bloco é a
 * abertura da próxima transação (ou o fim do extrato), não uma tag de fechamento.
 * `sourceRow` é a linha física do `<STMTTRN>` para a prévia apontar o registro.
 */
export function extractOfxTransactions(text: string): OfxTransactionBlock[] {
  const openings = [...text.matchAll(/<STMTTRN(?:\s[^>]*)?>/gi)];
  return openings.map((opening, index) => {
    const start = opening.index ?? 0;
    const end = openings[index + 1]?.index ?? text.length;
    const block = text
      .slice(start, end)
      .split(/<\/(?:BANKTRANLIST|STMTRS|CCSTMTRS|OFX)\s*>/i)[0];
    const sourceRow = text.slice(0, start).split("\n").length;
    return { block, sourceRow };
  });
}

const DEBIT_TYPES = new Set([
  "DEBIT",
  "FEE",
  "ATM",
  "POS",
  "CHECK",
  "DIRECTDEBIT",
]);

function resolveNature(
  rawAmount: string,
  parsedNature: ParsedNature,
  transactionType: string,
): ParsedNature {
  if (/^[+-]/.test(rawAmount.trim())) return parsedNature;
  return DEBIT_TYPES.has(transactionType.toUpperCase()) ? "saida" : parsedNature;
}

export interface ParsedOfxStatement extends ParsedStatement {
  transactions: number;
}

export function parseStatementOfx(bytes: ArrayBuffer): ParsedOfxStatement {
  const text = decodeOfx(bytes);
  const blocks = extractOfxTransactions(text);
  if (blocks.length === 0) {
    throw new Error(
      "Nenhum lançamento encontrado no OFX. Confirme que é o extrato da conta (e não a fatura do cartão).",
    );
  }
  if (blocks.length > MAX_OFX_TRANSACTIONS) {
    throw new Error("Arquivo OFX excede o limite de 10.000 lançamentos");
  }

  const rows: ParsedStatementRow[] = [];
  const issues: StatementIssue[] = [];

  for (const { block, sourceRow } of blocks) {
    const rawDate = readOfxTag(block, "DTPOSTED");
    const rawAmount = readOfxTag(block, "TRNAMT");
    const description =
      readOfxTag(block, "MEMO") ||
      readOfxTag(block, "NAME") ||
      readOfxTag(block, "CHECKNUM");
    const externalId = readOfxTag(block, "FITID");
    const transactionType = readOfxTag(block, "TRNTYPE");

    const date = parseOfxDate(rawDate);
    const amount = parseOfxAmount(rawAmount);
    if (!date) {
      issues.push({ sourceRow, message: "Data inválida" });
    } else if (!amount) {
      issues.push({ sourceRow, message: "Valor inválido" });
    } else if (!description) {
      issues.push({ sourceRow, message: "Descrição inválida" });
    } else {
      rows.push({
        sourceRow,
        date,
        description,
        amount_cents: amount.amount_cents,
        nature: resolveNature(rawAmount, amount.nature, transactionType),
        ...(externalId ? { externalId } : {}),
      });
    }
  }

  return { rows, issues, transactions: blocks.length };
}
