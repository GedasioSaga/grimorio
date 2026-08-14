import { create } from 'zustand'
import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import { ROTULO_TIPO, pastasDaSecao, type TipoTransformacao } from '../lib/transformarImagem'
import { filtrarPorNome } from '../lib/buscaArvore'
import { versaoAtivaPersonagem } from '../lib/personagemVersao'
import { versaoAtiva } from '../lib/cenarioVersao'
import { urlRetrato } from '../lib/urlRetrato'
import { useMiniaturas } from '../state/miniaturas'
import { CardRetrato } from './CardRetrato'
import type { Cenario, Personagem } from '../lib/types'

// Espelha dialogos.tsx/dialogoCampanhas.tsx: a resolução vive no store (testável sem
// DOM); o Host só renderiza.
//
// v2: além de "criar novo" (fluxo v1, intocado), personagem e cenário ganham "existente
// (nova transformação)" — clonar a versão ativa de uma entidade já existente em vez de
// criar uma do zero. Item não tem versão, então continua só com "novo".

/** "Criar novo" preserva o formato v1; "existente" é a nova transformação numa entidade já criada. */
export type EscolhaTransformacao =
  | {
      modo: 'novo'
      tipo: TipoTransformacao
      /** Pasta existente escolhida; com novaPasta, é o PAI onde ela será criada. */
      dir: string
      /** Nome de subpasta a criar dentro de dir antes de criar a entidade. */
      novaPasta?: string
    }
  | {
      modo: 'existente'
      tipo: 'personagem' | 'cenario'
      id: string
    }

interface PedidoTransformar {
  resolver: (r: EscolhaTransformacao | null) => void
}

interface DialogoTransformarState {
  pedido: PedidoTransformar | null
  pedir(): Promise<EscolhaTransformacao | null>
  responder(r: EscolhaTransformacao | null): void
}

export const useDialogoTransformar = create<DialogoTransformarState>((set, get) => ({
  pedido: null,
  pedir: () =>
    new Promise<EscolhaTransformacao | null>((resolver) => {
      // pedido pendente (não deveria: modal bloqueia) resolve como cancelado antes
      // de abrir o novo — evita promise pendurada
      const anterior = get().pedido
      if (anterior) anterior.resolver(null)
      set({ pedido: { resolver } })
    }),
  responder: (r) => {
    const pedido = get().pedido
    if (!pedido) return
    set({ pedido: null })
    pedido.resolver(r)
  },
}))

/** Pergunta como transformar a imagem (novo ou existente) e em quê. Resolve null se cancelar. */
export function pedirTransformacao(): Promise<EscolhaTransformacao | null> {
  return useDialogoTransformar.getState().pedir()
}

const TIPOS: TipoTransformacao[] = ['personagem', 'cenario', 'item']

interface Candidato {
  id: string
  nome: string
  retrato: string | null
}

/** Candidatos "existente" do tipo — id/nome/retrato da versão ativa. */
function candidatosDoTipo(tipo: TipoTransformacao, personagens: Record<string, Personagem>, cenarios: Record<string, Cenario>): Candidato[] {
  if (tipo === 'personagem') {
    return Object.values(personagens).map((p) => ({ id: p.id, nome: p.nome, retrato: versaoAtivaPersonagem(p).retrato }))
  }
  if (tipo === 'cenario') {
    return Object.values(cenarios).map((c) => ({ id: c.id, nome: c.nome, retrato: versaoAtiva(c).retrato }))
  }
  return []
}

/** Passo derivado do estado — sem duplicar em outro useState. Item pula direto pra 'novo': não tem versão. */
type Passo = 'tipo' | 'modo' | 'existente' | 'novo'
function passoAtual(tipo: TipoTransformacao | null, modo: 'novo' | 'existente' | null): Passo {
  if (!tipo) return 'tipo'
  if (tipo !== 'item' && modo === null) return 'modo'
  if (modo === 'existente') return 'existente'
  return 'novo'
}

