import { create } from 'zustand'
import { useEffect } from 'react'
import { SeletorTema } from './SeletorTema'
import { OpcoesCofre } from './OpcoesCofre'
import { OpcoesIA } from './OpcoesIA'
import { OpcoesNuvem } from './OpcoesNuvem'
import { OpcoesLixeira } from './OpcoesLixeira'
import { useMiniaturas } from '../state/miniaturas'
import { usePrefixoCenario } from '../state/prefixoCenario'

export type AbaOpcoes = 'cofre' | 'nuvem' | 'aparencia' | 'ia' | 'lixeira'

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
  { id: 'lixeira', rotulo: 'Lixeira' },
]

/** Liga/desliga a miniatura do retrato nas listas de itens, personagens e cenários. */
function SeletorMiniaturas() {
  const ligadas = useMiniaturas((s) => s.ligadas)
  const alternar = useMiniaturas((s) => s.alternar)

  return (
    <label className="opcoes-alternador">
      <input type="checkbox" checked={ligadas} onChange={(e) => alternar(e.target.checked)} />
      <span>
        Mostrar miniatura da imagem
        <small>Desligado, cada linha volta ao ícone: 💎 itens, 🗺 cenários, 👤 personagens.</small>
      </span>
    </label>
  )
}

/** Liga/desliga o corte do prefixo do pai no nome dos sub-cenários da árvore. */
function SeletorPrefixoCenario() {
  const ocultar = usePrefixoCenario((s) => s.ocultar)
  const alternar = usePrefixoCenario((s) => s.alternar)

  return (
    <label className="opcoes-alternador">
      <input type="checkbox" checked={ocultar} onChange={(e) => alternar(e.target.checked)} />
      <span>
        Encurtar nome de sub-cenário na árvore
        <small>“Reino de Goa: Castelo” dentro de “Reino de Goa” aparece como “Castelo”. O nome completo continua no arquivo, na busca e ao passar o mouse.</small>
      </span>
    </label>
  )
}

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
          {aba === 'nuvem' && <OpcoesNuvem onFechar={fechar} />}
          {aba === 'aparencia' && (
            <>
              <div className="opcoes-secao">
                <h3>Tema</h3>
                <SeletorTema />
              </div>
              <div className="opcoes-secao">
                <h3>Listas laterais</h3>
                <SeletorMiniaturas />
                <SeletorPrefixoCenario />
              </div>
            </>
          )}
          {aba === 'ia' && <OpcoesIA />}
          {aba === 'lixeira' && <OpcoesLixeira />}
        </div>
      </div>
    </div>
  )
}
