import { useState } from 'react'
import { useApp } from '../state/store'
import type { TipoEntidadeVinculo } from '../lib/types'
import { TIPOS_SUGERIDOS, campanhasDe, vinculosDaEntidade } from '../lib/vinculos'

const OUTRO = '__outro__'

interface Alvo {
  tipo: TipoEntidadeVinculo
  id: string
  nome: string
}

/**
 * Aba compartilhada de vínculos (PerfilModal e CenarioModal):
 * relações tipadas com outras entidades + participação em campanhas (chips).
 */
export function AbaVinculos({ entidadeTipo, entidadeId }: {
  entidadeTipo: TipoEntidadeVinculo
  entidadeId: string
}) {
  const vinculos = useApp((s) => s.vinculos)
  const personagens = useApp((s) => s.personagens)
  const cenarios = useApp((s) => s.cenarios)
  const tree = useApp((s) => s.tree)
  const adicionar = useApp((s) => s.adicionarVinculo)
  const remover = useApp((s) => s.removerVinculo)
  const alternarParticipacao = useApp((s) => s.alternarParticipacao)

  const [busca, setBusca] = useState('')
  const [alvo, setAlvo] = useState<Alvo | null>(null)
  const [tipoSel, setTipoSel] = useState(TIPOS_SUGERIDOS[0])
  const [tipoLivre, setTipoLivre] = useState('')
  const [nota, setNota] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const nomeDe = (id: string) => personagens[id]?.nome ?? cenarios[id]?.nome ?? null

  // vínculos da entidade com a outra ponta ainda viva (órfãos somem da exibição)
  const relacoes = vinculosDaEntidade(vinculos, entidadeId).filter((v) => {
    const outra = v.deId === entidadeId ? v.paraId : v.deId
    return nomeDe(outra) !== null
  })

  // candidatos do autocomplete: personagens + cenários, exclui a própria entidade
  const termo = busca.trim().toLowerCase()
  const candidatos: Alvo[] = termo
    ? [
        ...Object.values(personagens).map((p) => ({ tipo: 'personagem' as const, id: p.id, nome: p.nome })),
        ...Object.values(cenarios).map((c) => ({ tipo: 'cenario' as const, id: c.id, nome: c.nome })),
      ]
        .filter((e) => e.id !== entidadeId && e.nome.toLowerCase().includes(termo))
        .slice(0, 8)
    : []

  const campanhas = (tree?.campanhas ?? []).filter((c) => c.id)
  const participaDe = campanhasDe(vinculos, entidadeId)

  function adicionarRelacao() {
    const tipo = (tipoSel === OUTRO ? tipoLivre : tipoSel).trim()
    if (!alvo || !tipo) return
    const ok = adicionar({
      deTipo: entidadeTipo, deId: entidadeId,
      paraTipo: alvo.tipo, paraId: alvo.id,
      tipo, notas: nota.trim(),
    })
    if (!ok) { setAviso('Esse vínculo já existe.'); return }
    setAviso(null)
    // tipoSel fica como está de propósito: facilita adicionar várias relações do mesmo tipo
    setBusca(''); setAlvo(null); setTipoLivre(''); setNota('')
  }

  return (
    <div className="vinculos-aba">
      <div className="vinculos-secao-titulo">Relações</div>
      {relacoes.length === 0 && <div className="vinculos-vazio">Sem relações ainda.</div>}
      {relacoes.map((v) => {
        const souDe = v.deId === entidadeId
        const outraId = souDe ? v.paraId : v.deId
        return (
          <div key={v.id} className="vinculo-linha">
            <span className="vinculo-texto">
              {souDe
                ? <><em>{v.tipo}</em> → {nomeDe(outraId)}</>
                : <>{nomeDe(outraId)} → <em>{v.tipo}</em></>}
              {v.notas && <span className="vinculo-nota"> — {v.notas}</span>}
            </span>
            <button className="btn-icon" title="Remover vínculo" onClick={() => remover(v.id)}>✕</button>
          </div>
        )
      })}

      {aviso && <div className="vinculos-aviso">{aviso}</div>}
      <div className="vinculo-form">
        <input
          placeholder="Buscar personagem ou cenário…"
          value={alvo ? alvo.nome : busca}
          onChange={(e) => { setAviso(null); setAlvo(null); setBusca(e.target.value) }}
        />
        {!alvo && candidatos.length > 0 && (
          <div className="vinculo-busca-lista">
            {candidatos.map((c) => (
              <button type="button" key={c.id} className="vinculo-busca-item" onClick={() => { setAviso(null); setAlvo(c) }}>
                {c.tipo === 'personagem' ? '👤' : '🗺'} {c.nome}
              </button>
            ))}
          </div>
        )}
        {!alvo && termo && candidatos.length === 0 && (
          <div className="vinculos-vazio">Nenhuma entidade encontrada.</div>
        )}
        <div className="vinculo-form-linha">
          <select value={tipoSel} onChange={(e) => { setAviso(null); setTipoSel(e.target.value) }}>
            {TIPOS_SUGERIDOS.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value={OUTRO}>outro…</option>
          </select>
          {tipoSel === OUTRO && (
            <input placeholder="tipo livre" value={tipoLivre} onChange={(e) => { setAviso(null); setTipoLivre(e.target.value) }} />
          )}
          <input placeholder="nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
          <button disabled={!alvo || (tipoSel === OUTRO && !tipoLivre.trim())} onClick={adicionarRelacao}>
            Adicionar
          </button>
        </div>
      </div>

      <div className="vinculos-secao-titulo">Campanhas</div>
      {campanhas.length === 0 && <div className="vinculos-vazio">Nenhuma campanha criada.</div>}
      <div className="vinculo-chips">
        {campanhas.map((c) => {
          const ativo = participaDe.includes(c.id)
          return (
            <button
              key={c.id}
              className={`campanha-chip${ativo ? ' ativo' : ''}`}
              aria-pressed={ativo}
              title={ativo ? `Remover de ${c.nome}` : `Participar de ${c.nome}`}
              onClick={() => alternarParticipacao(entidadeTipo, entidadeId, c.id)}
            >
              {c.nome}
            </button>
          )
        })}
      </div>
    </div>
  )
}
