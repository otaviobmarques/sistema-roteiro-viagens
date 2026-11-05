import { describe, expect, it } from "vitest";
import { cascade, optimizeDay, viabilityScore, type ScheduleItem } from "./schedule";
import { balances, minimizeTransfers, splitEqual, splitByWeights, validateShares, parseMoneyToCents } from "./settle";
import { buildPixPayload, crc16, pixKeyKind } from "./pix";
import { qualityFilter, qualityScore, fitScore, forYouScore, badge, interestTimeShare } from "./score";
import { allocateDays, adjustDays, orderDestinations } from "./multidest";
import { isOpenDuring } from "./opening-hours";
import { addDays, daysBetween } from "./time";

const lisboa = { lat: 38.7139, lng: -9.1394 };
const item = (id: string, o: Partial<ScheduleItem> = {}): ScheduleItem => ({ id, title: id, duration_min: 60, ...lisboa, ...o });

describe("cascata de horários (8.1)", () => {
  it("empurra os itens seguintes conforme a duração", () => {
    const r = cascade([item("a"), item("b", { duration_min: 90 }), item("c")], { dayStart: "09:00" });
    expect(r.items.map((i) => i.start)).toEqual(["09:00", "10:00", "11:30"]);
    expect(r.conflicts).toHaveLength(0);
    expect(r.score).toBe(100);
  });

  it("nunca move a âncora e registra conflito quando não cabe (RN-02)", () => {
    const r = cascade([item("a", { duration_min: 180 }), item("trem", { anchor: true, anchor_time: "11:00", kind: "trajeto" })], { dayStart: "09:00" });
    expect(r.items[1].start).toBe("11:00");
    expect(r.conflicts[0].type).toBe("sobreposicao");
    expect(r.conflicts[0].severity).toBe("alta");
    expect(r.score).toBe(85);
  });

  it("cria bloco de tempo livre antes de uma âncora", () => {
    const r = cascade([item("a"), item("show", { anchor: true, anchor_time: "14:00" })], { dayStart: "09:00" });
    expect(r.freeBlocks[0]).toMatchObject({ start: "10:00", end: "14:00", minutes: 240 });
  });

  it("acusa lugar fechado no horário", () => {
    // 2027-05-10 é segunda-feira
    const r = cascade([item("museu", { opening_hours: "Tu-Su 10:00-18:00" })], { dayStart: "10:00", date: "2027-05-10" });
    expect(r.conflicts.some((c) => c.type === "fechado")).toBe(true);
  });

  it("acusa dia puxado acima do ritmo", () => {
    const many = Array.from({ length: 9 }, (_, i) => item(`x${i}`, { duration_min: 60 }));
    const r = cascade(many, { pace: "leve" });
    expect(r.conflicts.some((c) => c.type === "dia_puxado")).toBe(true);
  });

  it("acusa chuva em atividade ao ar livre", () => {
    const r = cascade([item("parque", { outdoor: true })], { rainProbability: 80 });
    expect(r.conflicts[0].type).toBe("clima");
  });

  it("score de viabilidade desconta por severidade", () => {
    expect(viabilityScore([{ type: "fechado", severity: "alta", message: "", fix: "" }, { type: "clima", severity: "media", message: "", fix: "" }, { type: "orcamento", severity: "baixa", message: "", fix: "" }])).toBe(77);
    expect(viabilityScore(Array(10).fill({ type: "fechado", severity: "alta", message: "", fix: "" }))).toBe(0);
  });
});

describe("otimização da ordem (8.2)", () => {
  const pts = [
    item("A", { lat: 38.70, lng: -9.20 }),
    item("C", { lat: 38.70, lng: -9.10 }),
    item("B", { lat: 38.70, lng: -9.15 }),
    item("D", { lat: 38.70, lng: -9.05 }),
  ];
  it("reordena para menor deslocamento", () => {
    const r = optimizeDay(pts);
    expect(r.changed).toBe(true);
    expect(r.items.map((i) => i.id)).toEqual(["A", "B", "C", "D"]);
    expect(r.savedMinutes).toBeGreaterThan(0);
  });
  it("mantém âncoras no lugar", () => {
    const withAnchor = [pts[0], pts[1], { ...pts[2], anchor: true, anchor_time: "15:00" }, pts[3]];
    const r = optimizeDay(withAnchor);
    expect(r.items[2].id).toBe("B");
  });
});

describe("divisão de gastos e acerto (M08)", () => {
  it("sobra do arredondamento vai para quem pagou (RN-05)", () => {
    const s = splitEqual(1000, ["a", "b", "c"], "b");
    expect(s.find((x) => x.memberId === "b")!.cents).toBe(334);
    expect(validateShares(1000, s)).toBe(true);
  });
  it("divide por cotas", () => {
    const s = splitByWeights(10000, [{ memberId: "a", weight: 2 }, { memberId: "b", weight: 1 }, { memberId: "c", weight: 1 }]);
    expect(s.map((x) => x.cents)).toEqual([5000, 2500, 2500]);
  });
  it("minimiza transferências", () => {
    const exps = [
      { payers: [{ memberId: "ana", cents: 30000 }], shares: splitEqual(30000, ["ana", "bia", "caio"]) },
      { payers: [{ memberId: "bia", cents: 6000 }], shares: splitEqual(6000, ["ana", "bia", "caio"]) },
    ];
    const t = minimizeTransfers(balances(exps));
    expect(t.length).toBeLessThanOrEqual(2);
    const net = new Map<string, number>();
    for (const x of t) { net.set(x.from, (net.get(x.from) ?? 0) - x.cents); net.set(x.to, (net.get(x.to) ?? 0) + x.cents); }
    expect(net.get("ana")).toBe(18000);
    expect(t.reduce((s, x) => s + x.cents, 0)).toBe(18000);
  });
  it("considera acertos já pagos", () => {
    const exps = [{ payers: [{ memberId: "a", cents: 1000 }], shares: splitEqual(1000, ["a", "b"]) }];
    expect(minimizeTransfers(balances(exps, [{ from: "b", to: "a", cents: 500 }]))).toHaveLength(0);
  });
  it("lê valores em formato brasileiro", () => {
    expect(parseMoneyToCents("R$ 1.234,56")).toBe(123456);
    expect(parseMoneyToCents("12.5")).toBe(1250);
  });
});

