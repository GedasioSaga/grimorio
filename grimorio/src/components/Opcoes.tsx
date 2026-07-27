import { create } from 'zustand'
import { useEffect } from 'react'
import { SeletorTema } from './SeletorTema'
import { OpcoesCofre } from './OpcoesCofre'
import { OpcoesIA } from './OpcoesIA'
import { OpcoesNuvem } from './OpcoesNuvem'

export type AbaOpcoes = 'cofre' | 'nuvem' | 'aparencia' | 'ia'

interface OpcoesState {
  aberto: boolean
  aba: AbaOpcoes
  abrir(aba?: AbaOpcoes): void
  fechar(): void
  setAba(aba: AbaOpcoes): void
}

export const useOpcoes = create<OpcoesState>((set) => ({
  aberto: false,
  aba: 'cofre',
  abrir: (aba = 'cofre') => set({ aberto: true, aba }),
  fechar: () => set({ aberto: false }),
  setAba: (aba) => set({ aba }),
}))

const ABAS: { id: AbaOpcoes; rotulo: string }[] = [
  { id: 'cofre', rotulo: 'Cofre' },
  { id: 'nuvem', rotulo: 'Nuvem' },
  { id: 'aparencia', rotulo: 'Aparência' },
  { id: 'ia', rotulo: 'IA' },
]

/** Montado uma vez perto da raiz, como HostDialogos. */
export function HostOpcoes() {
  const aberto = useOpcoes((s) => s.aberto)
  const aba = useOpcoes((s) => s.aba)
  const setAba = useOpcoes((s) => s.setAba)
  const fechar = useOpcoes((s) => s.fechar)

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [aberto, fechar])

  if (!aberto) return null

  return (
    <div className="modal-overlay" onClick={fechar}>
      <div className="opcoes-modal" onClick={(e) => e.stopPropagation()}>
        <nav className="opcoes-abas">
          {ABAS.map((a) => (
            <button
              key={a.id}
              className={`opcoes-aba${aba === a.id ? ' ativa' : ''}`}
              onClick={() => setAba(a.id)}
            >
              {a.rotulo}
            </button>
          ))}
        </nav>
        <div className="opcoes-conteudo">
          <button className="btn-icon opcoes-fechar" title="Fechar" onClick={fechar}>✕</button>
          {aba === 'cofre' && <OpcoesCofre onFechar={fechar} />}
          {aba === 'nuvem' && <OpcoesNuvem />}
          {aba === 'aparencia' && (
            <div className="opcoes-secao">
              <h3>Tema</h3>
              <SeletorTema />
            </div>
          )}
          {aba === 'ia' && <OpcoesIA />}
        </div>
      </div>
    </div>
  )
}
