import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localFees, feesPerPerson } from "./local-fees";

// cache "vazio e recente": nenhuma taxa extra pesquisada pelo Pino
const fake = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { data: { fees: [] }, updated_at: new Date().toISOString() } }) }) }) }) } as unknown as SupabaseClient;

describe("taxas locais", () => {
  it("conhece Ubatuba, Noronha e Veneza pela lista fixa", async () => {
    const f = await localFees(fake, [{ city: "Ubatuba", country: "Brasil" }, { city: "Fernando de Noronha", country: "Brasil" }, { city: "Veneza", country: "Itália" }]);
    expect(f.some((x) => x.city === "Ubatuba" && x.who === "veiculo")).toBe(true);
    expect(f.some((x) => x.city === "Fernando de Noronha" && x.who === "pessoa_dia")).toBe(true);
    expect(f.some((x) => x.city === "Veneza" && /acesso/.test(x.name))).toBe(true);
  });
  it("taxa de hospedagem aparece uma vez por país europeu", async () => {
    const f = await localFees(fake, [{ city: "Roma", country: "Itália" }, { city: "Florença", country: "Itália" }]);
    const hotel = f.filter((x) => /hospedagem/.test(x.name));
    expect(hotel).toHaveLength(1);
    expect(hotel[0].city).toBe("Roma, Florença");
  });
  it("cidade sem taxa não inventa nada", async () => {
    expect(await localFees(fake, [{ city: "Campinas", country: "Brasil" }])).toHaveLength(0);
  });
  it("estimativa por pessoa", () => {
    const fees = [
      { city: "A", name: "x", who: "veiculo" as const, how: "", approx_brl: 40, checklist: "", due: 1, source: "pino" as const },
      { city: "A", name: "y", who: "pessoa_noite" as const, how: "", approx_brl: 10, checklist: "", due: 1, source: "pino" as const },
    ];
    expect(feesPerPerson(fees, { A: 3 }, 2)).toBe(2000 + 3000);
  });
});
