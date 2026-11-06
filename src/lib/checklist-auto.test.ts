import { describe, it, expect } from "vitest";
import { buildTripChecklist } from "./checklist-auto";
import type { CountryGuide } from "./ai/country-guide";

const guide = {
  country_name: "Itália",
  insurance: { mandatory: true, requirement: "Espaço Schengen: cobertura mínima de € 30 mil", recommended: "", tips: [] },
  health: { summary: "", agreement: "CDAM", vaccines: "Nenhuma exigida", yellow_fever: "nao", vaccines_recommended: [], medicines: "" },
  connectivity: { roaming: "", esim: "", local_sim: "", tip: "" },
  money: { currency: "Moeda: euro (EUR). Consulte o câmbio.", cards: "", tipping: "" },
  power: { plugs: "Tomadas tipos C, F e L. Leve adaptador.", voltage: "230 V" },
  documents: { visa: "", passport: "", other: null },
  emergency: { number: "112", police: null, ambulance: null },
  phrases: [],
} as unknown as CountryGuide;

describe("checklist automático", () => {
  const list = buildTripChecklist({ start: "2030-05-10", guides: [{ country: "Itália", guide }], cities: ["Roma", "Florença"], international: true, weather: [{ rain: 70, tmax: 12 }], tickets: ["Coliseu"], children: 0 });
  it("tem as tarefas principais, curtas e sem repetir", () => {
    const labels = list.map((x) => x.label);
    expect(labels).toContain("Contratar o seguro viagem (pode ser exigido na entrada: cobertura médica mínima de € 30 mil)");
    expect(labels).toContain("Emitir antes de viajar o certificado do acordo de saúde Brasil–Itália");
    expect(labels).toContain("Adaptador de tomada para Itália (tipo C, F, L)");
    expect(labels).toContain("Levar cartão internacional e um pouco de dinheiro em espécie: euro (EUR)");
    expect(labels.some((l) => /febre amarela/i.test(l))).toBe(false);
    expect(labels).toContain("Conferir a caderneta de vacinação no posto de saúde (com pelo menos 30 dias de antecedência)");
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.every((l) => l.length <= 120)).toBe(true);
  });
  it("prazos antes da ida e nunca no passado", () => {
    const seguro = list.find((x) => x.label.startsWith("Contratar o seguro"))!;
    expect(seguro.due_date).toBe("2030-04-25");
    const past = buildTripChecklist({ start: "2000-01-10", guides: [], cities: ["Rio"], international: false, weather: [], tickets: [], children: 0 });
    const today = new Date().toISOString().slice(0, 10);
    expect(past.every((x) => x.due_date == null || x.due_date >= today)).toBe(true);
  });
  it("febre amarela exigida vira tarefa com o CIVP", () => {
    const g2 = { ...guide, health: { ...guide.health, yellow_fever: "exigido" as const, vaccines_recommended: ["hepatite A", "febre tifoide"] } };
    const l = buildTripChecklist({ start: "2030-05-10", guides: [{ country: "Angola", guide: g2 }], cities: ["Luanda"], international: true, weather: [], tickets: [], children: 0 }).map((x) => x.label);
    expect(l.some((x) => /CIVP/.test(x) && /Angola/.test(x))).toBe(true);
    expect(l).toContain("Vacinas recomendadas para Angola: hepatite A, febre tifoide (ver no posto de saúde)");
  });
  it("viagem nacional não pede passaporte nem adaptador", () => {
    const br = buildTripChecklist({ start: "2030-01-10", guides: [], cities: ["Ubatuba"], international: false, weather: [], tickets: [], children: 0 });
    expect(br.some((x) => /passaporte|adaptador/i.test(x.label))).toBe(false);
    expect(br.some((x) => /febre amarela/i.test(x.label))).toBe(true);
  });
});
