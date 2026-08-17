import { useEffect, useRef, useState } from 'react'
import { open, message } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { registrarFlushModal, useApp } from '../state/store'
import { encontrarCenarioNode } from '../lib/cenarioArvore'
import { desvincularPersonagem, personagensVivos, vincularPersonagem } from '../lib/cenarioVinculo'
import { EditorTexto } from './EditorTexto'
import { GaleriaPersonagem } from './GaleriaPersonagem'
import { AbaVinculos } from './AbaVinculos'
import { AcervoCenario } from './AcervoCenario'
import { AcoesIA, type AcaoIA } from './AcoesIA'
import { ChatEntidade } from './ChatEntidade'
import { contextoDeEntidade } from '../lib/contextoIA'
import { htmlParaTexto } from '../lib/htmlTexto'
import { htmlParaMarkdown, markdownParaHtml } from '../lib/markdownHtml'
import { carregarImagensIA } from '../lib/imagensIA'
import { promptDescreverCenarioCorrido, promptDescreverCenarioTopicos, SYSTEM_ESCRITOR } from '../lib/promptsIA'
import { BarraVersoes } from './BarraVersoes'
import { BarraLocalizacao } from './BarraLocalizacao'
import { EnquadrarRetrato } from './EnquadrarRetrato'
import { posicaoCss } from '../lib/focoRetrato'
import { aplicarPatchCenario, versaoAtiva, type PatchCenario } from '../lib/cenarioVersao'
import '../estilos/localizacao.css'

const AUTOSAVE_DEBOUNCE_MS = 800

type Aba = 'descricao' | 'conteudo' | 'informacao' | 'historia' | 'eventos' | 'itens' | 'imagens' | 'anotacoes' | 'vinculos'
type AbaTexto = Exclude<Aba, 'imagens' | 'conteudo' | 'vinculos'>

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'descricao', rotulo: 'Descrição' },
  { id: 'conteudo', rotulo: 'Conteúdo' },
  { id: 'informacao', rotulo: 'Informações' },
  { id: 'historia', rotulo: 'História' },
  { id: 'eventos', rotulo: 'Eventos' },
  { id: 'itens', rotulo: 'Itens' },
  { id: 'imagens', rotulo: 'Imagens' },
  { id: 'anotacoes', rotulo: 'Anotações' },
  { id: 'vinculos', rotulo: 'Vínculos' },
]

const ACOES_IA_CENARIO: AcaoIA[] = [
  {
    rotulo: 'Sugerir eventos',
    prompt: 'Sugira 3 eventos que podem acontecer neste cenário (lista curta, um por linha, com gatilho e consequência).',
    abaDestino: 'eventos',
    rotuloDestino: 'Eventos',
  },
  {
    rotulo: 'Analisar imagem',
    prompt: 'Analise a imagem deste cenário: descreva o que se vê e sugira 3 pontos de interesse para os jogadores explorarem.',
    abaDestino: 'anotacoes',
    rotuloDestino: 'Anotações',
    comImagem: true,
  },
  {
    rotulo: 'Descrever cenário em tópicos',
    prompt: (temImagem) => promptDescreverCenarioTopicos(temImagem ? 'imagem' : 'ficha'),
    abaDestino: 'descricao',
    rotuloDestino: 'Descrição',
    imagemPreferida: true,
  },
  {
    rotulo: 'Descrever cenário corrido',
    prompt: (temImagem) => promptDescreverCenarioCorrido(temImagem ? 'imagem' : 'ficha'),
    abaDestino: 'descricao',
    rotuloDestino: 'Descrição',
    imagemPreferida: true,
  },
]

