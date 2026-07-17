import { useState } from 'react'
import { ask, message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import type { ItemRef, PastaNode } from '../lib/types'
import { pedirTexto } from './dialogos'

const RAIZ = 'personagens-soltos'
const MIME = 'application/x-grimorio-personagem'

async function comAviso(acao: () => Promise<void>) {
  try {
    await acao()
  } catch (e) {
    await message(`Operação falhou: ${e}`, { title: 'Grimório', kind: 'error' })
  }
}

/** Move o personagem (por id) para um diretório, resolvendo o caminho pelo cache do store. */
async function moverPara(dirDestino: string, id: string, aoMudar: () => Promise<void>) {
  const repo = useApp.getState().repo
  const caminho = useApp.getState().caminhoPorId[id]
  if (!repo || !caminho) return
  await comAviso(async () => {
    await repo.moverPersonagem(caminho, dirDestino)
    await aoMudar()
  })
}

function aceitaPersonagem(e: React.DragEvent) {
  if (e.dataTransfer.types.includes(MIME)) {
    e.preventDefault()
    e.stopPropagation()
  }
}

/** Seção raiz "Personagens" (fora de campanha). */
export function PersonagensSoltos({ raiz, aoMudar, ocultos = 0, aoMostrarTodos }: {
  raiz: PastaNode
  aoMudar: () => Promise<void>
  /** quantos o filtro de campanha escondeu (aviso honesto em vez de "sem personagens") */
  ocultos?: number
  aoMostrarTodos?: () => void
}) {
  const repo = useApp((s) => s.repo)

  async function novaPasta() {
    const nome = await pedirTexto('Nome da pasta:')
    if (!nome || !repo) return
    await comAviso(async () => { await repo.criarPasta(RAIZ, nome); await aoMudar() })
  }
  async function novoPersonagem() {
    const nome = await pedirTexto('Nome do personagem:')
    if (!nome || !repo) return
    await comAviso(async () => {
      const ref = await repo.criarPersonagemEm(RAIZ, nome)
      // sob filtro ativo, já vincula à campanha filtrada — senão nasceria oculto
      useApp.getState().vincularAoFiltro('personagem', ref.id)
      await aoMudar()
    })
  }

  return (
    <div
      className="sidebar-section"
      onDragOver={aceitaPersonagem}
      onDrop={(e) => { const id = e.dataTransfer.getData(MIME); if (id) void moverPara(RAIZ, id, aoMudar) }}
    >
      <div className="sidebar-section-header">
        <span>Personagens</span>
        <span>
          <button className="btn-icon" title="Nova pasta" onClick={novaPasta}>📁+</button>
          <button className="btn-icon" title="Novo personagem" onClick={novoPersonagem}>+</button>
        </span>
      </div>
      {ocultos > 0 && aoMostrarTodos && (
        <button className="filtro-ocultos" onClick={aoMostrarTodos}>
          {ocultos} {ocultos === 1 ? 'personagem oculto' : 'personagens ocultos'} pelo filtro — mostrar todos
        </button>
      )}
      {raiz.subpastas.map((p) => <PastaLinha key={p.caminho} pasta={p} nivel={0} aoMudar={aoMudar} />)}
      {raiz.personagens.map((pr) => <PersonagemLinha key={pr.caminho} item={pr} nivel={0} aoMudar={aoMudar} />)}
      {raiz.subpastas.length === 0 && raiz.personagens.length === 0 && (
        <div className="rail-vazio">Sem personagens aqui. Crie ou arraste pra cá.</div>
      )}
    </div>
  )
}

function PastaLinha({ pasta, nivel, aoMudar }: { pasta: PastaNode; nivel: number; aoMudar: () => Promise<void> }) {
  const repo = useApp((s) => s.repo)
  const [aberta, setAberta] = useState(true)

  async function criar(tipo: 'pasta' | 'personagem') {
    const nome = await pedirTexto(tipo === 'pasta' ? 'Nome da subpasta:' : 'Nome do personagem:')
    if (!nome || !repo) return
    await comAviso(async () => {
      if (tipo === 'pasta') {
        await repo.criarPasta(pasta.caminho, nome)
      } else {
        const ref = await repo.criarPersonagemEm(pasta.caminho, nome)
        useApp.getState().vincularAoFiltro('personagem', ref.id)
      }
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
    await comAviso(async () => { await repo.excluirItem(pasta.caminho); await aoMudar() })
  }

  return (
    <div className="rail-node">
      <div
        className="rail-linha"
        style={{ paddingLeft: 8 + nivel * 14 }}
        onClick={() => setAberta(!aberta)}
        onDragOver={aceitaPersonagem}
        onDrop={(e) => { e.stopPropagation(); const id = e.dataTransfer.getData(MIME); if (id) void moverPara(pasta.caminho, id, aoMudar) }}
        title={pasta.nome}
      >
        <span className="chevron">{aberta ? '▾' : '▸'}</span>
        <span className="rail-titulo">📁 {pasta.nome}</span>
        <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon" title="Novo personagem" onClick={() => void criar('personagem')}>+</button>
          <button className="btn-icon" title="Nova subpasta" onClick={() => void criar('pasta')}>📁</button>
          <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
          <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
        </span>
      </div>
      {aberta && (
        <>
          {pasta.subpastas.map((p) => <PastaLinha key={p.caminho} pasta={p} nivel={nivel + 1} aoMudar={aoMudar} />)}
          {pasta.personagens.map((pr) => <PersonagemLinha key={pr.caminho} item={pr} nivel={nivel + 1} aoMudar={aoMudar} />)}
        </>
      )}
    </div>
  )
}

function PersonagemLinha({ item, nivel, aoMudar }: { item: ItemRef; nivel: number; aoMudar: () => Promise<void> }) {
  const repo = useApp((s) => s.repo)
  const abrirPerfil = useApp((s) => s.abrirPerfil)
  const caminhoPorId = useApp((s) => s.caminhoPorId)
  const id = Object.entries(caminhoPorId).find(([, cam]) => cam === item.caminho)?.[0]

  async function renomear(e: React.MouseEvent) {
    e.stopPropagation()
    const nome = await pedirTexto('Novo nome:', item.nome)
    if (!nome || !repo) return
    await comAviso(async () => { await repo.renomearItem(item.caminho, nome); await aoMudar() })
  }
  async function excluir(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    if (!(await ask(`Excluir "${item.nome}"?`, { title: 'Grimório', kind: 'warning' }))) return
    await comAviso(async () => { await repo.excluirItem(item.caminho); await aoMudar() })
  }

  return (
    <div
      className={`rail-linha ${item.erro ? 'item-erro' : ''}`}
      style={{ paddingLeft: 8 + nivel * 14 }}
      onClick={() => { if (!item.erro && id) abrirPerfil(id) }}
      draggable={!item.erro && !!id}
      onDragStart={(e) => { if (id) e.dataTransfer.setData(MIME, id) }}
      title={item.erro ? 'Arquivo com erro' : item.nome}
    >
      <span className="chevron-vazio" />
      <span className="rail-titulo">👤 {item.nome}{item.erro ? ' ⚠' : ''}</span>
      <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
        <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
        <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
      </span>
    </div>
  )
}
