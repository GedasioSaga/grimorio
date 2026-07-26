import { create } from 'zustand'
import { TEMAS, aplicarTema, temaSalvo, type TemaId } from '../lib/tema'

// Estado em nível de módulo, não useState: com estado por instância, duas instâncias
// vivas dessincronizam — trocar o tema numa deixa a outra destacando o swatch antigo
// até remontar. Hoje só a aba Aparência monta o seletor, então isto é seguro por
// construção; fica compartilhado porque a aba Nuvem é a próxima a chegar nesta mesma
// tela, e redescobrir o bug depois custa mais do que estas poucas linhas.
const useTemaAtual = create<{ tema: TemaId; trocar(id: TemaId): void }>((set) => ({
  tema: temaSalvo(),
  trocar: (id) => {
    aplicarTema(id)
    set({ tema: id })
  },
}))

/** Três swatches: cada um prévia o fundo + a cor de destaque do tema. */
export function SeletorTema() {
  const tema = useTemaAtual((s) => s.tema)
  const trocar = useTemaAtual((s) => s.trocar)

  return (
    <span className="seletor-tema">
      {TEMAS.map((t) => (
        <button
          key={t.id}
          className={`tema-swatch${tema === t.id ? ' ativo' : ''}`}
          title={`Tema: ${t.nome}`}
          aria-label={`Tema ${t.nome}`}
          style={{ background: t.fundo }}
          onClick={() => trocar(t.id)}
        >
          <span className="tema-ponto" style={{ background: t.destaque }} />
        </button>
      ))}
    </span>
  )
}