export function CenarioModal({ cenarioId }: { cenarioId: string }) {
  const c = useApp((s) => s.cenarios[cenarioId])
  const vaultPath = useApp((s) => s.vaultPath)
  const repo = useApp((s) => s.repo)
  const fecharCenario = useApp((s) => s.fecharCenario)
  const recarregarArvore = useApp((s) => s.recarregarArvore)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // true quando o cache tem edição ainda não confirmada em disco. Separado de `timer.current`
  // de propósito: uma tentativa de salvar cancela e zera o timer ANTES de terminar, e se ela
  // FALHAR a edição continua sem estar gravada — `timer.current` sozinho não expressa isso.
  // Sem `sujo`, a segunda tentativa de mover (depois de uma falha, sem editar nada de novo)
  // acharia "nada pendente" e deixaria a edição pra trás. Só volta a `false` quando `salvar()`
  // confirma sucesso (ou quando a entidade some — nesse caso não há mais o que gravar).
  const sujo = useRef(false)
  const [salvarErro, setSalvarErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('descricao')
  const [chatAberto, setChatAberto] = useState(false)
  const [enquadrando, setEnquadrando] = useState(false)

  // ?v= força refetch quando o retrato troca mantendo o mesmo nome de arquivo
  const retratoRel = c ? versaoAtiva(c).retrato : null
  const retratoSrc = c && retratoRel && vaultPath
    ? `${convertFileSrc(`${vaultPath}/${retratoRel}`)}?v=${encodeURIComponent(`${c.modificadoEm}:${c.versaoAtivaId}`)}`
    : null

  const [erroImg, setErroImg] = useState(false)
  useEffect(() => {
    setErroImg(false)
  }, [retratoSrc])

  // desmontou com gravação pendente: cancela o debounce e grava já (fire-and-forget;
  // VaultRepo serializa escritas por caminho, mesmo padrão do PerfilModal)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (sujo.current) void salvar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // registra o flush AGUARDÁVEL que a Barra de Localização chama antes de mover/absorver
  // este cenário — sem isto, o timer local acima (agendado com o caminho de ANTES da
  // mudança) dispara 800ms depois no lugar errado. `salvar` não fecha sobre nada do
  // render (lê tudo via `useApp.getState()`), então registrar uma vez por montagem basta.
  useEffect(() => registrarFlushModal('cenario', cenarioId, async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    // checa `sujo`, não `timer.current`: uma tentativa de flush anterior pode ter zerado o
    // timer e FALHADO — a edição continua pendente sem timer nenhum agendado. Só reporta
    // "nada pendente" quando `salvar()` de fato confirmou a gravação em disco.
    if (!sujo.current) return true
    return await salvar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cenarioId])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      // não fecha por cima do enquadrar retrato: o Escape dele já cuida do próprio overlay
      if (e.key === 'Escape' && !enquadrando) void fechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquadrando])

  if (!c) return null
  const va = versaoAtiva(c)

  function agendarSalvar(mudancas: PatchCenario) {
    if (timer.current) clearTimeout(timer.current)
    sujo.current = true
    timer.current = setTimeout(() => {
      timer.current = null
      void salvar()
    }, AUTOSAVE_DEBOUNCE_MS)
    // atualização otimista no cache (sidebar e cards refletem na hora)
    useApp.setState((s) => ({
      cenarios: { ...s.cenarios, [cenarioId]: aplicarPatchCenario(s.cenarios[cenarioId], mudancas) },
    }))
  }

  async function salvar(): Promise<boolean> {
    // repo e caminho RE-RESOLVIDOS no disparo (não desestruturados do render que agendou):
    // mover o cenário troca `caminhoCenarioPorId` no store, e uma closure presa no valor
    // antigo gravaria no diretório que acabou de deixar de existir. Mesmo racional de
    // `agendarSalvarCenario` em state/store.ts — ver o comentário lá.
    const { repo, caminhoCenarioPorId, cenarios } = useApp.getState()
    const atual = cenarios[cenarioId]
    const caminho = caminhoCenarioPorId[cenarioId]
    // entidade sumiu (excluída/movida por fora): não há mais o que gravar, e isso NÃO é falha
    if (!repo || !caminho || !atual) { sujo.current = false; return true }
    try {
      await repo.salvarCenario(caminho, { ...atual })
      sujo.current = false // só agora a edição está confirmada em disco
      setSalvarErro(null)
      await recarregarArvore()
      return true
    } catch (e) {
      // não relança: chamadas debounced são fire-and-forget. `sujo` continua `true` de
      // propósito — é o que faz a PRÓXIMA tentativa (novo clique em "Mover", novo debounce)
      // realmente tentar gravar de novo, em vez de reportar "nada pendente" por engano.
      console.error('Falha ao salvar cenário:', e)
      setSalvarErro(String(e))
      return false
    }
  }

  async function trocarRetrato() {
    if (!repo || !vaultPath) return
    try {
      const arquivo = await open({
        title: 'Escolher retrato',
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      if (typeof arquivo !== 'string') return
      const nomeArquivo = arquivo.split(/[\\/]/).pop() ?? ''
      const ext = (nomeArquivo.includes('.') ? nomeArquivo.split('.').pop()! : 'png').toLowerCase()
      // central e estável: mover o cenário não quebra o rel
      const destinoRel = `imagens-cenarios/retrato-${cenarioId}-${c.versaoAtivaId}.${ext}`
      await repo.copiarParaCofre(arquivo, destinoRel)
      // foco volta ao centro: o da imagem antiga não quer dizer nada na nova
      agendarSalvar({ retrato: destinoRel, foco: undefined, modificadoEm: new Date().toISOString() })
      setEnquadrando(true) // hora natural de enquadrar: acabou de escolher
    } catch (e) {
      await message(`Falha ao trocar retrato: ${e}`, { title: 'Grimório', kind: 'error' })
    }
  }

  async function fechar() {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (sujo.current) {
      const ok = await salvar()
      if (!ok) return
    }
    fecharCenario()
  }

  return (
    <div className="modal-overlay" onClick={() => void fechar()}>
      <div className="perfil-modal" onClick={(e) => e.stopPropagation()}>
        <div className="perfil-header">
          <div className="perfil-retrato" onClick={() => void trocarRetrato()} title="Clique para trocar o retrato">
            {retratoSrc && !erroImg
              ? <img src={retratoSrc} alt={c.nome} style={{ objectPosition: posicaoCss(va.foco) }}
                  onError={() => setErroImg(true)} />
              : <span>{c.nome.charAt(0).toUpperCase()}</span>}
            {retratoSrc && !erroImg && (
              // stopPropagation: sem ele o clique subiria e abriria o seletor de arquivo junto
              <button className="perfil-retrato-enquadrar" title="Enquadrar retrato"
                onClick={(e) => { e.stopPropagation(); setEnquadrando(true) }}>🎯</button>
            )}
          </div>
          <div className="perfil-titulos">
            <input className="perfil-nome" value={c.nome}
              onChange={(e) => agendarSalvar({ nome: e.target.value })} />
            <input className="perfil-resumo" placeholder="Resumo curto (aparece no cartão)"
              value={va.resumo}
              onChange={(e) => agendarSalvar({ resumo: e.target.value })} />
          </div>
          <AcoesIA
            system={SYSTEM_ESCRITOR}
            abaAtual={aba}
            rotuloAbaAtual={ABAS.find((a) => a.id === aba)?.rotulo ?? aba}
            abaEhTexto={aba !== 'imagens' && aba !== 'conteudo' && aba !== 'vinculos'}
            acoes={ACOES_IA_CENARIO}
            snapshot={() => {
              const s = useApp.getState()
              const ent = s.cenarios[cenarioId]
              const vEnt = ent ? versaoAtiva(ent) : null
              const ehTexto = aba !== 'imagens' && aba !== 'conteudo' && aba !== 'vinculos'
              return {
                dadosBase: `# Cenário\nNome: ${ent?.nome ?? ''}\nResumo: ${vEnt?.resumo ?? ''}`,
                textoAtual: ehTexto && vEnt ? htmlParaMarkdown((vEnt as unknown as Record<string, string>)[aba] ?? '') : '',
                contexto: s.tree ? contextoDeEntidade(cenarioId, { ...s, tree: s.tree }) : '',
              }
            }}
            imagensParaIA={async (incluirGaleria) => {
              const s = useApp.getState()
              const ent = s.cenarios[cenarioId]
              if (!ent || !s.vaultPath) return []
              const vEnt = versaoAtiva(ent)
              const rels = vEnt.retrato ? [vEnt.retrato] : []
              if (incluirGaleria) for (const img of vEnt.imagens ?? []) rels.push(img.rel)
              return carregarImagensIA(s.vaultPath, rels)
            }}
            conteudoDoDestino={(dest) => {
              const ent = useApp.getState().cenarios[cenarioId]
              return ent ? htmlParaTexto((versaoAtiva(ent) as unknown as Record<string, string>)[dest] ?? '') : ''
            }}
            onInserir={(abaDestino, textoCru, modo) => {
              const html = markdownParaHtml(textoCru)
              const atual = useApp.getState().cenarios[cenarioId]
              const base = atual ? (versaoAtiva(atual) as unknown as Record<string, string>)[abaDestino] ?? '' : ''
              const novo = modo === 'substituir' ? html : base + html
              agendarSalvar({ [abaDestino]: novo } as PatchCenario)
              setAba(abaDestino as Aba)
            }}
          />
          <button className="btn-icon" title="Conversar com a IA sobre este cenário"
            onClick={() => setChatAberto((v) => !v)}>💬</button>
          <button className="btn-icon perfil-fechar" onClick={() => void fechar()}>✕</button>
        </div>
        <BarraVersoes cenarioId={cenarioId} />
        <BarraLocalizacao tipo="cenario" id={cenarioId} />
        <div className="perfil-abas">
          {ABAS.map((a) => (
            <button key={a.id} className={aba === a.id ? 'ativo' : ''} onClick={() => setAba(a.id)}>
              {a.rotulo}
            </button>
          ))}
        </div>
        {aba === 'imagens' ? (
          <GaleriaPersonagem
            dirAssets="imagens-cenarios"
            imagens={va.imagens}
            onImagensChange={(imagens) => agendarSalvar({ imagens })}
          />
        ) : aba === 'conteudo' ? (
          <AbaConteudo cenarioId={cenarioId} agendarSalvar={agendarSalvar} />
        ) : aba === 'vinculos' ? (
          <AbaVinculos entidadeTipo="cenario" entidadeId={cenarioId} />
        ) : aba === 'itens' ? (
          <div className="aba-itens">
            <AcervoCenario
              acervo={va.acervo}
              onChange={(mudanca) => {
                // lê o acervo mais fresco do store, não o `va.acervo` fechado neste render:
                // um updater assíncrono (ex.: criar item no acervo) pode resolver depois de
                // uma edição concorrente já ter mudado o acervo
                const atualCenario = useApp.getState().cenarios[cenarioId]
                const acervoAtual = atualCenario ? versaoAtiva(atualCenario).acervo : va.acervo
                const acervo = typeof mudanca === 'function' ? mudanca(acervoAtual) : mudanca
                agendarSalvar({ acervo })
              }}
            />
            <EditorTexto
              key={`itens:${c.versaoAtivaId}`}
              value={va.itens}
              onChange={(html) => agendarSalvar({ itens: html })}
            />
          </div>
        ) : (
          <EditorTexto
            key={`${aba}:${c.versaoAtivaId}`}
            value={va[aba as AbaTexto]}
            onChange={(html) => agendarSalvar({ [aba]: html } as PatchCenario)}
          />
        )}
        {salvarErro && (
          <div className="perfil-salvar-erro">Falha ao salvar: {salvarErro}</div>
        )}
      </div>
      {chatAberto && (
        <ChatEntidade tipo="cenario" entidadeId={cenarioId} onFechar={() => setChatAberto(false)} />
      )}
      {enquadrando && retratoSrc && (
        <EnquadrarRetrato
          src={retratoSrc}
          focoInicial={va.foco}
          aoSalvar={(foco) => { agendarSalvar({ foco }); setEnquadrando(false) }}
          aoFechar={() => setEnquadrando(false)}
        />
      )}
    </div>
  )
}

/** Sub-cenários (navegação) + personagens vinculados (chips com busca). */
function AbaConteudo({ cenarioId, agendarSalvar }: {
  cenarioId: string
  agendarSalvar: (mudancas: PatchCenario) => void
}) {
  const tree = useApp((s) => s.tree)
  const c = useApp((s) => s.cenarios[cenarioId])
  const personagens = useApp((s) => s.personagens)
  const abrirCenario = useApp((s) => s.abrirCenario)
  const abrirPerfil = useApp((s) => s.abrirPerfil)
  const [busca, setBusca] = useState('')

  if (!c) return null
  const node = tree ? encontrarCenarioNode(tree.cenarios, cenarioId) : null
  const vivos = personagensVivos(c.personagens, personagens)
  const termo = busca.trim().toLowerCase()
  const candidatos = termo
    ? Object.values(personagens)
        .filter((p) => p.nome.toLowerCase().includes(termo) && !c.personagens.includes(p.id))
        .slice(0, 8)
    : []

  return (
    <div className="cenario-conteudo">
      <div className="grupo-titulo">Sub-cenários</div>
      {node && node.filhos.length > 0 ? (
        node.filhos.map((f) => (
          <button key={f.id} className="cenario-sub-item" onClick={() => abrirCenario(f.id)}>
            🗺 {f.nome}
          </button>
        ))
      ) : (
        <p className="galeria-vazia">Nenhum sub-cenário. Crie pela sidebar (+ na linha do cenário).</p>
      )}

      <div className="grupo-titulo">Personagens</div>
      <div className="cenario-chips">
        {vivos.map((pid) => (
          <span key={pid} className="cenario-chip">
            <button className="cenario-chip-nome" onClick={() => abrirPerfil(pid)}>
              👤 {personagens[pid].nome}
            </button>
            <button
              className="cenario-chip-x"
              title="Desvincular (não exclui o personagem)"
              onClick={() => agendarSalvar({ personagens: desvincularPersonagem(c.personagens, pid) })}
            >
              ×
            </button>
          </span>
        ))}
        {vivos.length === 0 && <p className="galeria-vazia">Nenhum personagem vinculado.</p>}
      </div>
      <div className="cenario-vincular">
        <input
          placeholder="+ Vincular personagem (busque pelo nome)…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {candidatos.map((p) => (
          <button
            key={p.id}
            className="cenario-sub-item"
            onClick={() => {
              agendarSalvar({ personagens: vincularPersonagem(c.personagens, p.id) })
              setBusca('')
            }}
          >
            👤 {p.nome}
          </button>
        ))}
      </div>
    </div>
  )
}
