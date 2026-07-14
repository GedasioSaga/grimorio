import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { adicionarImagem, removerImagem } from '../lib/imagemPersonagem'
import type { ImagemPersonagem } from '../lib/types'

/**
 * Galeria em grade da aba Imagens. Copia arquivos escolhidos para
 * `<dir-do-personagem>/assets/` (mesmo padrão do retrato) e guarda só `rel`.
 * A persistência é do pai (via `onImagensChange` → autosave do modal).
 */
export function GaleriaPersonagem({
  personagemId,
  imagens,
  onImagensChange,
}: {
  personagemId: string
  imagens: ImagemPersonagem[]
  onImagensChange: (novo: ImagemPersonagem[]) => void
}) {
  const vaultPath = useApp((s) => s.vaultPath)
  const repo = useApp((s) => s.repo)
  const caminhoPorId = useApp((s) => s.caminhoPorId)
  const [ampliadaRel, setAmpliadaRel] = useState<string | null>(null)

  const ampliada = imagens.find((i) => i.rel === ampliadaRel) ?? null

  async function adicionar() {
    const caminho = caminhoPorId[personagemId]
    if (!repo || !caminho) return
    // assets/ da mesma pasta do personagem (igual ao retrato)
    const dirAssets = `${caminho.split('/').slice(0, 2).join('/')}/assets`
    try {
      const escolha = await open({
        title: 'Escolher imagens',
        multiple: true,
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      const arquivos = Array.isArray(escolha) ? escolha : escolha ? [escolha] : []
      let lista = imagens
      for (const arquivo of arquivos) {
        const nomeArquivo = arquivo.split(/[\\/]/).pop() ?? ''
        const ext = (nomeArquivo.includes('.') ? nomeArquivo.split('.').pop()! : 'png').toLowerCase()
        const destinoRel = `${dirAssets}/galeria-${crypto.randomUUID()}.${ext}`
        await repo.copiarParaCofre(arquivo, destinoRel)
        lista = adicionarImagem(lista, destinoRel)
      }
      if (lista !== imagens) onImagensChange(lista)
    } catch (e) {
      alert(`Falha ao adicionar imagens: ${e}`)
    }
  }

  async function remover(rel: string) {
    if (!confirm('Remover esta imagem do personagem?')) return
    onImagensChange(removerImagem(imagens, rel))
    setAmpliadaRel(null)
    try {
      await repo?.removerArquivoCofre(rel)
    } catch (e) {
      console.error('Falha ao apagar arquivo da galeria:', e)
    }
  }

  function editarLegenda(rel: string, legenda: string) {
    onImagensChange(imagens.map((i) => (i.rel === rel ? { ...i, legenda: legenda || undefined } : i)))
  }

  const src = (rel: string) => (vaultPath ? convertFileSrc(caminhoAbsolutoImagem(vaultPath, rel)) : '')

  return (
    <div className="galeria">
      <div className="galeria-topo">
        <button onClick={() => void adicionar()}>+ Adicionar</button>
      </div>
      {imagens.length === 0 ? (
        <p className="galeria-vazia">Nenhuma imagem ainda. Clique em “+ Adicionar”.</p>
      ) : (
        <div className="galeria-grade">
          {imagens.map((img) => (
            <button key={img.rel} className="galeria-item" onClick={() => setAmpliadaRel(img.rel)} title={img.legenda ?? ''}>
              <img src={src(img.rel)} alt={img.legenda ?? ''} onError={(e) => { e.currentTarget.style.visibility = 'hidden' }} />
            </button>
          ))}
        </div>
      )}

      {ampliada && (
        <div className="galeria-lightbox" onClick={() => setAmpliadaRel(null)}>
          <div className="galeria-lightbox-conteudo" onClick={(e) => e.stopPropagation()}>
            <img src={src(ampliada.rel)} alt={ampliada.legenda ?? ''} />
            <textarea
              className="galeria-legenda"
              placeholder="Legenda (opcional)…"
              value={ampliada.legenda ?? ''}
              onChange={(e) => editarLegenda(ampliada.rel, e.target.value)}
            />
            <div className="galeria-lightbox-acoes">
              <button onClick={() => void remover(ampliada.rel)}>Remover</button>
              <button onClick={() => setAmpliadaRel(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
