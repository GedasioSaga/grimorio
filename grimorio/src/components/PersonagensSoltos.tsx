import { useState } from 'react'
import { ask, message } from '@tauri-apps/plugin-dialog'
import { useApp } from '../state/store'
import type { ItemRef, PastaNode } from '../lib/types'
import { buscarPersonagens } from '../lib/buscaArvore'
import { contarPersonagens } from '../lib/filtroCampanha'
import { pedirTexto } from './dialogos'
import { associarNaCriacao, editarCampanhas } from './dialogoCampanhas'
import { CaixaBusca } from './CaixaBusca'
import { CardRetrato } from './CardRetrato'
import { urlRetrato } from '../lib/urlRetrato'
import { versaoAtivaPersonagem } from '../lib/personagemVersao'
import { useMiniaturas } from '../state/miniaturas'
import { useAberto, useArvoreRail } from '../state/arvoreRail'
import { BotaoArvore } from './BotaoArvore'

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
  const [busca, setBusca] = useState('')
  const achados = buscarPersonagens(raiz, busca)
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
  async function novoPersonagem() {
    const nome = await pedirTexto('Nome do personagem:')
    if (!nome || !repo) return
    await comAviso(async () => {
      const ref = await repo.criarPersonagemEm(RAIZ, nome)
      // precedência: filtro ativo ganha; senão herda a campanha da pasta em que nasce; senão pergunta
      await associarNaCriacao('personagem', ref.id, nome, RAIZ)
      await aoMudar()
      // sem isto, criar "Masmorra" com "cast" na busca pareceria não ter criado nada
      setBusca('')
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
          <BotaoArvore secao="personagens" />
          <button className="btn-icon" title="Nova pasta" onClick={novaPasta}>📁+</button>
          <button className="btn-icon" title="Novo personagem" onClick={novoPersonagem}>+</button>
        </span>
      </div>
      <CaixaBusca valor={busca} aoMudar={setBusca} achados={achados.length} total={contarPersonagens(raiz)} />
      {ocultos > 0 && aoMostrarTodos && (
        <button className="filtro-ocultos" onClick={aoMostrarTodos}>
          {ocultos} {ocultos === 1 ? 'personagem oculto' : 'personagens ocultos'} pelo filtro — mostrar todos
        </button>
      )}
      {buscando ? (
        achados.length === 0
          ? <div className="rail-vazio">Nada com “{busca.trim()}”.</div>
          : achados.map((a) => (
              <PersonagemLinha key={a.item.caminho} item={a.item} nivel={0} aoMudar={aoMudar}
                resultado={{ caminhoRotulo: a.caminhoRotulo }} />
            ))
      ) : (
        <>
          {raiz.subpastas.map((p) => <PastaLinha key={p.caminho} pasta={p} nivel={0} aoMudar={aoMudar} />)}
          {raiz.personagens.map((pr) => <PersonagemLinha key={pr.caminho} item={pr} nivel={0} aoMudar={aoMudar} />)}
          {raiz.subpastas.length === 0 && raiz.personagens.length === 0 && (
            <div className="rail-vazio">Sem personagens aqui. Crie ou arraste pra cá.</div>
          )}
        </>
      )}
    </div>
  )
}

function PastaLinha({ pasta, nivel, aoMudar }: { pasta: PastaNode; nivel: number; aoMudar: () => Promise<void> }) {
  const repo = useApp((s) => s.repo)
  const aberta = useAberto('personagens', pasta.caminho)
  const alternar = useArvoreRail((s) => s.alternar)

  async function criar(tipo: 'pasta' | 'personagem') {
    const nome = await pedirTexto(tipo === 'pasta' ? 'Nome da subpasta:' : 'Nome do personagem:')
    if (!nome || !repo) return
    await comAviso(async () => {
      if (tipo === 'pasta') {
        const { id } = await repo.criarPasta(pasta.caminho, nome)
        await associarNaCriacao('pasta', id, nome, pasta.caminho)
      } else {
        const ref = await repo.criarPersonagemEm(pasta.caminho, nome)
        await associarNaCriacao('personagem', ref.id, nome, pasta.caminho)
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
    if (!(await ask(`Mover a pasta "${pasta.nome}" e tudo dentro dela para a lixeira?`, { title: 'Grimório', kind: 'warning' }))) return
    await comAviso(async () => {
      // pasta legada sem id: nasce agora, pra a entrada da lixeira saber qual vínculo limpar
      // se um dia for esvaziada (mover NUNCA mexe em vinculos.json — ver moverParaLixeira)
      const id = pasta.id ?? (await repo.garantirIdDePasta(pasta.caminho))
      await repo.moverPastaParaLixeira(pasta.caminho, pasta.nome, id)
      await aoMudar()
    })
  }

  return (
    <div className="rail-node">
      <div
        className="rail-linha"
        style={{ paddingLeft: 8 + nivel * 14 }}
        onClick={() => alternar('personagens', pasta.caminho)}
        onDragOver={aceitaPersonagem}
        onDrop={(e) => { e.stopPropagation(); const id = e.dataTransfer.getData(MIME); if (id) void moverPara(pasta.caminho, id, aoMudar) }}
        title={pasta.nome}
      >
        <span className="chevron">{aberta ? '▾' : '▸'}</span>
        <span className="rail-titulo">📁 {pasta.nome}</span>
        <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
          <button className="btn-icon" title="Novo personagem" onClick={() => void criar('personagem')}>+</button>
          <button className="btn-icon" title="Nova subpasta" onClick={() => void criar('pasta')}>📁</button>
          <button className="btn-icon" title="Campanhas" onClick={campanhas}>🏷️</button>
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

function PersonagemLinha({ item, nivel, aoMudar, resultado }: {
  item: ItemRef; nivel: number; aoMudar: () => Promise<void>
  /** modo lista plana da busca: mostra a pasta ao lado e desliga o arrastar */
  resultado?: { caminhoRotulo: string }
}) {
  const repo = useApp((s) => s.repo)
  const abrirPerfil = useApp((s) => s.abrirPerfil)
  const caminhoPorId = useApp((s) => s.caminhoPorId)
  const id = item.id ?? Object.entries(caminhoPorId).find(([, cam]) => cam === item.caminho)?.[0]
  const p = useApp((s) => (id ? s.personagens[id] : undefined))
  const vaultPath = useApp((s) => s.vaultPath)
  const miniaturas = useMiniaturas((s) => s.ligadas)
  const retratoSrc = miniaturas
    ? urlRetrato(
        vaultPath,
        p ? versaoAtivaPersonagem(p).retrato : null,
        p ? `${p.modificadoEm}:${p.versaoAtivaId}` : '',
      )
    : null

  async function renomear(e: React.MouseEvent) {
    e.stopPropagation()
    const nome = await pedirTexto('Novo nome:', item.nome)
    if (!nome) return
    // personagem: renomeia a FORMA ATIVA (nome do topo é espelho, reverteria no próximo load)
    if (id && useApp.getState().personagens[id]) {
      const personagemId = id
      await comAviso(async () => { await useApp.getState().renomearPersonagemAtivo(personagemId, nome); await aoMudar() })
      return
    }
    if (!repo) return
    await comAviso(async () => { await repo.renomearItem(item.caminho, nome); await aoMudar() })
  }
  async function excluir(e: React.MouseEvent) {
    e.stopPropagation()
    if (!repo) return
    if (!(await ask(`Mover "${item.nome}" para a lixeira?`, { title: 'Grimório', kind: 'warning' }))) return
    await comAviso(async () => { await repo.moverParaLixeira('personagem', item.caminho, item.nome, id); await aoMudar() })
  }

  return (
    <div
      className={`rail-linha ${item.erro ? 'item-erro' : ''}`}
      style={{ paddingLeft: 8 + nivel * 14 }}
      onClick={() => { if (!item.erro && id) abrirPerfil(id) }}
      // na busca não há pasta na tela: arrastar não teria alvo visível pra onde soltar
      draggable={!resultado && !item.erro && !!id}
      onDragStart={(e) => { if (id) e.dataTransfer.setData(MIME, id) }}
      title={item.erro ? 'Arquivo com erro' : item.nome}
    >
      <span className="chevron-vazio" />
      <CardRetrato className="rail-icone" src={retratoSrc} alt="" fallback={<span>👤</span>} />
      <span className="rail-titulo">{item.nome}{item.erro ? ' ⚠' : ''}</span>
      {resultado?.caminhoRotulo && <span className="rail-caminho">· {resultado.caminhoRotulo}</span>}
      <span className="rail-acoes" onClick={(e) => e.stopPropagation()}>
        {id && (
          <button className="btn-icon" title="Campanhas" onClick={(e) => { e.stopPropagation(); void editarCampanhas('personagem', id, item.nome) }}>🏷️</button>
        )}
        <button className="btn-icon" title="Renomear" onClick={renomear}>✎</button>
        <button className="btn-icon" title="Excluir" onClick={excluir}>🗑</button>
      </span>
    </div>
  )
}