/** Montado uma vez perto da raiz. Renderiza o modal quando há um pedido aberto. */
export function HostDialogoTransformar() {
  const pedido = useDialogoTransformar((s) => s.pedido)
  const responder = useDialogoTransformar((s) => s.responder)
  const tree = useApp((s) => s.tree)
  const personagens = useApp((s) => s.personagens)
  const cenarios = useApp((s) => s.cenarios)
  const caminhoCenarioPorId = useApp((s) => s.caminhoCenarioPorId)
  const vaultPath = useApp((s) => s.vaultPath)
  const miniaturas = useMiniaturas((s) => s.ligadas)

  const [tipo, setTipo] = useState<TipoTransformacao | null>(null)
  const [modo, setModo] = useState<'novo' | 'existente' | null>(null)
  const [buscaExistente, setBuscaExistente] = useState('')
  const [dir, setDir] = useState<string | null>(null)
  const [criandoPasta, setCriandoPasta] = useState(false)
  const [novaPasta, setNovaPasta] = useState('')
  const [buscaPai, setBuscaPai] = useState('')
  const [paiId, setPaiId] = useState<string | null>(null)

  // Estado de TODOS os passos depois de "tipo" — chamado sempre que `tipo` muda (inclusive
  // voltando pra escolha de tipo) e nos "Voltar" de cada passo seguinte. Sem isso, estado de
  // uma escolha anterior (dir de cenário, modo, busca) sobrevive à troca e ou trava o modal
  // num passo que não bate com o tipo atual, ou vaza pra pasta errada do cofre.
  function resetarPassosSeguintes() {
    setModo(null)
    setBuscaExistente('')
    setDir(null)
    setCriandoPasta(false)
    setNovaPasta('')
    setBuscaPai('')
    setPaiId(null)
  }

  useEffect(() => {
    if (pedido) {
      setTipo(null)
      resetarPassosSeguintes()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido])

  useEffect(() => {
    if (!pedido) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') responder(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pedido, responder])

  if (!pedido) return null

  const passo = passoAtual(tipo, modo)
  const pastas = tipo ? pastasDaSecao(tree, tipo) : []
  const dirAtual = dir ?? pastas[0]?.caminho ?? null

  // "Dentro do cenário": escolher um pai faz o novo nascer como subcenário dele — o dir
  // vira o do PRÓPRIO cenário (não uma pasta organizacional), e substitui a escolha acima.
  const candidatosPai = tipo === 'cenario'
    ? Object.values(cenarios)
        .filter((c) => caminhoCenarioPorId[c.id])
        .map((c) => ({ id: c.id, nome: c.nome, dir: caminhoCenarioPorId[c.id] }))
    : []
  const paiSelecionado = paiId ? candidatosPai.find((c) => c.id === paiId) ?? null : null
  const dirFinal = paiSelecionado ? paiSelecionado.dir : dirAtual

  function submeterNovo() {
    if (!tipo || !dirFinal) return
    responder({ modo: 'novo', tipo, dir: dirFinal, novaPasta: novaPasta.trim() || undefined })
  }

  const retratoUrl = (c: Candidato) => (miniaturas ? urlRetrato(vaultPath, c.retrato, c.id) : null)

  return (
    <div className="modal-overlay" onClick={() => responder(null)}>
      <div className="dialogo-caixa" onClick={(e) => e.stopPropagation()}>
        {passo === 'tipo' && (
          <>
            <label className="dialogo-titulo">Transformar imagem em:</label>
            <div className="dialogo-botoes">
              {TIPOS.map((t) => (
                <button key={t} className="dialogo-ok" onClick={() => { resetarPassosSeguintes(); setTipo(t) }}>
                  {ROTULO_TIPO[t]}
                </button>
              ))}
            </div>
            <div className="dialogo-botoes">
              <button onClick={() => responder(null)}>Cancelar</button>
            </div>
          </>
        )}

        {passo === 'modo' && tipo && (
          <>
            <label className="dialogo-titulo">{`${ROTULO_TIPO[tipo]}: criar novo ou já existente?`}</label>
            <div className="dialogo-botoes">
              <button className="dialogo-ok" onClick={() => setModo('novo')}>Criar novo</button>
              <button className="dialogo-ok" onClick={() => setModo('existente')}>
                Existente (nova transformação)
              </button>
            </div>
            <div className="dialogo-botoes">
              <button onClick={() => { resetarPassosSeguintes(); setTipo(null) }}>Voltar</button>
              <button onClick={() => responder(null)}>Cancelar</button>
            </div>
          </>
        )}

        {passo === 'existente' && tipo && (tipo === 'personagem' || tipo === 'cenario') && (
          <>
            <label className="dialogo-titulo">{`${ROTULO_TIPO[tipo]} existente — nova transformação`}</label>
            <input
              className="dialogo-input"
              autoFocus
              placeholder="Buscar…"
              value={buscaExistente}
              onChange={(e) => setBuscaExistente(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.stopPropagation(); setBuscaExistente('') }
              }}
            />
            <div className="dialogo-lista">
              {filtrarPorNome(candidatosDoTipo(tipo, personagens, cenarios), buscaExistente).map((c) => (
                <button
                  key={c.id}
                  className="dialogo-lista-item dialogo-lista-item-clicavel"
                  onClick={() => responder({ modo: 'existente', tipo, id: c.id })}
                >
                  <CardRetrato
                    className="dialogo-retrato-mini"
                    src={retratoUrl(c)}
                    alt=""
                    fallback={<span>{tipo === 'personagem' ? '👤' : '🏞️'}</span>}
                  />
                  {c.nome}
                </button>
              ))}
              {buscaExistente.trim() && filtrarPorNome(candidatosDoTipo(tipo, personagens, cenarios), buscaExistente).length === 0 && (
                <div className="dialogo-vazio">Nada encontrado.</div>
              )}
            </div>
            <div className="dialogo-botoes">
              <button onClick={() => resetarPassosSeguintes()}>Voltar</button>
              <button onClick={() => responder(null)}>Cancelar</button>
            </div>
          </>
        )}

        {passo === 'novo' && tipo && (
          <>
            <label className="dialogo-titulo">{`Onde criar o ${ROTULO_TIPO[tipo].toLowerCase()}?`}</label>
            <div className="dialogo-lista">
              {pastas.map((p) => (
                <label
                  key={p.caminho}
                  className="dialogo-lista-item"
                  style={{ paddingLeft: 8 + p.nivel * 16 }}
                >
                  <input
                    type="radio"
                    name="pasta-transformar"
                    checked={!paiSelecionado && dirAtual === p.caminho}
                    onChange={() => { setDir(p.caminho); setPaiId(null) }}
                  />
                  {p.nivel === 0 ? `${p.nome} (raiz)` : p.nome}
                </label>
              ))}
            </div>
            {!criandoPasta ? (
              <button className="dialogo-nova-pasta" onClick={() => setCriandoPasta(true)}>
                📁+ Nova pasta…
              </button>
            ) : (
              <input
                className="dialogo-input"
                autoFocus
                placeholder={`Nome da nova pasta em "${pastas.find((p) => p.caminho === dirAtual)?.nome ?? ''}"`}
                value={novaPasta}
                onChange={(e) => setNovaPasta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation()
                    setCriandoPasta(false)
                    setNovaPasta('')
                  } else if (e.key === 'Enter' && dirFinal) {
                    submeterNovo()
                  }
                }}
              />
            )}
            {tipo === 'cenario' && (
              <div className="dialogo-subcenario">
                <label className="dialogo-titulo-sub">Dentro do cenário (opcional):</label>
                <input
                  className="dialogo-input"
                  placeholder="Buscar cenário…"
                  value={buscaPai}
                  onChange={(e) => { setBuscaPai(e.target.value); setPaiId(null) }}
                />
                {buscaPai.trim() && (
                  <div className="dialogo-lista">
                    {filtrarPorNome(candidatosPai, buscaPai).map((c) => (
                      <label key={c.id} className="dialogo-lista-item">
                        <input
                          type="radio"
                          name="cenario-pai-transformar"
                          checked={paiId === c.id}
                          onChange={() => setPaiId(c.id)}
                        />
                        {c.nome}
                      </label>
                    ))}
                    {filtrarPorNome(candidatosPai, buscaPai).length === 0 && (
                      <div className="dialogo-vazio">Nada encontrado.</div>
                    )}
                  </div>
                )}
                {paiSelecionado && (
                  <div className="dialogo-pai-escolhido">
                    Nascerá como subcenário de "{paiSelecionado.nome}".
                    <button onClick={() => { setPaiId(null); setBuscaPai('') }}>✕</button>
                  </div>
                )}
              </div>
            )}
            <div className="dialogo-botoes">
              <button onClick={() => { resetarPassosSeguintes(); if (tipo === 'item') setTipo(null) }}>Voltar</button>
              <button onClick={() => responder(null)}>Cancelar</button>
              <button className="dialogo-ok" disabled={!dirFinal} onClick={submeterNovo}>
                Criar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
