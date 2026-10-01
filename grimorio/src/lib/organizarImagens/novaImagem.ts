import { nomeCenarioExibido } from '../nomeCenarioExibido'
import {
  baseDoArquivo, chaveCaminho, destinoDe, ehNomeGenerico, extensaoDoCaminho, nomeCasa, nomeSemExtensao, pastaDe,
  type DonoImagem, type PapelImagem,
} from './nomes'

/**
 * Nome de imagem NOVA — a que o usuário cola, arrasta ou escolhe agora. Nasce já no endereço que
 * o "Organizar imagens" daria a ela, para o cofre não voltar a acumular nome-código.
 *
 * Sem Tauri: quem lista a pasta é injetado (`VaultRepo.listarArquivosEm` no app).
 */

/**
 * Nomes já entregues nesta sessão e talvez ainda não gravados. Arrastar três imagens de uma vez
 * dispara três uploads em paralelo; os três listariam a pasta vazia e escolheriam `01`. Reservar
 * logo depois de escolher — sem `await` entre um e outro — é o que os separa.
 */
const reservados = new Set<string>()

export interface OpcoesDestino {
  /** `sufixoDoConteudo` da imagem nova: evita que dois PCs offline escolham o mesmo nome. */
  sufixo?: string
  /** A imagem que esta substitui (troca de retrato). */
  atual?: string | null
  /**
   * A checagem de citação única (`citacaoUnica`): `true` só se ninguém além da citação que está
   * sendo trocada cita `rel`. Sem ela, `atual` nunca é reaproveitado.
   */
  podeSobrescrever?: (rel: string) => Promise<boolean>
}

/**
 * Primeiro destino livre para a imagem.
 *
 * Trocar o retrato reaproveita o arquivo `atual` — sobrescreve, em vez de deixar o velho órfão ao
 * lado — só se ele já mora no endereço do papel, com a mesma extensão, E a checagem de citação
 * disser que ninguém mais o cita. Versão clonada herda o MESMO arquivo de retrato da versão de
 * origem; sobrescrever sem perguntar trocaria a imagem das duas. Na dúvida, nome novo.
 */
export async function reservarDestino(
  listar: (pastaRel: string) => Promise<string[]>,
  dono: DonoImagem,
  papel: PapelImagem,
  extensao: string,
  opcoes: OpcoesDestino = {},
): Promise<string> {
  const { sufixo, atual, podeSobrescrever } = opcoes
  const pasta = pastaDe(dono, papel)
  const ext = extensao.toLowerCase()
  if (atual && podeSobrescrever) {
    const corte = atual.lastIndexOf('/')
    const mesmaPasta = corte > 0 && chaveCaminho(atual.slice(0, corte)) === chaveCaminho(pasta)
    const noLugar = mesmaPasta && extensaoDoCaminho(atual) === ext && nomeCasa(nomeSemExtensao(atual), baseDoArquivo(dono, papel))
    if (noLugar && (await podeSobrescrever(atual))) return atual
  }
  let existentes: string[] = []
  try {
    existentes = await listar(pasta)
  } catch {
    // pasta ainda não existe: quem grava (`copy_file`/`write_binary_base64`) cria
  }
  const rel = destinoDe(dono, papel, ext, [...existentes, ...reservados], sufixo)
  reservados.add(chaveCaminho(rel))
  return rel
}

/**
 * Dono de uma imagem colada num documento tldraw. Mesma regra do planejador: é mapa quando o
 * documento tem camadas ou mora em `mapas-soltos/`; senão é canvas (sessão, canvas solto).
 */
export function donoDoDocumento(caminho: string, doc: { nome?: unknown; camadas?: unknown }): DonoImagem {
  const nome = typeof doc.nome === 'string' && doc.nome !== '' ? doc.nome : nomeSemExtensao(caminho)
  const ehMapa = doc.camadas !== undefined || /(^|\/)mapas-soltos\//.test(caminho)
  return ehMapa ? { tipo: 'mapa', nome } : { tipo: 'canvas', nome }
}

/** Papel de uma imagem pelo nome que ela tinha no computador do usuário. */
export function papelDoNomeOriginal(nomeArquivo: string): PapelImagem {
  return ehNomeGenerico(nomeArquivo) ? { papel: 'numerada' } : { papel: 'nomeada', nome: nomeSemExtensao(nomeArquivo) }
}

/**
 * Cadeia de nomes de um cenário, do raiz até ele, pelos diretórios: subcenário mora dentro do
 * diretório do pai. Cada nome perde o prefixo "Pai: " da convenção do cofre (`nomeCenarioExibido`).
 * `nomePorDir`: diretório do cenário → nome gravado.
 */
export function cadeiaCenario(dirCenario: string, nomePorDir: Map<string, string>): string[] {
  const porChave = new Map([...nomePorDir].map(([dir, nome]) => [chaveCaminho(dir), nome]))
  const cadeia: { nome: string }[] = []
  let dir = dirCenario
  while (dir !== '') {
    const nome = porChave.get(chaveCaminho(dir))
    if (nome !== undefined) cadeia.unshift({ nome })
    else if (cadeia.length > 0) break // subiu além do cenário raiz (pasta organizacional)
    const corte = dir.lastIndexOf('/')
    dir = corte < 0 ? '' : dir.slice(0, corte)
  }
  return cadeia.map((c, i) => (i === 0 ? c.nome : nomeCenarioExibido(c.nome, cadeia[i - 1].nome)))
}
