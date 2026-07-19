import { useEffect, useRef, useState } from 'react'
import { open, message } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { EditorTexto } from './EditorTexto'
import { GaleriaPersonagem } from './GaleriaPersonagem'
import { AbaVinculos } from './AbaVinculos'
import { AcoesIA, type AcaoIA } from './AcoesIA'
import { SYSTEM_MESTRE } from '../lib/chatIA'
import { contextoDeEntidade } from '../lib/contextoIA'
import { htmlParaTexto, textoParaHtml } from '../lib/htmlTexto'
import { promptDescreverImagemTopicos } from '../lib/promptsIA'
import { carregarImagensIA } from '../lib/imagensIA'
import { BarraVersoesPersonagem } from './BarraVersoesPersonagem'
import { aplicarPatchPersonagem, versaoAtivaPersonagem, type PatchPersonagem } from '../lib/personagemVersao'

const AUTOSAVE_DEBOUNCE_MS = 800

type Aba = 'descricao' | 'informacao' | 'historia' | 'imagens' | 'extras' | 'anotacoes' | 'vinculos'
type AbaTexto = Exclude<Aba, 'imagens' | 'vinculos'>

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: 'descricao', rotulo: 'Descrição' },
  { id: 'informacao', rotulo: 'Informações' },
  { id: 'historia', rotulo: 'História' },
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
    rotulo: 'Descrever imagem em tópicos',
    prompt: promptDescreverImagemTopicos(),
    abaDestino: 'descricao',
    rotuloDestino: 'Descrição',
    comImagem: true,
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
  const [salvarErro, setSalvarErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('descricao')

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
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      void salvar()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!p) return null
  const va = versaoAtivaPersonagem(p)

  function agendarSalvar(mudancas: PatchPersonagem) {
    if (timer.current) clearTimeout(timer.current)
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
    const atual = useApp.getState().personagens[personagemId]
    const caminho = caminhoPorId[personagemId]
    if (!repo || !caminho || !atual) return true
    try {
      await repo.salvarPersonagem(caminho, { ...atual })
      setSalvarErro(null)
      await recarregarArvore()
      return true
    } catch (e) {
      // não relança: chamadas debounced são fire-and-forget
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
      // modificadoEm novo muda o ?v= do retratoSrc na hora (cache-bust otimista)
      agendarSalvar({ retrato: destinoRel, modificadoEm: new Date().toISOString() })
    } catch (e) {
      await message(`Falha ao trocar retrato: ${e}`, { title: 'Grimório', kind: 'error' })
    }
  }

  async function fechar() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
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
              ? <img src={retratoSrc} alt={p.nome} onError={() => setErroImg(true)} />
              : <span>{p.nome.charAt(0).toUpperCase()}</span>}
          </div>
          <div className="perfil-titulos">
            <input className="perfil-nome" value={va.nome}
              onChange={(e) => agendarSalvar({ nome: e.target.value })} />
            <input className="perfil-resumo" placeholder="Resumo curto (aparece no cartão)"
              value={va.resumo}
              onChange={(e) => agendarSalvar({ resumo: e.target.value })} />
          </div>
          <AcoesIA
            system={SYSTEM_MESTRE}
            abaAtual={aba}
            rotuloAbaAtual={ABAS.find((a) => a.id === aba)?.rotulo ?? aba}
            abaEhTexto={aba !== 'imagens' && aba !== 'vinculos'}
            acoes={ACOES_IA_PERSONAGEM}
            snapshot={() => {
              const s = useApp.getState()
              const ent = s.personagens[personagemId]
              const vEnt = ent ? versaoAtivaPersonagem(ent) : null
              const ehTexto = aba !== 'imagens' && aba !== 'vinculos'
              return {
                dadosBase: `# Personagem\nNome: ${ent?.nome ?? ''}\nResumo: ${vEnt?.resumo ?? ''}`,
                textoAtual: ehTexto && vEnt ? htmlParaTexto((vEnt as unknown as Record<string, string>)[aba] ?? '') : '',
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
              const html = textoParaHtml(textoCru)
              const atual = useApp.getState().personagens[personagemId]
              const base = atual ? (versaoAtivaPersonagem(atual) as unknown as Record<string, string>)[abaDestino] ?? '' : ''
              const novo = modo === 'substituir' ? html : base + html
              agendarSalvar({ [abaDestino]: novo } as PatchPersonagem)
              setAba(abaDestino as Aba)
            }}
          />
          <button className="btn-icon perfil-fechar" onClick={() => void fechar()}>✕</button>
        </div>
        <BarraVersoesPersonagem personagemId={personagemId} />
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
    </div>
  )
}
