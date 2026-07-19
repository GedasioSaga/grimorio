/** Temas escuros do Grimório. `id` casa com o seletor CSS [data-tema] em theme.css. */
export const TEMAS = [
  { id: 'atual', nome: 'Atual', fundo: '#16120e', destaque: '#d4b878' },
  { id: 'dark', nome: 'Dark', fundo: '#121316', destaque: '#c3d2e0' },
  { id: 'azul', nome: 'Dark Blue', fundo: '#0d1524', destaque: '#93bdf0' },
] as const

export type TemaId = (typeof TEMAS)[number]['id']

const CHAVE = 'grimorio.tema'
const PADRAO: TemaId = 'atual'

/** Tema salvo (ou o padrão se ausente/inválido). */
export function temaSalvo(): TemaId {
  const s = localStorage.getItem(CHAVE)
  return TEMAS.some((t) => t.id === s) ? (s as TemaId) : PADRAO
}

/** Aplica o tema (atributo no <html>) e persiste. 'atual' cai no :root sem bloco próprio. */
export function aplicarTema(id: TemaId): void {
  document.documentElement.dataset.tema = id
  localStorage.setItem(CHAVE, id)
}
