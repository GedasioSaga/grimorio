import { useEffect, useRef, useState } from 'react'
import { open, message } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { registrarFlushModal, useApp } from '../state/store'
import { EditorTexto } from './EditorTexto'
import { GaleriaPersonagem } from './GaleriaPersonagem'
import { AbaVinculos } from './AbaVinculos'
import { AcervoCenario } from './AcervoCenario'
import { AcoesIA, type AcaoIA } from './AcoesIA'
import { ChatEntidade } from './ChatEntidade'
import { contextoDeEntidade } from '../lib/contextoIA'
import { htmlParaTexto } from '../lib/htmlTexto'
import { htmlParaMarkdown, markdownParaHtml } from '../lib/markdownHtml'
import { promptDescreverPersonagem, SYSTEM_ESCRITOR } from '../lib/promptsIA'
import { carregarImagensIA } from '../lib/imagensIA'
import { BarraVersoesPersonagem } from './BarraVersoesPersonagem'
import { BarraLocalizacao } from './BarraLocalizacao'
import { EnquadrarRetrato } from './EnquadrarRetrato'
import { posicaoCss } from '../lib/focoRetrato'
import { aplicarPatchPersonagem, versaoAtivaPersonagem, type PatchPersonagem } from '../lib/personagemVersao'
import '../estilos/localizacao.css'

const AUTOSAVE_DEBOUNCE_MS = 800

type Aba = 'descricao' | 'informacao' | 'historia' | 'itens' | 'imagens' | 'extras' | 'anotacoes' | 'vinculos'
type AbaTexto = Exclude<Aba, 'imagens' | 'itens' | 'vinculos'>

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'descricao', rotulo: 'Descrição' },
  { id: 'informacao', rotulo: 'Informações' },
  { id: 'historia', rotulo: 'História' },
  { id: 'itens', rotulo: 'Itens' },
  { id: 'imagens', rotulo: 'Imagens' },
  { id: 'extras', rotulo: 'Extras' },
  { id: 'anotacoes', rotulo: 'Anotações' },
  { id: 'vinculos', rotulo: 'Vínculos' },
]

const ACOES_IA_PERSONAGEM: AcaoIA[] = [
  {
    rotulo: 'Sugerir segredos e ganchos',
    prompt: 'Sugira 3 segredos ou ganchos de aventura envolvendo este personagem, em lista curta.',
    abaDestino: 'anotacoes',
    rotuloDestino: 'Anotações',
  },
  {
    rotulo: 'Descrever personagem em tópicos',
    prompt: (temImagem) => promptDescreverPersonagem(temImagem ? 'imagem' : 'ficha'),
    abaDestino: 'descricao',
    rotuloDestino: 'Descrição',
    imagemPreferida: true,
  },
]

