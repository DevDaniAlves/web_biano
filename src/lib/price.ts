/** Converte texto pt-BR (49,90 / R$ 1.234,56) em número. */
export function parsePriceBr(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s]/gi, "").trim();
  if (!cleaned) return null;

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

export function formatPriceBr(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
