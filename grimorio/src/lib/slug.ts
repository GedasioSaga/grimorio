export function slugify(nome: string): string {
  const s = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (combining diacritics)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'sem-nome'
}

export function slugUnico(base: string, existentes: string[]): string {
  if (!existentes.includes(base)) return base
  let n = 2
  while (existentes.includes(`${base}-${n}`)) n++
  return `${base}-${n}`
}
