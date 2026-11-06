import { describe, expect, it } from "vitest";
import { TripPlaces, sameName } from "./dedupe";

describe("sem duplicação na viagem", () => {
  it("reconhece o mesmo lugar escrito de outro jeito", () => {
    const ign = new Set(["sintra", "lisboa"]);
    expect(sameName("Palácio da Pena em Sintra", "Palácio da Pena", ign)).toBe(true);
    expect(sameName("Pastéis de Belém (Lisboa)", "Pastéis de Belém", ign)).toBe(true);
    expect(sameName("Castelo de São Jorge", "castelo sao jorge", ign)).toBe(true);
    expect(sameName("Torre de Belém", "TORRE DE BELÉM", ign)).toBe(true);
  });
  it("não confunde lugares diferentes", () => {
    expect(sameName("Museu", "Museu do Fado")).toBe(false);
    expect(sameName("Museu do Fado", "Museu do Azulejo")).toBe(false);
    expect(sameName("Castelo dos Mouros", "Castelo de São Jorge")).toBe(false);
    expect(sameName("Palácio da Pena", "Palácio Nacional de Sintra", new Set(["sintra"]))).toBe(false);
  });
  it("bloqueia o mesmo lugar por id ou por nome, em qualquer dia", () => {
    const t = new TripPlaces(["Lisboa", "Sintra"]);
    expect(t.tryAdd({ place_id: "p1", title: "Palácio da Pena em Sintra", kind: "lugar" })).toBe(true);
    expect(t.tryAdd({ place_id: "p9", title: "Palácio da Pena", kind: "lugar" })).toBe(false);
    expect(t.tryAdd({ place_id: "p1", title: "Outro nome", kind: "lugar" })).toBe(false);
    expect(t.tryAdd({ title: "Castelo dos Mouros", kind: "lugar" })).toBe(true);
  });
  it("hospedagem, trajetos e notas podem repetir", () => {
    const t = new TripPlaces();
    expect(t.tryAdd({ place_id: "h1", title: "Hotel X", kind: "hospedagem" })).toBe(true);
    expect(t.tryAdd({ place_id: "h1", title: "Hotel X", kind: "hospedagem" })).toBe(true);
    expect(t.tryAdd({ title: "Lisboa → Sintra", kind: "trajeto" })).toBe(true);
    expect(t.tryAdd({ title: "Lisboa → Sintra", kind: "trajeto" })).toBe(true);
  });
  it("restaurante também não repete", () => {
    const t = new TripPlaces();
    expect(t.tryAdd({ place_id: "r1", title: "Da Prata 52", kind: "refeicao" })).toBe(true);
    expect(t.tryAdd({ place_id: "r1", title: "Da Prata 52", kind: "refeicao" })).toBe(false);
  });
});
