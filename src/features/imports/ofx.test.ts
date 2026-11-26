import { describe, expect, it } from "vitest";
import {
  decodeOfxEntities,
  extractOfxTransactions,
  MAX_OFX_BYTES,
  parseOfxAmount,
  parseOfxDate,
  parseStatementOfx,
  readOfxTag,
} from "./ofx";

function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

const extrato = [
  "OFXHEADER:100",
  "DATA:OFXSGML",
  "VERSION:102",
  "CHARSET:1252",
  "",
  "<OFX>",
  "<BANKMSGSRSV1>",
  "<STMTTRNRS>",
  "<STMTRS>",
  "<BANKTRANLIST>",
  "<STMTTRN>",
  "<TRNTYPE>CREDIT",
  "<DTPOSTED>20261103100000[-03:EST]",
  "<TRNAMT>571.48",
  "<FITID>id-1",
  "<MEMO>Depósito recebido",
  "</STMTTRN>",
  "<STMTTRN>",
  "<TRNTYPE>DEBIT",
  "<DTPOSTED>20261103100000[-03:EST]",
  "<TRNAMT>-179.90",
  "<FITID>id-2",
  "<MEMO>Pagamento de conta",
  "</STMTTRN>",
  "<STMTTRN>",
  "<TRNTYPE>CREDIT",
  "<DTPOSTED>20261105",
  "<TRNAMT>35.50",
  "<FITID>id-3",
  "<MEMO>Transferência &amp; troco",
  "</STMTTRN>",
  "</BANKTRANLIST>",
  "<LEDGERBAL>",
  "<BALAMT>-49.19",
  "<DTASOF>20261126100000[-03:EST]",
  "</LEDGERBAL>",
  "</STMTRS>",
  "</STMTTRNRS>",
  "</OFX>",
].join("\n");

