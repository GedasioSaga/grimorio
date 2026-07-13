/** Nomes de dispositivo reservados pelo Windows — inválidos como arquivo/pasta. */
const RESERVADOS_WINDOWS = new Set([
  'con', 'prn', 'aux', 'nul',
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
])

export function slugify(nome: string): string {
  const s = nome
    .normalize('NFD')
    // remove acentos (combining diacritics); nomes 100% não-latinos
    // colapsam para 'sem-nome' — limitação conhecida, slugUnico evita colisões
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const base = s || 'sem-nome'
  return RESERVADOS_WINDOWS.has(base) ? `${base}-item` : base
}

export function slugUnico(base: string, existentes: string[]): string {
  if (!existentes.includes(base)) return base
  let n = 2
  while (existentes.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}
