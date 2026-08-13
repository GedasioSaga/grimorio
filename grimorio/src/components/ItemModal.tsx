import { useEffect, useRef, useState } from 'react'
import { open, message } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import type { Item } from '../lib/types'
import { EditorTexto } from './EditorTexto'
import { AbaVinculos } from './AbaVinculos'
import { AcoesIA, type AcaoIA } from './AcoesIA'
import { ChatEntidade } from './ChatEntidade'
import { contextoDeEntidade } from '../lib/contextoIA'
import { htmlParaTexto } from '../lib/htmlTexto'
import { htmlParaMarkdown, markdownParaHtml } from '../lib/markdownHtml'
import { carregarImagensIA } from '../lib/imagensIA'
import { promptDescreverImagemTopicos, SYSTEM_ESCRITOR } from '../lib/promptsIA'
import { EnquadrarRetrato } from './EnquadrarRetrato'
import { posicaoCss } from '../lib/focoRetrato'

const AUTOSAVE_DEBOUNCE_MS = 800

type Aba = 'descricao' | 'informacao' | 'efeito' | 'vinculos'
type AbaTexto = Exclude<Aba, 'vinculos'>

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'descricao', rotulo: 'Descrição' },
  { id: 'informacao', rotulo: 'Informações' },
  { id: 'efeito', rotulo: 'Efeito' },
  { id: 'vinculos', rotulo: 'Vínculos' },
]

const ACOES_IA_ITEM: AcaoIA[] = [
  {
    rotulo: 'Sugerir efeito',
    prompt:
      'Proponha o efeito deste item nas regras: o que ele faz, quando é usado e qual o custo ou risco. ' +
      'Seja concreto e jogável; evite poder sem contrapartida.',
    abaDestino: 'efeito',
    rotuloDestino: 'Efeito',
  },
  {
    rotulo: 'Sugerir história do item',
    prompt:
      'Escreva a procedência deste item em um parágrafo: quem o fez, por que, e como ele chegou onde está. ' +
      'Termine com um gancho que um mestre possa usar na mesa.',
    abaDestino: 'descricao',
    rotuloDestino: 'Descrição',
  },
  {
    rotulo: 'Descrever imagem em tópicos',
    prompt: promptDescreverImagemTopicos(),
    abaDestino: 'descricao',
    rotuloDestino: 'Descrição',
    comImagem: true,
  },
]

/**
 * Ficha do item. Mais simples que a de personagem/cenário de propósito: sem versões
 * (item que muda de estado é outro item) e sem galeria — três seções e as relações.
 */
