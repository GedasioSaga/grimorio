import { create } from 'zustand'

/**
 * O item da faixa de acervo que está em foco, para o Ctrl+C copiar a imagem DELE e não a do
 * cenário.
 *
 * Store de módulo porque quem escreve é a faixa, dentro do card do tldraw, e quem lê é o
 * atalho de teclado registrado no editor (`atalhosCanvas.ts`) — não há componente em comum.
 * Vale só na sessão: foco não é dado do canvas.
 */
export interface FocoFaixa {
  /** id do shape `cenario-card` dono da faixa */
  shapeId: string
  itemId: string
}

interface FaixaItensFocoState {
  foco: FocoFaixa | null
  focar(foco: FocoFaixa): void
  limpar(): void
}

export const useFaixaItensFoco = create<FaixaItensFocoState>((set) => ({
  foco: null,
  focar: (foco) => set({ foco }),
  limpar: () => set({ foco: null }),
}))

/**
 * Item em foco no card `shapeId`, ou null. O Ctrl+C só usa o foco quando o card selecionado
 * é o dono dele; foco de outro card não vale.
 */
export function itemEmFocoNoCard(shapeId: string | null | undefined): string | null {
  const { foco } = useFaixaItensFoco.getState()
  return foco && shapeId && foco.shapeId === shapeId ? foco.itemId : null
}
