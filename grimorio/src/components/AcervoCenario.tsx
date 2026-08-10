import { useState } from 'react'
import { message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import type { ItemNoCenario } from '../lib/types'
import { acervoVivo, adicionarAoAcervo, definirQtd, removerDoAcervo, type AtualizadorAcervo } from '../lib/acervoCenario'
import { associarNaCriacao } from './dialogoCampanhas'

const RAIZ = 'itens'
const MAX_CANDIDATOS = 8

/**
 * Itens de verdade presentes nesta versão do cenário. Fica ACIMA do texto livre da aba:
 * o chip é referência (abre a ficha, some se o item for excluído), o texto continua
 * sendo o rascunho de quem não quer cadastrar nada.
 */
export function AcervoCenario({ acervo, onChange }: {
  acervo: ItemNoCenario[]
  onChange: (mudanca: AtualizadorAcervo) => void
}) {
  const itens = useApp((s) => s.itens)
  const repo = useApp((s) => s.repo)
  const abrirItem = useApp((s) => s.abrirItem)
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)

  const vivos = acervoVivo(acervo, itens)
  const termo = busca.trim()
  const termoLower = termo.toLowerCase()
  const candidatos = termo
    ? Object.values(itens)
        .filter((i) => i.nome.toLowerCase().includes(termoLower) && !acervo.some((a) => a.itemId === i.id))
        .slice(0, MAX_CANDIDATOS)
    : []
  // nome idêntico já cadastrado: oferecer "criar" seria convidar a duplicata
  const nomeJaExiste = Object.values(itens).some((i) => i.nome.toLowerCase() === termoLower)

  function vincular(itemId: string) {
    onChange((atual) => adicionarAoAcervo(atual, itemId))
    setBusca('')
  }

  async function criarEVincular() {
    if (!repo || !termo || criando) return
    setCriando(true)
    try {
      const ref = await repo.criarItemEm(RAIZ, termo)
      await associarNaCriacao('item', ref.id, termo, RAIZ)
      const { recarregarArvore, carregarItens } = useApp.getState()
      await recarregarArvore()
      await carregarItens() // sem isto o item novo não está no cache e o chip nasceria órfão
      // updater, não o `acervo` capturado no início: a associação de campanha (modal) e os
      // recarregamentos acima dão tempo do usuário mexer no acervo concorrentemente
      vincular(ref.id)
    } catch (e) {
      await message(`Falha ao criar o item: ${e}`, { title: 'Grimório', kind: 'error' })
    } finally {
      setCriando(false)
    }
  }

  return (
    <div className="cenario-acervo">
      <div className="grupo-titulo">Itens do acervo</div>
      <div className="cenario-chips">
        {vivos.map((a) => (
          <span key={a.itemId} className="cenario-chip">
            <input
              className="acervo-qtd"
              type="number"
              min={1}
              placeholder="1"
              title="Quantidade (vazio = único)"
              value={a.qtd ?? ''}
              onChange={(e) => onChange(definirQtd(acervo, a.itemId, e.target.value === '' ? undefined : Number(e.target.value)))}
            />
            <button className="cenario-chip-nome" title="Abrir a ficha do item" onClick={() => abrirItem(a.itemId)}>
              💎 {itens[a.itemId].nome}
            </button>
            <button
              className="cenario-chip-x"
              title="Tirar do cenário (não exclui o item)"
              onClick={() => onChange(removerDoAcervo(acervo, a.itemId))}
            >
              ×
            </button>
          </span>
        ))}
        {vivos.length === 0 && <p className="galeria-vazia">Nenhum item do acervo neste cenário.</p>}
      </div>
      <div className="cenario-vincular">
        <input
          placeholder="+ Adicionar item do acervo (busque pelo nome)…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || candidatos.length === 0) return
            const exato = candidatos.find((i) => i.nome.toLowerCase() === termoLower)
            vincular((exato ?? candidatos[0]).id)
          }}
        />
        {candidatos.map((i) => (
          <button
            key={i.id}
            className="cenario-sub-item"
            onClick={() => vincular(i.id)}
          >
            💎 {i.nome}
          </button>
        ))}
        {termo && !nomeJaExiste && (
          <button className="cenario-sub-item acervo-criar" disabled={criando} onClick={() => void criarEVincular()}>
            {criando ? 'Criando…' : `+ Criar “${termo}” no acervo`}
          </button>
        )}
      </div>
    </div>
  )
}
