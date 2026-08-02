import { useState } from 'react'
import { ask, message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import type { ItemRef, PastaItemNode } from '../lib/types'
import { buscarItens } from '../lib/buscaArvore'
import { contarItens } from '../lib/filtroCampanha'
import { pedirTexto } from './dialogos'
import { associarNaCriacao, editarCampanhas } from './dialogoCampanhas'
import { CaixaBusca } from './CaixaBusca'

const RAIZ = 'itens'
export const MIME_ITEM = 'application/x-grimorio-item'

async function comAviso(acao: () => Promise<void>) {
  try {
    await acao()
  } catch (e) {
    await message(`Operação falhou: ${e}`, { title: 'Grimório', kind: 'error' })
  }
}

/** Move o item (por id) para um diretório, resolvendo o caminho pelo cache do store. */
async function moverPara(dirDestino: string, id: string, aoMudar: () => Promise<void>) {
  const { repo, caminhoItemPorId } = useApp.getState()
  const caminho = caminhoItemPorId[id]
  if (!repo || !caminho) return
  await comAviso(async () => {
    await repo.moverItem(caminho, dirDestino)
    await aoMudar()
  })
}

function aceitaItem(e: React.DragEvent) {
  if (e.dataTransfer.types.includes(MIME_ITEM)) {
    e.preventDefault()
    e.stopPropagation()
  }
}

/** Seção raiz "Itens" da sidebar (fica abaixo de Cenários). */
export function ItensSoltos({ raiz, aoMudar, ocultos = 0, aoMostrarTodos }: {
  raiz: PastaItemNode
  aoMudar: () => Promise<void>
  /** quantos o filtro de campanha escondeu (aviso honesto em vez de "sem itens") */
  ocultos?: number
  aoMostrarTodos?: () => void
}) {
  const repo = useApp((s) => s.repo)
  const [busca, setBusca] = useState('')
  const achados = buscarItens(raiz, busca)
  const buscando = busca.trim().length > 0

  async function novaPasta() {
    const nome = await pedirTexto('Nome da pasta:')
    if (!nome || !repo) return
    await comAviso(async () => {
      const { id } = await repo.criarPasta(RAIZ, nome)
      await associarNaCriacao('pasta', id, nome, RAIZ)
      await aoMudar()
      setBusca('')
    })
  }
  async function novoItem() {
    const nome = await pedirTexto('Nome do item:')
    if (!nome || !repo) return
    await comAviso(async () => {
      const ref = await repo.criarItemEm(RAIZ, nome)
      // precedência: filtro ativo ganha; senão herda a campanha da pasta em que nasce; senão pergunta
      await associarNaCriacao('item', ref.id, nome, RAIZ)
      await aoMudar()
      // sem isto, criar "Espada" com "poção" na busca pareceria não ter criado nada
      setBusca('')
    })
  }

  return (
    <div
      className="sidebar-section"
      onDragOver={aceitaItem}
      onDrop={(e) => { const id = e.dataTransfer.getData(MIME_ITEM); if (id) void moverPara(RAIZ, id, aoMudar) }}
    >
      <div className="sidebar-section-header">
        <span>Itens</span>
        <span>
          <button className="btn-icon" title="Nova pasta" onClick={novaPasta}>📁+</button>
          <button className="btn-icon" title="Novo item" onClick={novoItem}>+</button>
        </span>
      </div>
      <CaixaBusca valor={busca} aoMudar={setBusca} achados={achados.length} total={contarItens(raiz)} />
      {ocultos > 0 && aoMostrarTodos && (
        <button className="filtro-ocultos" onClick={aoMostrarTodos}>
          {ocultos} {ocultos === 1 ? 'item oculto' : 'itens ocultos'} pelo filtro — mostrar todos
        </button>
      )}
      {buscando ? (
        achados.length === 0
          ? <div className="rail-vazio">Nada com “{busca.trim()}”.</div>
          : achados.map((a) => (
              <ItemLinha key={a.item.caminho} item={a.item} nivel={0} aoMudar={aoMudar}
                resultado={{ caminhoRotulo: a.caminhoRotulo }} />
            ))
      ) : (
        <>
          {raiz.subpastas.map((p) => <PastaItemLinha key={p.caminho} pasta={p} nivel={0} aoMudar={aoMudar} />)}
          {raiz.itens.map((i) => <ItemLinha key={i.caminho} item={i} nivel={0} aoMudar={aoMudar} />)}
          {raiz.subpastas.length === 0 && raiz.itens.length === 0 && (
            <div className="rail-vazio">Sem itens ainda. Crie ou arraste pra cá.</div>
          )}
        </>
      )}
    </div>
  )
}

function PastaItemLinha({ pasta, nivel, aoMudar }: { pasta: PastaItemNode; nivel: number; aoMudar: () => Promise<void> }) {
  const repo = useApp((s) => s.repo)
  const [aberta, setAberta] = useState(true)

  async function criar(tipo: 'pasta' | 'item') {
    const nome = await pedirTexto(tipo === 'pasta' ? 'Nome da subpasta:' : 'Nome do item:')
    if (!nome || !repo) return
    await comAviso(async () => {
      if (tipo === 'pasta') {
        const { id } = await repo.criarPasta(pasta.caminho, nome)
        await associarNaCriacao('pasta', id, nome, pasta.caminho)
      } else {
        const ref = await repo.criarItemEm(pasta.caminho, nome)
        await associarNaCriacao('item', ref.id, nome, pasta.caminho)
      }
      await aoMudar()
    })
  }
  async function campanhas(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    await comAviso(async () => {
      // pasta legada não tem id: nasce agora, no primeiro clique
      const id = pasta.id ?? (await repo.garantirIdDePasta(pasta.caminho))
      await editarCampanhas('pasta', id, pasta.nome)
      await aoMudar()
    })
  }
  async function renomear(e: React.MouseEvent) {
    e.stopPropagation()
    const nome = await pedirTexto('Novo nome da pasta:', pasta.nome)
    if (!nome || !repo) return
    await comAviso(async () => { await repo.renomearItem(`${pasta.caminho}/pasta.json`, nome); await aoMudar() })
  }
  async function excluir(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    if (!(await ask(`Excluir a pasta "${pasta.nome}" e tudo dentro dela?`, { title: 'Grimório', kind: 'warning' }))) return
    await comAviso(async () => {
      await repo.excluirItem(pasta.caminho)
      // sem isto o vínculo de campanha da pasta viraria órfão em vinculos.json
      if (pasta.id) useApp.getState().removerVinculosDe(pasta.id)
      await aoMudar()
    })
  }

  return (
    <div className="rail-node">
      <div
        className="rail-linha"
        style={{ paddingLeft: 8 + nivel * 14 }}
        onClick={() => setAberta(!aberta)}
        onDragOver={aceitaItem}
        onDrop={(e) => { e.stopPropagation(); const id = e.dataTransfer.getData(MIME_ITEM); if (id) void moverPara(pasta.caminho, id, aoMudar) }}
        title={pasta.nome}
      >
        <span className="chevron">{aberta ? '▾' : '▸'}</span>
        <span className="rail-titulo">📁 {pasta.nome}</span>
        <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon" title="Novo item" onClick={() => void criar('item')}>+</button>
          <button className="btn-icon" title="Nova subpasta" onClick={() => void criar('pasta')}>📁</button>
          <button className="btn-icon" title="Campanhas" onClick={campanhas}>🏷️</button>
          <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
          <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
        </span>
      </div>
      {aberta && (
        <>
          {pasta.subpastas.map((p) => <PastaItemLinha key={p.caminho} pasta={p} nivel={nivel + 1} aoMudar={aoMudar} />)}
          {pasta.itens.map((i) => <ItemLinha key={i.caminho} item={i} nivel={nivel + 1} aoMudar={aoMudar} />)}
        </>
      )}
    </div>
  )
}

function ItemLinha({ item, nivel, aoMudar, resultado }: {
  item: ItemRef; nivel: number; aoMudar: () => Promise<void>
  /** modo lista plana da busca: mostra a pasta ao lado e desliga o arrastar */
  resultado?: { caminhoRotulo: string }
}) {
  const repo = useApp((s) => s.repo)
  const abrirItem = useApp((s) => s.abrirItem)
  const caminhoItemPorId = useApp((s) => s.caminhoItemPorId)
  const id = Object.entries(caminhoItemPorId).find(([, cam]) => cam === item.caminho)?.[0]

  async function renomear(e: React.MouseEvent) {
    e.stopPropagation()
    const nome = await pedirTexto('Novo nome:', item.nome)
    if (!nome) return
    // item não tem nome-espelho de versão (diferente do personagem): grava direto no arquivo
    if (!repo) return
    await comAviso(async () => { await repo.renomearItem(item.caminho, nome); await aoMudar() })
  }
  async function excluir(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    if (!(await ask(`Excluir "${item.nome}"?`, { title: 'Grimório', kind: 'warning' }))) return
    await comAviso(async () => {
      await repo.excluirItem(item.caminho)
      // sem isto as relações do item viram órfãs em vinculos.json
      if (id) useApp.getState().removerVinculosDe(id)
      await aoMudar()
    })
  }

  return (
    <div
      className={`rail-linha ${item.erro ? 'item-erro' : ''}`}
      style={{ paddingLeft: 8 + nivel * 14 }}
      onClick={() => { if (!item.erro && id) abrirItem(id) }}
      // na busca não há pasta na tela: arrastar não teria alvo visível pra onde soltar
      draggable={!resultado && !item.erro && !!id}
      onDragStart={(e) => { if (id) e.dataTransfer.setData(MIME_ITEM, id) }}
      title={item.erro ? 'Arquivo com erro' : item.nome}
    >
      <span className="chevron-vazio" />
      <span className="rail-titulo">💎 {item.nome}{item.erro ? ' ⚠' : ''}</span>
      {resultado?.caminhoRotulo && <span className="rail-caminho">· {resultado.caminhoRotulo}</span>}
      <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
        {id && (
          <button className="btn-icon" title="Campanhas" onClick={(e) => { e.stopPropagation(); void editarCampanhas('item', id, item.nome) }}>🏷️</button>
        )}
        <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
        <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
      </span>
    </div>
  )
}
