import { useState } from 'react'
import { ask, message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import type { CenarioNode, PastaCenarioNode } from '../lib/types'
import { contarDescendentes } from '../lib/cenarioArvore'
import { personagensVivos, vincularPersonagem } from '../lib/cenarioVinculo'
import { pedirTexto } from './dialogos'
import { associarNaCriacao, editarCampanhas } from './dialogoCampanhas'

const RAIZ = 'cenarios'
export const MIME_CENARIO = 'application/x-grimorio-cenario'
const MIME_PERSONAGEM = 'application/x-grimorio-personagem'

async function comAviso(acao: () => Promise<void>) {
  try {
    await acao()
  } catch (e) {
    await message(`Operação falhou: ${e}`, { title: 'Grimório', kind: 'error' })
  }
}

/** Move o cenário (por id) para um diretório; drop para dentro de si mesmo é ignorado. */
async function moverCenarioPara(dirDestino: string, id: string, aoMudar: () => Promise<void>) {
  const { repo, caminhoCenarioPorId } = useApp.getState()
  const origem = caminhoCenarioPorId[id]
  if (!repo || !origem) return
  if (dirDestino === origem || dirDestino.startsWith(`${origem}/`)) return
  await comAviso(async () => {
    await repo.moverCenario(origem, dirDestino)
    await aoMudar()
  })
}

/** Drop de personagem sobre um cenário vincula (dedupe); persiste via autosave do store. */
function vincular(cenarioId: string, personagemId: string) {
  const { cenarios, salvarCenarioParcial } = useApp.getState()
  const c = cenarios[cenarioId]
  if (!c) return
  const nova = vincularPersonagem(c.personagens, personagemId)
  if (nova !== c.personagens) salvarCenarioParcial(cenarioId, { personagens: nova })
}

function aceitaCenario(e: React.DragEvent) {
  if (e.dataTransfer.types.includes(MIME_CENARIO)) {
    e.preventDefault()
    e.stopPropagation()
  }
}

function aceitaCenarioOuPersonagem(e: React.DragEvent) {
  if (e.dataTransfer.types.includes(MIME_CENARIO) || e.dataTransfer.types.includes(MIME_PERSONAGEM)) {
    e.preventDefault()
    e.stopPropagation()
  }
}

/** Seção raiz "Cenários" da sidebar. */
export function CenariosSoltos({ raiz, aoMudar, ocultos = 0, aoMostrarTodos }: {
  raiz: PastaCenarioNode
  aoMudar: () => Promise<void>
  /** quantos o filtro de campanha escondeu (aviso honesto em vez de "sem cenários") */
  ocultos?: number
  aoMostrarTodos?: () => void
}) {
  const repo = useApp((s) => s.repo)

  async function novaPasta() {
    const nome = await pedirTexto('Nome da pasta:')
    if (!nome || !repo) return
    await comAviso(async () => { await repo.criarPasta(RAIZ, nome); await aoMudar() })
  }
  async function novoCenario() {
    const nome = await pedirTexto('Nome do cenário:')
    if (!nome || !repo) return
    await comAviso(async () => {
      const ref = await repo.criarCenarioEm(RAIZ, nome)
      // filtro ativo → etiqueta na campanha filtrada; "Todas" → pergunta as campanhas (0..N)
      await associarNaCriacao('cenario', ref.id, nome)
      await aoMudar()
    })
  }

  return (
    <div
      className="sidebar-section"
      onDragOver={aceitaCenario}
      onDrop={(e) => { const id = e.dataTransfer.getData(MIME_CENARIO); if (id) void moverCenarioPara(RAIZ, id, aoMudar) }}
    >
      <div className="sidebar-section-header">
        <span>Cenários</span>
        <span>
          <button className="btn-icon" title="Nova pasta" onClick={novaPasta}>📁+</button>
          <button className="btn-icon" title="Novo cenário" onClick={novoCenario}>+</button>
        </span>
      </div>
      {ocultos > 0 && aoMostrarTodos && (
        <button className="filtro-ocultos" onClick={aoMostrarTodos}>
          {ocultos} {ocultos === 1 ? 'cenário oculto' : 'cenários ocultos'} pelo filtro — mostrar todos
        </button>
      )}
      {raiz.subpastas.map((p) => <PastaCenarioLinha key={p.caminho} pasta={p} nivel={0} aoMudar={aoMudar} />)}
      {raiz.cenarios.map((c) => <CenarioLinha key={c.caminho} node={c} nivel={0} aoMudar={aoMudar} />)}
      {raiz.subpastas.length === 0 && raiz.cenarios.length === 0 && (
        <div className="rail-vazio">Sem cenários ainda. Crie ou arraste pra cá.</div>
      )}
    </div>
  )
}

function PastaCenarioLinha({ pasta, nivel, aoMudar }: { pasta: PastaCenarioNode; nivel: number; aoMudar: () => Promise<void> }) {
  const repo = useApp((s) => s.repo)
  const [aberta, setAberta] = useState(true)

  async function criar(tipo: 'pasta' | 'cenario') {
    const nome = await pedirTexto(tipo === 'pasta' ? 'Nome da subpasta:' : 'Nome do cenário:')
    if (!nome || !repo) return
    await comAviso(async () => {
      if (tipo === 'pasta') {
        await repo.criarPasta(pasta.caminho, nome)
      } else {
        const ref = await repo.criarCenarioEm(pasta.caminho, nome)
        await associarNaCriacao('cenario', ref.id, nome)
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
        onDragOver={aceitaCenario}
        onDrop={(e) => { e.stopPropagation(); const id = e.dataTransfer.getData(MIME_CENARIO); if (id) void moverCenarioPara(pasta.caminho, id, aoMudar) }}
        title={pasta.nome}
      >
        <span className="chevron">{aberta ? '▾' : '▸'}</span>
        <span className="rail-titulo">📁 {pasta.nome}</span>
        <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon" title="Novo cenário" onClick={() => void criar('cenario')}>+</button>
          <button className="btn-icon" title="Nova subpasta" onClick={() => void criar('pasta')}>📁</button>
          <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
          <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
        </span>
      </div>
      {aberta && (
        <>
          {pasta.subpastas.map((p) => <PastaCenarioLinha key={p.caminho} pasta={p} nivel={nivel + 1} aoMudar={aoMudar} />)}
          {pasta.cenarios.map((c) => <CenarioLinha key={c.caminho} node={c} nivel={nivel + 1} aoMudar={aoMudar} />)}
        </>
      )}
    </div>
  )
}

function CenarioLinha({ node, nivel, aoMudar }: { node: CenarioNode; nivel: number; aoMudar: () => Promise<void> }) {
  const repo = useApp((s) => s.repo)
  const abrirCenario = useApp((s) => s.abrirCenario)
  const cenario = useApp((s) => s.cenarios[node.id])
  const personagens = useApp((s) => s.personagens)
  const [aberto, setAberto] = useState(true)

  const vinculados = personagensVivos(cenario?.personagens ?? [], personagens)
  const temFilhos = node.filhos.length > 0 || vinculados.length > 0

  async function novoSub(e: React.MouseEvent) {
    e.stopPropagation()
    const nome = await pedirTexto('Nome do sub-cenário:')
    if (!nome || !repo) return
    await comAviso(async () => {
      const ref = await repo.criarCenarioEm(node.caminho, nome)
      await associarNaCriacao('cenario', ref.id, nome)
      await aoMudar()
    })
  }
  async function renomear(e: React.MouseEvent) {
    e.stopPropagation()
    const nome = await pedirTexto('Novo nome:', node.nome)
    if (!nome || !repo) return
    await comAviso(async () => { await repo.renomearCenario(node.caminho, nome); await aoMudar() })
  }
  async function excluir(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    const qtd = contarDescendentes(node)
    const aviso = qtd > 0 ? ` e ${qtd} sub-cenário(s) dentro dele` : ''
    if (!(await ask(`Excluir "${node.nome}"${aviso}?`, { title: 'Grimório', kind: 'warning' }))) return
    await comAviso(async () => { await repo.excluirCenario(node.caminho); await aoMudar() })
  }

  return (
    <div className="rail-node">
      <div
        className={`rail-linha ${node.erro ? 'item-erro' : ''}`}
        style={{ paddingLeft: 8 + nivel * 14 }}
        onClick={() => { if (!node.erro && node.id) abrirCenario(node.id) }}
        draggable={!node.erro && !!node.id}
        onDragStart={(e) => { if (node.id) e.dataTransfer.setData(MIME_CENARIO, node.id) }}
        onDragOver={aceitaCenarioOuPersonagem}
        onDrop={(e) => {
          e.stopPropagation()
          const cid = e.dataTransfer.getData(MIME_CENARIO)
          if (cid && cid !== node.id) { void moverCenarioPara(node.caminho, cid, aoMudar); return }
          const pid = e.dataTransfer.getData(MIME_PERSONAGEM)
          if (pid && node.id) vincular(node.id, pid)
        }}
        title={node.erro ? 'Arquivo com erro' : node.nome}
      >
        {temFilhos
          ? <span className="chevron" onClick={(e) => { e.stopPropagation(); setAberto(!aberto) }}>{aberto ? '▾' : '▸'}</span>
          : <span className="chevron-vazio" />}
        <span className="rail-titulo">🗺 {node.nome}{node.erro ? ' ⚠' : ''}</span>
        <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon" title="Novo sub-cenário" onClick={novoSub}>+</button>
          {node.id && (
            <button className="btn-icon" title="Campanhas" onClick={(e) => { e.stopPropagation(); void editarCampanhas('cenario', node.id, node.nome) }}>🏷️</button>
          )}
          <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
          <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
        </span>
      </div>
      {aberto && (
        <>
          {node.filhos.map((f) => <CenarioLinha key={f.caminho} node={f} nivel={nivel + 1} aoMudar={aoMudar} />)}
          {vinculados.map((pid) => <PersonagemVinculadoLinha key={pid} personagemId={pid} nivel={nivel + 1} />)}
        </>
      )}
    </div>
  )
}

/** Folha somente-leitura: personagem vinculado ao cenário (desvincular fica no modal). */
function PersonagemVinculadoLinha({ personagemId, nivel }: { personagemId: string; nivel: number }) {
  const p = useApp((s) => s.personagens[personagemId])
  const abrirPerfil = useApp((s) => s.abrirPerfil)
  if (!p) return null
  return (
    <div
      className="rail-linha"
      style={{ paddingLeft: 8 + nivel * 14 }}
      onClick={() => abrirPerfil(personagemId)}
      title={p.nome}
    >
      <span className="chevron-vazio" />
      <span className="rail-titulo">👤 {p.nome}</span>
    </div>
  )
}
