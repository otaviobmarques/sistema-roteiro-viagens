import { describe, expect, it } from "vitest";
import { normalizeKind, normalizeProfile } from "./normalize";

describe("normalização da resposta da IA", () => {
  it("tipos de item", () => {
    expect(normalizeKind("refeição")).toBe("refeicao");
    expect(normalizeKind("Almoço")).toBe("refeicao");
    expect(normalizeKind("Hotel")).toBe("hospedagem");
    expect(normalizeKind("passeio")).toBe("atividade");
    expect(normalizeKind("atração")).toBe("lugar");
    expect(normalizeKind(undefined)).toBe("lugar");
  });
  it("perfis", () => {
    expect(normalizeProfile("Mochilão")).toBe("mochilao");
    expect(normalizeProfile("Clássica")).toBe("classica");
    expect(normalizeProfile("experiência")).toBe("experiencia");
  });
});
