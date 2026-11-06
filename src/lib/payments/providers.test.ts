import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { stripeSignatureOk, mercadoPagoSignatureOk } from "./providers";

describe("assinaturas de webhook", () => {
  it("Stripe: aceita assinatura válida e recente, recusa adulterada ou antiga", () => {
    const secret = "whsec_teste";
    const raw = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
    const t = Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
    expect(stripeSignatureOk(secret, `t=${t},v1=${v1}`, raw)).toBe(true);
    expect(stripeSignatureOk(secret, `t=${t},v1=${v1}`, raw + " ")).toBe(false);
    const old = t - 600;
    const v1old = crypto.createHmac("sha256", secret).update(`${old}.${raw}`).digest("hex");
    expect(stripeSignatureOk(secret, `t=${old},v1=${v1old}`, raw)).toBe(false);
    expect(stripeSignatureOk(secret, null, raw)).toBe(false);
  });
  it("Mercado Pago: manifesto id/request-id/ts", () => {
    const secret = "mp_segredo";
    const ts = "1704908010";
    const v1 = crypto.createHmac("sha256", secret).update(`id:123456;request-id:req-1;ts:${ts};`).digest("hex");
    expect(mercadoPagoSignatureOk(secret, `ts=${ts},v1=${v1}`, "req-1", "123456")).toBe(true);
    expect(mercadoPagoSignatureOk(secret, `ts=${ts},v1=${v1}`, "req-2", "123456")).toBe(false);
  });
});