export function PerfilModal({ personagemId }: { personagemId: string }) {
  const p = useApp((s) => s.personagens[personagemId])
  const vaultPath = useApp((s) => s.vaultPath)
  const repo = useApp((s) => s.repo)
  const caminhoPorId = useApp((s) => s.caminhoPorId)
  const fecharPerfil = useApp((s) => s.fecharPerfil)
  const recarregarArvore = useApp((s) => s.recarregarArvore)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // true quando o cache tem edição ainda não confirmada em disco. Separado de `timer.current`
  // de propósito: ver o comentário equivalente em CenarioModal — mesmo defeito, mesmo conserto,
  // os três modais compartilham o padrão byte-a-byte.
  const sujo = useRef(false)
  const [salvarErro, setSalvarErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('descricao')
  const [chatAberto, setChatAberto] = useState(false)
  const [enquadrando, setEnquadrando] = useState(false)

  // ?v= força refetch quando o retrato é trocado pelo mesmo nome de arquivo (mesma extensão)
  const retratoRel = p ? versaoAtivaPersonagem(p).retrato : null
  const retratoSrc = p && retratoRel && vaultPath
    ? `${convertFileSrc(`${vaultPath}/${retratoRel}`)}?v=${encodeURIComponent(`${p.modificadoEm}:${p.versaoAtivaId}`)}`
    : null

  // imagem quebrada → volta pro fallback de inicial; reseta se o retrato mudar
  const [erroImg, setErroImg] = useState(false)
  useEffect(() => {
    setErroImg(false)
  }, [retratoSrc])

  // desmontou com gravação pendente: cancela o debounce e grava já (fire-and-forget;
  // VaultRepo serializa escritas por caminho, mesmo padrão do CanvasView)
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (sujo.current) void salvar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // registra o flush AGUARDÁVEL que a Barra de Localização chama antes de mover este
  // personagem — sem isto, o timer local acima (agendado com o caminho de ANTES da
  // mudança) dispara 800ms depois no diretório antigo. `moverPersonagem` só remove o
  // ARQUIVO (não a pasta — ver vaultRepo.ts), então esse disparo tardio RESSUSCITA um
  // .json fantasma com o mesmo id no lugar de onde saiu. `salvar` não fecha sobre nada
  // do render (lê tudo via `useApp.getState()`), então registrar uma vez por montagem basta.
  useEffect(() => registrarFlushModal('personagem', personagemId, async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    // checa `sujo`, não `timer.current`: ver o comentário equivalente em CenarioModal.
    if (!sujo.current) return true
    return await salvar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [personagemId])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      // não fecha por cima do enquadrar retrato: o Escape dele já cuida do próprio overlay
      if (e.key === 'Escape' && !enquadrando) void fechar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquadrando])

  if (!p) return null
  const va = versaoAtivaPersonagem(p)

  function agendarSalvar(mudancas: PatchPersonagem) {
    if (timer.current) clearTimeout(timer.current)
    sujo.current = true
    timer.current = setTimeout(() => {
      timer.current = null
      void salvar()
    }, AUTOSAVE_DEBOUNCE_MS)
    // atualização otimista no cache (cartões refletem na hora)
    useApp.setState((s) => ({
      personagens: { ...s.personagens, [personagemId]: aplicarPatchPersonagem(s.personagens[personagemId], mudancas) },
    }))
  }

  async function salvar(): Promise<boolean> {
    // repo e caminho RE-RESOLVIDOS no disparo (não desestruturados do render que agendou):
    // ver o comentário equivalente em CenarioModal.salvar / state/store.ts.
    const { repo, caminhoPorId, personagens } = useApp.getState()
    const atual = personagens[personagemId]
    const caminho = caminhoPorId[personagemId]
    // entidade sumiu (excluída/movida por fora): não há mais o que gravar, e isso NÃO é falha
    if (!repo || !caminho || !atual) { sujo.current = false; return true }
    try {
      await repo.salvarPersonagem(caminho, { ...atual })
      sujo.current = false // só agora a edição está confirmada em disco
      setSalvarErro(null)
      await recarregarArvore()
      return true
    } catch (e) {
      // não relança: chamadas debounced são fire-and-forget. `sujo` continua `true` de
      // propósito — ver o comentário equivalente em CenarioModal.
      console.error('Falha ao salvar perfil:', e)
      setSalvarErro(String(e))
      return false
    }
  }

  async function trocarRetrato() {
    const caminho = caminhoPorId[personagemId]
    if (!repo || !caminho || !vaultPath) return
    try {
      const arquivo = await open({
        title: 'Escolher retrato',
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      if (typeof arquivo !== 'string') return
      const nomeArquivo = arquivo.split(/[\\/]/).pop() ?? ''
      const ext = (nomeArquivo.includes('.') ? nomeArquivo.split('.').pop()! : 'png').toLowerCase()
      // assets/ da mesma campanha do personagem: campanhas/<slug>/personagens/x.json
      const dirCampanha = caminho.split('/').slice(0, 2).join('/')
      const destinoRel = `${dirCampanha}/assets/retrato-${personagemId}-${p.versaoAtivaId}.${ext}`
      await repo.copiarParaCofre(arquivo, destinoRel)
      // modificadoEm novo muda o ?v= do retratoSrc na hora (cache-bust otimista).
      // foco volta ao centro: o da imagem antiga não quer dizer nada na nova.
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
      if (!ok) return // banner explica a falha; segundo ✕ (sem save pendente) ainda fecha
    }
    fecharPerfil()
  }

  return (
    <div className="modal-overlay" onClick={() => void fechar()}>
      <div className="perfil-modal" onClick={(e) => e.stopPropagation()}>
        <div className="perfil-header">
          <div className="perfil-retrato" onClick={() => void trocarRetrato()} title="Clique para trocar o retrato">
            {retratoSrc && !erroImg
              ? <img src={retratoSrc} alt={p.nome} style={{ objectPosition: posicaoCss(va.foco) }}
                  onError={() => setErroImg(true)} />
              : <span>{p.nome.charAt(0).toUpperCase()}</span>}
            {retratoSrc && !erroImg && (
              // stopPropagation: sem ele o clique subiria e abriria o seletor de arquivo junto
              <button className="perfil-retrato-enquadrar" title="Enquadrar retrato"
                onClick={(e) => { e.stopPropagation(); setEnquadrando(true) }}>🎯</button>
            )}
          </div>
          <div className="perfil-titulos">
            <input className="perfil-nome" value={va.nome}
              onChange={(e) => agendarSalvar({ nome: e.target.value })} />
            <input className="perfil-resumo" placeholder="Resumo curto (aparece no cartão)"
              value={va.resumo}
              onChange={(e) => agendarSalvar({ resumo: e.target.value })} />
          </div>
          <AcoesIA
            system={SYSTEM_ESCRITOR}
            abaAtual={aba}
            rotuloAbaAtual={ABAS.find((a) => a.id === aba)?.rotulo ?? aba}
            abaEhTexto={aba !== 'imagens' && aba !== 'itens' && aba !== 'vinculos'}
            acoes={ACOES_IA_PERSONAGEM}
            snapshot={() => {
              const s = useApp.getState()
              const ent = s.personagens[personagemId]
              const vEnt = ent ? versaoAtivaPersonagem(ent) : null
              const ehTexto = aba !== 'imagens' && aba !== 'itens' && aba !== 'vinculos'
              return {
                dadosBase: `# Personagem\nNome: ${ent?.nome ?? ''}\nResumo: ${vEnt?.resumo ?? ''}`,
                textoAtual: ehTexto && vEnt ? htmlParaMarkdown((vEnt as unknown as Record<string, string>)[aba] ?? '') : '',
                contexto: s.tree ? contextoDeEntidade(personagemId, { ...s, tree: s.tree }) : '',
              }
            }}
            imagensParaIA={async (incluirGaleria) => {
              const s = useApp.getState()
              const ent = s.personagens[personagemId]
              if (!ent || !s.vaultPath) return []
              const vEnt = versaoAtivaPersonagem(ent)
              const rels = vEnt.retrato ? [vEnt.retrato] : []
              if (incluirGaleria) for (const img of vEnt.imagens ?? []) rels.push(img.rel)
              return carregarImagensIA(s.vaultPath, rels)
            }}
            conteudoDoDestino={(dest) => {
              const ent = useApp.getState().personagens[personagemId]
              return ent ? htmlParaTexto((versaoAtivaPersonagem(ent) as unknown as Record<string, string>)[dest] ?? '') : ''
            }}
            onInserir={(abaDestino, textoCru, modo) => {
              const html = markdownParaHtml(textoCru)
              const atual = useApp.getState().personagens[personagemId]
              const base = atual ? (versaoAtivaPersonagem(atual) as unknown as Record<string, string>)[abaDestino] ?? '' : ''
              const novo = modo === 'substituir' ? html : base + html
              agendarSalvar({ [abaDestino]: novo } as PatchPersonagem)
              setAba(abaDestino as Aba)
            }}
          />
          <button className="btn-icon" title="Conversar com a IA sobre este personagem"
            onClick={() => setChatAberto((v) => !v)}>💬</button>
          <button className="btn-icon perfil-fechar" onClick={() => void fechar()}>✕</button>
        </div>
        <BarraVersoesPersonagem personagemId={personagemId} />
        <BarraLocalizacao tipo="personagem" id={personagemId} />
        <div className="perfil-abas">
          {ABAS.map((a) => (
            <button key={a.id} className={aba === a.id ? 'ativo' : ''} onClick={() => setAba(a.id)}>
              {a.rotulo}
            </button>
          ))}
        </div>
        {aba === 'imagens' ? (
          <GaleriaPersonagem
            personagemId={personagemId}
            imagens={va.imagens}
            onImagensChange={(imagens) => agendarSalvar({ imagens })}
          />
        ) : aba === 'vinculos' ? (
          <AbaVinculos entidadeTipo="personagem" entidadeId={personagemId} />
        ) : aba === 'itens' ? (
          <AcervoCenario
            className="inventario-acervo-cheio"
            acervo={va.acervo ?? []}
            onChange={(mudanca) => {
              // lê o acervo mais fresco do store, não o `va.acervo` fechado neste render — mesmo
              // motivo do CenarioModal: um updater assíncrono pode resolver depois de uma edição
              // concorrente já ter mudado o acervo
              const atualPersonagem = useApp.getState().personagens[personagemId]
              const acervoAtual = (atualPersonagem ? versaoAtivaPersonagem(atualPersonagem).acervo : va.acervo) ?? []
              const acervo = typeof mudanca === 'function' ? mudanca(acervoAtual) : mudanca
              agendarSalvar({ acervo })
            }}
          />
        ) : (
          <EditorTexto
            key={`${aba}:${p.versaoAtivaId}`}
            value={va[aba as AbaTexto]}
            onChange={(html) => agendarSalvar({ [aba]: html } as PatchPersonagem)}
          />
        )}
        {salvarErro && (
          <div className="perfil-salvar-erro">Falha ao salvar: {salvarErro}</div>
        )}
      </div>
      {chatAberto && (
        <ChatEntidade tipo="personagem" entidadeId={personagemId} onFechar={() => setChatAberto(false)} />
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