describe("Pix copia e cola (RF-075)", () => {
  it("CRC16-CCITT confere com o vetor padrão", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
  it("gera payload válido com valor e CRC", () => {
    const p = buildPixPayload({ key: "ana@exemplo.com", name: "Ana Ribeiro", city: "São Paulo", amountCents: 15050, txid: "ROTTA1" });
    expect(p.startsWith("000201")).toBe(true);
    expect(p).toContain("br.gov.bcb.pix");
    expect(p).toContain("5406150.50");
    expect(p).toContain("5303986");
    expect(p).toContain("6009Sao Paulo");
    expect(crc16(p.slice(0, -4))).toBe(p.slice(-4));
  });
  it("reconhece tipos de chave", () => {
    expect(pixKeyKind("12345678901")).toBe("cpf");
    expect(pixKeyKind("+5511999998888")).toBe("telefone");
    expect(pixKeyKind("x@y.com")).toBe("email");
  });
});

describe("curadoria e score (10.3/10.4)", () => {
  it("reprova abaixo da nota ou do volume mínimo", () => {
    expect(qualityFilter({ type: "restaurante", rating: 4.1, reviews: 500 }).approved).toBe(false);
    expect(qualityFilter({ type: "restaurante", rating: 4.5, reviews: 50 }).approved).toBe(false);
    expect(qualityFilter({ type: "restaurante", rating: 4.5, reviews: 300 }).approved).toBe(true);
    expect(qualityFilter({ type: "hospedagem", rating: 4.3, reviews: 60, hostel: true, profile: "mochilao" }).approved).toBe(true);
    expect(qualityFilter({ type: "atracao", rating: 4.9, reviews: 9000, operational: false }).approved).toBe(false);
  });
  it("média bayesiana penaliza poucas avaliações", () => {
    expect(qualityScore({ type: "atracao", rating: 4.9, reviews: 5000 })).toBeGreaterThan(qualityScore({ type: "atracao", rating: 4.9, reviews: 10 }));
  });
  it("score para você e selos", () => {
    const fit = fitScore({ interest: "natureza", interests: { natureza: 3 }, itemPriceLevel: 2, profile: "classica", contextBonus: 1 });
    expect(fit).toBe(10);
    expect(forYouScore(9, fit)).toBe(9.5);
    expect(badge(9.5)?.label).toBe("Imperdível");
    expect(badge(4.9)).toBeNull();
  });
  it("divide o tempo pelos pesos e soma 100%", () => {
    const s = interestTimeShare({ natureza: 3, gastronomia: 3, cultura: 2, fotografia: 1 });
    expect(s.reduce((a, b) => a + b.pct, 0)).toBe(100);
    expect(s[0].pct).toBe(34);
  });
});

describe("multidestino (10.7)", () => {
  const d = [
    { id: "roma", city: "Roma", lat: 41.9, lng: 12.5, capital: true, weight: 3 },
    { id: "lisboa", city: "Lisboa", lat: 38.7, lng: -9.1, capital: true, weight: 2 },
    { id: "zurique", city: "Zurique", lat: 47.4, lng: 8.5, weight: 1 },
    { id: "madri", city: "Madri", lat: 40.4, lng: -3.7, capital: true, weight: 2 },
  ];
  it("ordena sem voltar para trás, da chegada à saída", () => {
    const r = orderDestinations(d, { lat: 38.7, lng: -9.1 }, { lat: 41.9, lng: 12.5 });
    expect(r.map((x) => x.id)).toEqual(["lisboa", "madri", "zurique", "roma"]);
  });
  it("divide os dias respeitando mínimos e travados", () => {
    const a = allocateDays([...d.slice(0, 3), { ...d[3], locked: true, days: 5 }], 30);
    expect(a.reduce((s, x) => s + (x.days ?? 0), 0)).toBe(30);
    expect(a.find((x) => x.id === "madri")!.days).toBe(5);
    expect(a.find((x) => x.id === "roma")!.days!).toBeGreaterThan(a.find((x) => x.id === "zurique")!.days!);
  });
  it("ajuste + e − reequilibra mantendo o total", () => {
    const a = allocateDays(d, 20);
    const b = adjustDays(a, "zurique", 2, 20);
    expect(b.reduce((s, x) => s + (x.days ?? 0), 0)).toBe(20);
    expect(b.find((x) => x.id === "zurique")!.days).toBe(a.find((x) => x.id === "zurique")!.days! + 2);
  });
});

describe("utilitários", () => {
  it("horário de funcionamento OSM", () => {
    expect(isOpenDuring("24/7", "2027-05-10", 0, 100)).toBe(true);
    expect(isOpenDuring("Mo-Fr 09:00-18:00; Sa-Su off", "2027-05-15", 600, 660)).toBe(false);
    expect(isOpenDuring("Mo-Fr 09:00-18:00", "2027-05-10", 600, 660)).toBe(true);
    expect(isOpenDuring("sunrise-sunset", "2027-05-10", 600, 660)).toBeNull();
  });
  it("datas", () => {
    expect(addDays("2027-05-30", 3)).toBe("2027-06-02");
    expect(daysBetween("2027-05-10", "2027-05-20")).toBe(10);
  });
});
