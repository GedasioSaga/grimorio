import { useState } from 'react'
import { useApp } from '../state/store'
import type { TipoAberto } from '../state/store'
import type { CampanhaNode, ItemRef } from '../lib/types'
import { escritaDirDaCampanha } from '../lib/caminhos'
import { idsDaCampanha } from '../lib/vinculos'
import { filtrarArvoreCenarios, filtrarPastaPersonagens } from '../lib/filtroCampanha'
import { PersonagensSoltos } from './PersonagensSoltos'
import { CenariosSoltos } from './CenariosSoltos'

async function comAvisoDeErro(acao: () => Promise<void>) {
  try {
    await acao()
  } catch (e) {
    alert(`Operação falhou: ${e}`)
  }
}

export function Sidebar({ recolhida, onToggle }: { recolhida: boolean; onToggle: () => void }) {
  const tree = useApp((s) => s.tree)
  const repo = useApp((s) => s.repo)
  const recarregar = useApp((s) => s.recarregarArvore)
  const carregarPersonagens = useApp((s) => s.carregarPersonagens)
  const carregarCenarios = useApp((s) => s.carregarCenarios)
  const vinculos = useApp((s) => s.vinculos)
  const campanhaFiltro = useApp((s) => s.campanhaFiltro)
  const setCampanhaFiltro = useApp((s) => s.setCampanhaFiltro)
  const caminhoPorId = useApp((s) => s.caminhoPorId)

  if (recolhida) {
    return (
      <aside className="sidebar recolhida">
        <button className="btn-icon" title="Expandir barra" onClick={onToggle}>›</button>
      </aside>
    )
  }

  async function novaCampanha() {
    const nome = prompt('Nome da campanha:')
    if (!nome || !repo) return
    await comAvisoDeErro(async () => {
      await repo.criarCampanha(nome)
      await recarregar()
    })
  }

  async function novoCanvasSolto() {
    const nome = prompt('Nome do canvas:')
    if (!nome || !repo) return
    await comAvisoDeErro(async () => {
      await repo.criarCanvasDoc('canvases-soltos', nome)
      await recarregar()
    })
  }

  if (!tree) return <aside className="sidebar">Carregando…</aside>

  // filtro validado contra a árvore ATUAL: campanha apagada nesta sessão não deixa
  // filtro fantasma (autocura em qualquer refresh da árvore, não só no boot)
  const campanhaValida =
    campanhaFiltro && tree.campanhas.some((c) => c.id === campanhaFiltro) ? campanhaFiltro : null
  const idsFiltro = campanhaValida ? idsDaCampanha(vinculos, campanhaValida) : null
  const raizPersonagens = idsFiltro
    ? filtrarPastaPersonagens(
        tree.personagensSoltos,
        new Set([...idsFiltro].map((id) => caminhoPorId[id]).filter((c): c is string => !!c)),
      )
    : tree.personagensSoltos
  const raizCenarios = idsFiltro ? filtrarArvoreCenarios(tree.cenarios, idsFiltro) : tree.cenarios

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="sidebar-title">Grimório</span>
        <button className="btn-icon" title="Recolher barra" onClick={onToggle}>‹</button>
      </div>

      <div className="sidebar-filtro">
        <select
          title="Filtrar personagens e cenários por campanha"
          value={campanhaValida ?? ''}
          onChange={(e) => setCampanhaFiltro(e.target.value || null)}
        >
          <option value="">Campanha: Todas</option>
          {tree.campanhas.filter((c) => c.id).map((c) => (
            <option key={c.id} value={c.id}>{c.nome}</option>
          ))}
        </select>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Campanhas</span>
          <button className="btn-icon" title="Nova campanha" onClick={novaCampanha}>+</button>
        </div>
        {tree.campanhas.map((c) => (
          <CampanhaItem key={c.slug} camp={c} aoMudar={async () => { await recarregar(); await carregarPersonagens() }} />
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span>Canvases soltos</span>
          <button className="btn-icon" title="Novo canvas" onClick={novoCanvasSolto}>+</button>
        </div>
        {tree.canvasesSoltos.map((i) => (
          <ItemLinha key={i.caminho} item={i} tipo="canvas" aoMudar={recarregar} />
        ))}
      </div>

      <PersonagensSoltos raiz={raizPersonagens} aoMudar={async () => { await recarregar(); await carregarPersonagens() }} />

      <CenariosSoltos raiz={raizCenarios} aoMudar={async () => { await recarregar(); await carregarCenarios() }} />
    </aside>
  )
}

function CampanhaItem({ camp, aoMudar }: { camp: CampanhaNode; aoMudar: () => Promise<void> }) {
  const repo = useApp((s) => s.repo)
  const [expandida, setExpandida] = useState(true)

  async function criar(tipo: 'sessao' | 'personagem' | 'canvas' | 'escrita') {
    if (!repo) return
    const rotulo = { sessao: 'sessão', personagem: 'personagem', canvas: 'canvas', escrita: 'escrita' }[tipo]
    const nome = prompt(`Nome da ${rotulo}:`)
    if (!nome) return
    await comAvisoDeErro(async () => {
      if (tipo === 'personagem') await repo.criarPersonagem(camp.slug, nome)
      else if (tipo === 'escrita') await repo.criarCanvasDoc(escritaDirDaCampanha(camp.slug), nome)
      else await repo.criarCanvasDoc(`campanhas/${camp.slug}/${tipo === 'sessao' ? 'sessoes' : 'canvases'}`, nome)
      await aoMudar()
    })
  }

  async function excluir() {
    if (!repo) return
    if (!confirm(`Excluir a campanha "${camp.nome}" e todo o conteúdo dela?`)) return
    await comAvisoDeErro(async () => {
      await repo.excluirCampanha(camp.slug)
      await aoMudar()
    })
  }

  return (
    <div className="campanha">
      <div className="campanha-header" onClick={() => setExpandida(!expandida)}>
        <span className="chevron">{expandida ? '▾' : '▸'}</span>
        <span className={camp.erro ? 'item-erro' : ''}>{camp.nome}</span>
        <span className="campanha-acoes" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon" title="Nova sessão" onClick={() => criar('sessao')}>S+</button>
          <button className="btn-icon" title="Novo personagem" onClick={() => criar('personagem')}>P+</button>
          <button className="btn-icon" title="Novo canvas" onClick={() => criar('canvas')}>C+</button>
          <button className="btn-icon" title="Novo caderno de escrita" onClick={() => criar('escrita')}>E+</button>
          <button className="btn-icon" title="Excluir campanha" onClick={excluir}>🗑</button>
        </span>
      </div>
      {expandida && (
        <div className="campanha-conteudo">
          <Grupo titulo="Escrita" itens={camp.escritas} tipo="canvas" tipoAbertura="escrita" aoMudar={aoMudar} />
          <Grupo titulo="Sessões" itens={camp.sessoes} tipo="canvas" tipoAbertura="sessao" aoMudar={aoMudar} />
          <Grupo titulo="Personagens" itens={camp.personagens} tipo="personagem" aoMudar={aoMudar} />
          <Grupo titulo="Canvases" itens={camp.canvases} tipo="canvas" aoMudar={aoMudar} />
        </div>
      )}
    </div>
  )
}

function Grupo({ titulo, itens, tipo, tipoAbertura, aoMudar }: {
  titulo: string; itens: ItemRef[]; tipo: 'canvas' | 'personagem'; tipoAbertura?: TipoAberto; aoMudar: () => Promise<void>
}) {
  if (itens.length === 0) return null
  return (
    <div className="grupo">
      <div className="grupo-titulo">{titulo}</div>
      {itens.map((i) => <ItemLinha key={i.caminho} item={i} tipo={tipo} tipoAbertura={tipoAbertura} aoMudar={aoMudar} />)}
    </div>
  )
}

function ItemLinha({ item, tipo, tipoAbertura, aoMudar }: {
  item: ItemRef; tipo: 'canvas' | 'personagem'; tipoAbertura?: TipoAberto; aoMudar: () => Promise<void>
}) {
  const repo = useApp((s) => s.repo)
  const abrirItem = useApp((s) => s.abrirItem)
  const abrirPerfil = useApp((s) => s.abrirPerfil)
  const caminhoPorId = useApp((s) => s.caminhoPorId)

  const id = tipo === 'personagem'
    ? Object.entries(caminhoPorId).find(([, cam]) => cam === item.caminho)?.[0]
    : undefined

  function abrir() {
    if (item.erro) return
    if (tipo === 'canvas') {
      abrirItem(tipoAbertura ?? 'canvas', item.caminho, item.nome)
    } else {
      if (id) abrirPerfil(id)
    }
  }

  async function renomear(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    const nome = prompt('Novo nome:', item.nome)
    if (!nome) return
    await comAvisoDeErro(async () => {
      await repo.renomearItem(item.caminho, nome)
      await aoMudar()
    })
  }

  async function excluir(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    if (!confirm(`Excluir "${item.nome}"?`)) return
    await comAvisoDeErro(async () => {
      // itens de mapa/caderno (canvas) podem ter uma pasta .notas irmã — remove junto
      if (tipo === 'canvas') await repo.excluirItemComNotas(item.caminho)
      else await repo.excluirItem(item.caminho)
      await aoMudar()
    })
  }

  return (
    <div
      className={`item-linha ${item.erro ? 'item-erro' : ''}`}
      onClick={abrir}
      draggable={tipo === 'personagem' && !item.erro}
      onDragStart={(e) => {
        if (id) e.dataTransfer.setData('application/x-grimorio-personagem', id)
      }}
      title={item.erro ? 'Arquivo com erro — não foi possível ler' : item.nome}
    >
      <span className="item-nome">{tipo === 'personagem' ? '👤 ' : tipoAbertura === 'escrita' ? '✍ ' : '▦ '}{item.nome}{item.erro ? ' ⚠' : ''}</span>
      <span className="item-acoes" onClick={(e) => e.stopPropagation()}>
        <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
        <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
      </span>
    </div>
  )
}
