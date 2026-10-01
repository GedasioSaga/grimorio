import { useApp } from '../state/store'
import { hashArquivo } from '../lib/hashBridge'
import { sha256Bytes } from '../lib/organizarImagens/impressao'
import { cadeiaCenario, reservarDestino } from '../lib/organizarImagens/novaImagem'
import { sufixoDoConteudo, type DonoImagem, type PapelImagem } from '../lib/organizarImagens/nomes'

/**
 * Costura entre o store e `reservarDestino`: imagem nova escolhida em modal, galeria, nota, mapa ou
 * transformação nasce no endereço legível do dono (`imagens/personagens/<Nome>/retrato-a3f9.png`…).
 */

/** De onde vem o conteúdo: arquivo escolhido no disco (hash no Rust) ou bytes colados (hash aqui). */
export type FonteImagem = { caminho: string } | { bytes: Uint8Array }

/**
 * Troca de uma imagem que já existe (retrato). O arquivo `atual` só é sobrescrito se a checagem de
 * citação única confirmar que ninguém mais o cita — nem outra versão da `entidade` em memória, nem
 * outro arquivo do cofre. `arquivo` é o JSON da entidade; sem ele, nunca sobrescreve.
 */
export interface Substituicao {
  atual: string | null | undefined
  entidade: unknown
  arquivo: string | null
}

/**
 * Sufixo da imagem nova: do conteúdo quando dá para somar, aleatório quando não dá. O sufixo só
 * existe para dois PCs não escolherem o mesmo nome — o aleatório cumpre isso igual (perde apenas o
 * "mesma imagem, mesmo nome"). Travar a troca de retrato porque o antivírus segurou o arquivo por
 * um instante, ou porque a ponte devolveu lixo, seria pior.
 */
async function sufixoDaFonte(fonte: FonteImagem): Promise<string> {
  try {
    const hash: unknown = 'bytes' in fonte ? await sha256Bytes(fonte.bytes) : await hashArquivo(fonte.caminho)
    if (typeof hash === 'string' && /^[0-9a-f]{4}/i.test(hash)) return sufixoDoConteudo(hash)
  } catch {
    // cai no aleatório abaixo
  }
  const bytes = crypto.getRandomValues(new Uint8Array(2))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Endereço livre para a imagem nova, com o sufixo do conteúdo dela. */
export async function destinoImagemNova(
  dono: DonoImagem,
  papel: PapelImagem,
  ext: string,
  fonte: FonteImagem,
  substituir?: Substituicao,
): Promise<string> {
  const repo = useApp.getState().repo
  const sufixo = await sufixoDaFonte(fonte)
  const podeSobrescrever = repo && substituir
    ? (rel: string) => repo.citacaoUnicaDaImagem(rel, { valor: substituir.entidade, arquivo: substituir.arquivo, permitidas: 1 })
    : undefined
  return reservarDestino(
    async (pasta) => (repo ? repo.listarArquivosEm(pasta) : []),
    dono,
    papel,
    ext,
    { sufixo, atual: substituir?.atual, podeSobrescrever },
  )
}

/**
 * Cadeia de nomes do cenário no diretório `dir`, a partir dos cenários do store. `nomeNovo` cobre
 * o cenário recém-criado, que ainda não chegou ao store.
 */
export function cadeiaDoCenario(dir: string, nomeNovo?: string): string[] {
  const { caminhoCenarioPorId, cenarios } = useApp.getState()
  const nomePorDir = new Map<string, string>()
  for (const [id, d] of Object.entries(caminhoCenarioPorId)) {
    const c = cenarios[id]
    if (c) nomePorDir.set(d, c.nome)
  }
  if (nomeNovo !== undefined) nomePorDir.set(dir, nomeNovo)
  return cadeiaCenario(dir, nomePorDir)
}
