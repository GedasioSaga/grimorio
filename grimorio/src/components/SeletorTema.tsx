import { create } from 'zustand'
import { TEMAS, aplicarTema, temaSalvo, type TemaId } from '../lib/tema'

// Estado em nível de módulo, não useState: há DUAS instâncias vivas do seletor (a da
// barra lateral e a da aba Aparência). Com estado por instância, trocar o tema numa
// delas deixava a outra destacando o swatch antigo até remontar — e a da sidebar
// nunca remonta.
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