export function ItemModal({ itemId }: { itemId: string }) {
  const item = useApp((s) => s.itens[itemId])
  const vaultPath = useApp((s) => s.vaultPath)
  const repo = useApp((s) => s.repo)
  const caminhoItemPorId = useApp((s) => s.caminhoItemPorId)
  const fecharItem = useApp((s) => s.fecharItem)
  const recarregarArvore = useApp((s) => s.recarregarArvore)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [salvarErro, setSalvarErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('descricao')
  const [chatAberto, setChatAberto] = useState(false)
  const [enquadrando, setEnquadrando] = useState(false)

  // ?v= força refetch quando o retrato troca mantendo o mesmo nome de arquivo
  const retratoSrc = item?.retrato && vaultPath
    ? `${convertFileSrc(`${vaultPath}/${item.retrato}`)}?v=${encodeURIComponent(item.modificadoEm)}`
    : null

  const [erroImg, setErroImg] = useState(false)
  useEffect(() => {
    setErroImg(false)
  }, [retratoSrc])

  // desmontou com gravação pendente: cancela o debounce e grava já (fire-and-forget;
  // VaultRepo serializa escritas por caminho, mesmo padrão do CenarioModal)
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      void salvar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!item) return null

  function agendarSalvar(mudancas: Partial<Item>) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      void salvar()
    }, AUTOSAVE_DEBOUNCE_MS)
    // atualização otimista no cache (sidebar reflete na hora)
    useApp.setState((s) => ({ itens: { ...s.itens, [itemId]: { ...s.itens[itemId], ...mudancas } } }))
  }

  async function salvar(): Promise<boolean> {
    const atual = useApp.getState().itens[itemId]
    const caminho = caminhoItemPorId[itemId]
    if (!repo || !caminho || !atual) return true
    try {
      await repo.salvarItem(caminho, { ...atual })
      setSalvarErro(null)
      await recarregarArvore()
      return true
    } catch (e) {
      // não relança: chamadas debounced são fire-and-forget
      console.error('Falha ao salvar item:', e)
      setSalvarErro(String(e))
      return false
    }
  }

  async function trocarRetrato() {
    if (!repo || !vaultPath) return
    try {
      const arquivo = await open({
        title: 'Escolher imagem do item',
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      if (typeof arquivo !== 'string') return
      const nomeArquivo = arquivo.split(/[\\/]/).pop() ?? ''
      const ext = (nomeArquivo.includes('.') ? nomeArquivo.split('.').pop()! : 'png').toLowerCase()
      // central e estável: mover o item de pasta não quebra o rel
      const destinoRel = `imagens-itens/retrato-${itemId}.${ext}`
      await repo.copiarParaCofre(arquivo, destinoRel)
      // foco volta ao centro: o da imagem antiga não quer dizer nada na nova
      agendarSalvar({ retrato: destinoRel, foco: undefined, modificadoEm: new Date().toISOString() })
      setEnquadrando(true) // hora natural de enquadrar: acabou de escolher
    } catch (e) {
      await message(`Falha ao trocar imagem: ${e}`, { title: 'Grimório', kind: 'error' })
    }
  }

  async function fechar() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      const ok = await salvar()
      if (!ok) return
    }
    fecharItem()
  }

  return (
    <div className="modal-overlay" onClick={() => void fechar()}>
      <div className="perfil-modal" onClick={(e) => e.stopPropagation()}>
        <div className="perfil-header">
          <div className="perfil-retrato" onClick={() => void trocarRetrato()} title="Clique para trocar a imagem">
            {retratoSrc && !erroImg
              ? <img src={retratoSrc} alt={item.nome} style={{ objectPosition: posicaoCss(item.foco) }}
                  onError={() => setErroImg(true)} />
              : <span>💎</span>}
            {retratoSrc && !erroImg && (
              // stopPropagation: sem ele o clique subiria e abriria o seletor de arquivo junto
              <button className="perfil-retrato-enquadrar" title="Enquadrar imagem"
                onClick={(e) => { e.stopPropagation(); setEnquadrando(true) }}>🎯</button>
            )}
          </div>
          <div className="perfil-titulos">
            <input className="perfil-nome" value={item.nome}
              onChange={(e) => agendarSalvar({ nome: e.target.value })} />
            <input className="perfil-resumo" placeholder="Resumo curto (aparece nas listas e no contexto da IA)"
              value={item.resumo}
              onChange={(e) => agendarSalvar({ resumo: e.target.value })} />
          </div>
          <AcoesIA
            system={SYSTEM_ESCRITOR}
            abaAtual={aba}
            rotuloAbaAtual={ABAS.find((a) => a.id === aba)?.rotulo ?? aba}
            abaEhTexto={aba !== 'vinculos'}
            acoes={ACOES_IA_ITEM}
            snapshot={() => {
              const s = useApp.getState()
              const ent = s.itens[itemId]
              const ehTexto = aba !== 'vinculos'
              return {
                dadosBase: `# Item\nNome: ${ent?.nome ?? ''}\nResumo: ${ent?.resumo ?? ''}`,
                textoAtual: ehTexto && ent ? htmlParaMarkdown((ent as unknown as Record<string, string>)[aba] ?? '') : '',
                contexto: s.tree ? contextoDeEntidade(itemId, { ...s, tree: s.tree }) : '',
              }
            }}
            imagensParaIA={async () => {
              const s = useApp.getState()
              const ent = s.itens[itemId]
              if (!ent?.retrato || !s.vaultPath) return []
              return carregarImagensIA(s.vaultPath, [ent.retrato])
            }}
            conteudoDoDestino={(dest) => {
              const ent = useApp.getState().itens[itemId]
              return ent ? htmlParaTexto((ent as unknown as Record<string, string>)[dest] ?? '') : ''
            }}
            onInserir={(abaDestino, textoCru, modo) => {
              const html = markdownParaHtml(textoCru)
              const atual = useApp.getState().itens[itemId]
              const base = atual ? (atual as unknown as Record<string, string>)[abaDestino] ?? '' : ''
              agendarSalvar({ [abaDestino]: modo === 'substituir' ? html : base + html } as Partial<Item>)
              setAba(abaDestino as Aba)
            }}
          />
          <button className="btn-icon" title="Conversar com a IA sobre este item"
            onClick={() => setChatAberto((v) => !v)}>💬</button>
          <button className="btn-icon perfil-fechar" onClick={() => void fechar()}>✕</button>
        </div>
        <div className="perfil-abas">
          {ABAS.map((a) => (
            <button key={a.id} className={aba === a.id ? 'ativo' : ''} onClick={() => setAba(a.id)}>
              {a.rotulo}
            </button>
          ))}
        </div>
        {aba === 'vinculos' ? (
          <AbaVinculos entidadeTipo="item" entidadeId={itemId} />
        ) : (
          <EditorTexto
            key={aba}
            value={item[aba as AbaTexto]}
            onChange={(html) => agendarSalvar({ [aba]: html } as Partial<Item>)}
          />
        )}
        {salvarErro && (
          <div className="perfil-salvar-erro">Falha ao salvar: {salvarErro}</div>
        )}
      </div>
      {chatAberto && (
        <ChatEntidade tipo="item" entidadeId={itemId} onFechar={() => setChatAberto(false)} />
      )}
      {enquadrando && retratoSrc && (
        <EnquadrarRetrato
          src={retratoSrc}
          focoInicial={item.foco}
          aoSalvar={(foco) => { agendarSalvar({ foco }); setEnquadrando(false) }}
          aoFechar={() => setEnquadrando(false)}
        />
      )}
    </div>
  )
}
