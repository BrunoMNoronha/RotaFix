export function normalizeCep(input: string): string {
  return input.replace(/\D/g, '').slice(0, 8);
}

export function isValidCep(input: string): boolean {
  return /^\d{8}$/.test(normalizeCep(input));
}

export function formatCep(cep: string): string {
  const d = normalizeCep(cep);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
