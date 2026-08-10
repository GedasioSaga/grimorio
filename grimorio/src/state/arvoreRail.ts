import { create } from 'zustand'

export type SecaoRail = 'personagens' | 'cenarios' | 'itens'

const SECOES: SecaoRail[] = ['personagens', 'cenarios', 'itens']
const CHAVE = 'grimorio.railPadraoAberto'

type PorSecao = Record<SecaoRail, boolean>

/**
 * Só o PADRÃO de cada seção é persistido — as escolhas pasta a pasta ficam em memória.
 * Caminho de pasta é específico do cofre, e o Grimório troca de cofre: gravar chave por
 * caminho vazaria estado de um cofre no outro e viraria lixo ao renomear uma pasta.
 */
function padraoSalvo(): PorSecao {
  const base: PorSecao = { personagens: true, cenarios: true, itens: true }
  const bruto = localStorage.getItem(CHAVE)
  if (!bruto) return base
  try {
    const lido = JSON.parse(bruto)
    for (const s of SECOES) if (typeof lido?.[s] === 'boolean') base[s] = lido[s]
  } catch {
    // json corrompido: segue com tudo aberto em vez de estourar na montagem da sidebar
  }
  return base
}

interface ArvoreRailState {
  padrao: PorSecao
  /** caminho -> aberto. Ausente = segue o padrão da seção. */
  escolha: Record<SecaoRail, Record<string, boolean>>
  alternar(secao: SecaoRail, caminho: string): void
  /** Abre ou fecha a seção inteira: muda o padrão e descarta as escolhas manuais. */
  definirTodos(secao: SecaoRail, aberto: boolean): void
}

export const useArvoreRail = create<ArvoreRailState>((set, get) => ({
  padrao: padraoSalvo(),
  escolha: { personagens: {}, cenarios: {}, itens: {} },

  alternar(secao, caminho) {
    const { escolha, padrao } = get()
    const atual = escolha[secao][caminho] ?? padrao[secao]
    set({ escolha: { ...escolha, [secao]: { ...escolha[secao], [caminho]: !atual } } })
  },

  definirTodos(secao, aberto) {
    const { escolha, padrao: anterior } = get()
    const padrao = { ...anterior, [secao]: aberto }
    localStorage.setItem(CHAVE, JSON.stringify(padrao))
    set({ padrao, escolha: { ...escolha, [secao]: {} } })
  },
}))

/**
 * Estado de um nó. Seletor estreito de propósito: devolve booleano, então a pasta só
 * re-renderiza quando ela própria muda — abrir uma pasta não repinta as irmãs.
 */
export function useAberto(secao: SecaoRail, caminho: string): boolean {
  return useArvoreRail((s) => s.escolha[secao][caminho] ?? s.padrao[secao])
}