describe("leitura de extrato OFX", () => {
  it("importa os lançamentos com data, valor, descrição e identificador", () => {
    const parsed = parseStatementOfx(bytesOf(extrato));

    expect(parsed.transactions).toBe(3);
    expect(parsed.issues).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        sourceRow: 11,
        date: "2026-11-03",
        description: "Depósito recebido",
        amount_cents: 57_148,
        nature: "entrada",
        externalId: "id-1",
      },
      {
        sourceRow: 18,
        date: "2026-11-03",
        description: "Pagamento de conta",
        amount_cents: 17_990,
        nature: "saida",
        externalId: "id-2",
      },
      {
        sourceRow: 25,
        date: "2026-11-05",
        description: "Transferência & troco",
        amount_cents: 3_550,
        nature: "entrada",
        externalId: "id-3",
      },
    ]);
  });

  it("aceita OFX 2.x em XML e usa TRNTYPE quando o valor não tem sinal", () => {
    const xml = [
      "<OFX>",
      "<BANKTRANLIST>",
      "<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260105</DTPOSTED><TRNAMT>12.50</TRNAMT><MEMO>Mercado</MEMO><FITID>x</FITID></STMTTRN>",
      "</BANKTRANLIST>",
      "</OFX>",
    ].join("\n");

    expect(parseStatementOfx(bytesOf(xml)).rows).toEqual([
      {
        sourceRow: 3,
        date: "2026-01-05",
        description: "Mercado",
        amount_cents: 1_250,
        nature: "saida",
        externalId: "x",
      },
    ]);
  });

  it("decodifica CHARSET:1252 e aceita valor com vírgula decimal", () => {
    const start = "<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260105</DTPOSTED><TRNAMT>1,50</TRNAMT><MEMO>A";
    const end = "</MEMO><FITID>1</FITID></STMTTRN></BANKTRANLIST></OFX>";
    const bytes = new Uint8Array([
      ...[...start].map((character) => character.charCodeAt(0)),
      0xe7,
      0xe3,
      0x6f,
      ...[...end].map((character) => character.charCodeAt(0)),
    ]).buffer;

    expect(parseStatementOfx(bytes).rows).toEqual([
      {
        sourceRow: 1,
        date: "2026-01-05",
        description: "Ação",
        amount_cents: 150,
        nature: "entrada",
        externalId: "1",
      },
    ]);
  });

  it("aponta linhas inválidas sem descartar as válidas", () => {
    const xml = [
      "<OFX>",
      "<BANKTRANLIST>",
      "<STMTTRN><DTPOSTED>xx</DTPOSTED><TRNAMT>1.00</TRNAMT><MEMO>A</MEMO></STMTTRN>",
      "<STMTTRN><DTPOSTED>20260105</DTPOSTED><TRNAMT>0.00</TRNAMT><MEMO>B</MEMO></STMTTRN>",
      "<STMTTRN><DTPOSTED>20260105</DTPOSTED><TRNAMT>1.00</TRNAMT></STMTTRN>",
      "<STMTTRN><DTPOSTED>20260106</DTPOSTED><TRNAMT>2.00</TRNAMT><MEMO>OK</MEMO></STMTTRN>",
      "</BANKTRANLIST>",
      "</OFX>",
    ].join("\n");

    const parsed = parseStatementOfx(bytesOf(xml));
    expect(parsed.issues).toEqual([
      { sourceRow: 3, message: "Data inválida" },
      { sourceRow: 4, message: "Valor inválido" },
      { sourceRow: 5, message: "Descrição inválida" },
    ]);
    expect(parsed.rows).toEqual([
      {
        sourceRow: 6,
        date: "2026-01-06",
        description: "OK",
        amount_cents: 200,
        nature: "entrada",
      },
    ]);
  });

  it("rejeita arquivo vazio, outro formato e arquivo grande", () => {
    expect(() => parseStatementOfx(new ArrayBuffer(0))).toThrow("Arquivo OFX vazio");
    expect(() => parseStatementOfx(bytesOf("<html></html>"))).toThrow(
      "Formato OFX não suportado",
    );
    expect(() => parseStatementOfx(bytesOf("<OFX></OFX>"))).toThrow(
      "Nenhum lançamento encontrado no OFX",
    );
    expect(() => parseStatementOfx(new ArrayBuffer(MAX_OFX_BYTES + 1))).toThrow(
      "Arquivo OFX excede o limite de 5 MiB",
    );
  });
});

describe("peças do parser OFX", () => {
  it("lê a data ignorando hora e fuso, e recusa datas impossíveis", () => {
    expect(parseOfxDate("20261103100000[-03:EST]")).toBe("2026-11-03");
    expect(parseOfxDate("20261103")).toBe("2026-11-03");
    expect(parseOfxDate("20261103100000.000[-03:EST]")).toBe("2026-11-03");
    expect(parseOfxDate("20260230")).toBeNull();
    expect(parseOfxDate("")).toBeNull();
  });

  it("não confunde milhar com centavos no valor", () => {
    expect(parseOfxAmount("571.48")).toEqual({ amount_cents: 57_148, nature: "entrada" });
    expect(parseOfxAmount("-1234,00")).toEqual({ amount_cents: 123_400, nature: "saida" });
    expect(parseOfxAmount("1.234")).toBeNull();
    expect(parseOfxAmount("abc")).toBeNull();
  });

  it("lê tags e entidades, e limita cada bloco à próxima transação", () => {
    expect(decodeOfxEntities("A &amp; B &lt;C&gt; &#233;")).toBe("A & B <C> é");
    expect(readOfxTag("<MEMO>Café</MEMO>", "MEMO")).toBe("Café");
    expect(
      extractOfxTransactions(
        "<STMTTRN><FITID>1</FITID></STMTTRN>\n<STMTTRN><FITID>2</FITID>",
      ).map(({ sourceRow }) => sourceRow),
    ).toEqual([1, 2]);
  });
});
