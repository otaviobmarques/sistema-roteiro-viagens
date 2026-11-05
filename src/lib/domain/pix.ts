// Pix "copia e cola" (BR Code / EMV QRCPS-MPM) estático — RF-075.
// Especificação: Manual de Padrões para Iniciação do Pix (Banco Central do Brasil).

function tlv(id: string, value: string): string {
  return id + String(value.length).padStart(2, "0") + value;
}

export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function sanitize(s: string, max: number): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,-]/g, "")
    .trim()
    .slice(0, max) || "NA";
}

export type PixInput = {
  key: string;
  name: string;
  city: string;
  amountCents?: number;
  txid?: string;
  description?: string;
};

export function buildPixPayload(p: PixInput): string {
  const gui = tlv("00", "br.gov.bcb.pix");
  const key = tlv("01", p.key.trim());
  const desc = p.description ? tlv("02", sanitize(p.description, 40)) : "";
  const mai = tlv("26", gui + key + desc);
  const amount = p.amountCents && p.amountCents > 0 ? tlv("54", (p.amountCents / 100).toFixed(2)) : "";
  const txid = tlv("05", (p.txid || "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***");
  const body =
    tlv("00", "01") +
    mai +
    tlv("52", "0000") +
    tlv("53", "986") +
    amount +
    tlv("58", "BR") +
    tlv("59", sanitize(p.name, 25)) +
    tlv("60", sanitize(p.city, 15)) +
    tlv("62", txid) +
    "6304";
  return body + crc16(body);
}

/** Validação básica do formato da chave Pix. */
export function pixKeyKind(key: string): "cpf" | "cnpj" | "email" | "telefone" | "aleatoria" | null {
  const k = key.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k)) return "aleatoria";
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(k)) return "email";
  if (/^\+55\d{10,11}$/.test(k)) return "telefone";
  if (/^\d{11}$/.test(k)) return "cpf";
  if (/^\d{14}$/.test(k)) return "cnpj";
  return null;
}
