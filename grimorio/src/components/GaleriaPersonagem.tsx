import { useEffect, useState } from 'react'
import { open, ask, message } from '@tauri-apps/plugin-dialog'
import { convertFileSrc } from '@tauri-apps/api/core'
import { useApp } from '../state/store'
import { caminhoAbsolutoImagem } from '../lib/caminhos'
import { adicionarImagem, removerImagem } from '../lib/imagemPersonagem'
import type { ImagemPersonagem } from '../lib/types'
import type { DonoImagem } from '../lib/organizarImagens/nomes'
import { destinoImagemNova } from './destinoImagem'

/**
 * Galeria em grade da aba Imagens. Copia arquivos escolhidos para a pasta do dono
 * (`imagens/personagens/<Nome>/01-a3f9.png`…) — o mesmo endereço que o "Organizar imagens" daria —
 * e guarda só `rel`. A persistência é do pai (via `onImagensChange` → autosave do modal).
 *
 * Tirar uma imagem da galeria só apaga o ARQUIVO se ninguém mais o cita: versão clonada herda os
 * mesmos arquivos da galeria de origem, e um mapa pode ter a mesma imagem num card.
 */
export function GaleriaPersonagem({
  dono,
  imagens,
  onImagensChange,
  entidade,
  arquivoEntidade,
}: {
  /** de quem são as imagens: decide a pasta onde as cópias nascem */
  dono: DonoImagem
  imagens: ImagemPersonagem[]
  onImagensChange: (novo: ImagemPersonagem[]) => void
  /** a entidade inteira em memória (todas as versões), para a checagem de citação */
  entidade: unknown
  /** JSON da entidade no cofre; `null` = desconhecido, e aí o arquivo removido nunca é apagado */
  arquivoEntidade: string | null
}) {
  const vaultPath = useApp((s) => s.vaultPath)
  const repo = useApp((s) => s.repo)
  const [ampliadaRel, setAmpliadaRel] = useState<string | null>(null)

  const ampliada = imagens.find((i) => i.rel === ampliadaRel) ?? null

  useEffect(() => {
    if (!ampliadaRel) return
    // stopPropagation: sem ele o Escape borbulha até o listener do modal em window e fecha os dois de uma vez
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setAmpliadaRel(null) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ampliadaRel])

  async function adicionar() {
    if (!repo) return
    let lista = imagens
    try {
      const escolha = await open({
        title: 'Escolher imagens',
        multiple: true,
        filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
      })
      const arquivos = Array.isArray(escolha) ? escolha : escolha ? [escolha] : []
      for (const arquivo of arquivos) {
        const nomeArquivo = arquivo.split(/[\\/]/).pop() ?? ''
        const ext = (nomeArquivo.includes('.') ? nomeArquivo.split('.').pop()! : 'png').toLowerCase()
        const destinoRel = await destinoImagemNova(dono, { papel: 'numerada' }, ext, { caminho: arquivo })
        await repo.copiarParaCofre(arquivo, destinoRel)
        lista = adicionarImagem(lista, destinoRel)
      }
      if (lista !== imagens) onImagensChange(lista)
    } catch (e) {
      if (lista !== imagens) onImagensChange(lista) // persiste o que já copiou antes do erro
      await message(`Falha ao adicionar imagens: ${e}`, { title: 'Grimório', kind: 'error' })
    }
  }

  async function remover(rel: string) {
    if (!(await ask('Remover esta imagem do personagem?', { title: 'Grimório', kind: 'warning' }))) return
    // a entidade de ANTES da remoção: ainda tem esta citação, que é a única permitida
    const antes = entidade
    onImagensChange(removerImagem(imagens, rel))
    setAmpliadaRel(null)
    if (!repo || arquivoEntidade === null) return // na dúvida, o arquivo fica
    try {
      const ninguemMais = await repo.citacaoUnicaDaImagem(rel, { valor: antes, arquivo: arquivoEntidade, permitidas: 1 })
      if (ninguemMais) await repo.removerArquivoCofre(rel)
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
