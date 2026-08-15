/**
 * Lixeira do cofre — a metade PURA. Decide, sem tocar disco, para onde uma entidade excluída vai
 * e como o registro dela é formado; quem executa é `lixeiraExecutar.ts`, do mesmo jeito que
 * `sync/reconciliar.ts` decide e `sync/executar.ts` faz.
 *
 * Fica DENTRO do cofre (`.lixeira/` na raiz), fora de `campanhas/`, `personagens-soltos/`,
 * `cenarios/` e `itens/` — os únicos diretórios que `vaultRepo.montarArvore*` varre. Por estar
 * fora deles, um item na lixeira já não aparece em sidebar, busca, teia ou seletor de vínculo
 * SEM precisar filtrar nenhum desses lugares: eles simplesmente nunca olham para `.lixeira/`.
 *
 * Cada entrada mora na sua PRÓPRIA pasta (`.lixeira/<id>/`), nomeada pelo id da entrada — nunca
 * pelo nome do arquivo original. Isso elimina colisão de nome DENTRO da lixeira por construção;
 * a colisão só pode acontecer na volta (`nomeFinalRestauro`), quando o destino já tem algo com
 * aquele nome.
 *
 * O REGISTRO da entrada (`entrada.json`) mora DENTRO dessa mesma pasta, não num `lixeira.json`
 * compartilhado na raiz da lixeira. Não é só organização: um arquivo compartilhado que dois
 * computadores escrevem entre dois ciclos de sync é exatamente a receita de um conflito — e
 * `sync/conflito.ts` classificaria esse `.json` como `'entidade'` (não é `vinculos.json`, não tem
 * política de união), então um dos dois lados perderia entradas em silêncio. Com `entrada.json`
 * por pasta, cada `id` nasce de UMA exclusão, num computador só; dois computadores nunca escrevem
 * o mesmo caminho, e não há conflito a resolver — nem em teoria. Ver `LixeiraExecutor.listar`.
 */

export const DIR_LIXEIRA = '.lixeira'
export const ARQUIVO_ENTRADA = 'entrada.json'

export type TipoLixeira = 'personagem' | 'cenario' | 'item' | 'canvas' | 'mapa' | 'pasta' | 'pagina' | 'campanha'

/**
 * Uma entidade excluída, esperando na lixeira. Serializada como `entrada.json` dentro de
 * `.lixeira/<id>/` — `id` aqui é o mesmo id da pasta que a contém (`caminhoArquivoEntrada`).
 *
 * `ehPasta` distingue as duas mecânicas de restauração: cenário, pasta organizacional e campanha
 * são DIRETÓRIOS (a entidade é a pasta — mesmo caso especial de `sync/conflito.ts` para cenário),
 * o resto é um arquivo `.json` que pode ter uma pasta `.notas` irmã (`temNotas`).
 *
 * `entidadeId` é o `id` de dentro do JSON (personagem/cenário/item/canvas/campanha) ou da
 * `pasta.json`, não o `id` desta entrada. Existe só para o esvaziar-de-vez saber quais vínculos
 * limpar — mover para a lixeira NUNCA mexe em `vinculos.json` (é o que faz o vínculo reaparecer
 * sozinho se o item for restaurado).
 */
export interface EntradaLixeira {
  id: string
  tipo: TipoLixeira
  nome: string
  excluidoEm: string
  /** dir de origem — onde restaurar. Para página, é o dir `.notas` do documento dono. */
  origemDir: string
  /** nome do arquivo ou pasta original dentro de `origemDir`; para página, sempre `'paginas'`. */
  nomeArquivo: string
  ehPasta: boolean
  temNotas?: boolean
  entidadeId?: string
  /** só em página: caminho do doc dono, pra exibir "de qual caderno veio" na tela da lixeira. */
  paginaDocCaminho?: string
}

export function dirDaEntrada(id: string): string {
  return `${DIR_LIXEIRA}/${id}`
}

/** Caminho do `entrada.json` desta entrada — o único lugar do registro dela. */
export function caminhoArquivoEntrada(id: string): string {
  return `${dirDaEntrada(id)}/${ARQUIVO_ENTRADA}`
}

/**
 * Nome livre em `existentes`, preservando o nome e a extensão originais — ao contrário de
 * `slugUnico`, que normaliza para kebab-case. Restaurar tem de devolver "Torre do Mágo.json",
 * não "torre-do-mago.json": o arquivo original não passou por slugify (o slug já existia, o nome
 * de exibição é que muda), e um arquivo de PASTA (cenário) nem tem extensão para preservar.
 */
export function nomeLivreEm(desejado: string, existentes: string[]): string {
  if (!existentes.includes(desejado)) return desejado
  const corte = desejado.lastIndexOf('.')
  const base = corte > 0 ? desejado.slice(0, corte) : desejado
  const ext = corte > 0 ? desejado.slice(corte) : ''
  let n = 2
  while (existentes.includes(`${base} (${n})${ext}`)) n++
  return `${base} (${n})${ext}`
}

/** Nome final ao restaurar esta entrada: livre de colisão no diretório de destino, nada é sobrescrito. */
export function nomeFinalRestauro(entrada: EntradaLixeira, existentesNoDestino: string[]): string {
  return nomeLivreEm(entrada.nomeArquivo, existentesNoDestino)
}

export function novaEntradaLixeira(params: {
  id: string
  tipo: TipoLixeira
  nome: string
  origemDir: string
  nomeArquivo: string
  ehPasta: boolean
  temNotas?: boolean
  entidadeId?: string
  paginaDocCaminho?: string
  agora: string
}): EntradaLixeira {
  return {
    id: params.id,
    tipo: params.tipo,
    nome: params.nome,
    excluidoEm: params.agora,
    origemDir: params.origemDir,
    nomeArquivo: params.nomeArquivo,
    ehPasta: params.ehPasta,
    temNotas: params.temNotas || undefined,
    entidadeId: params.entidadeId,
    paginaDocCaminho: params.paginaDocCaminho,
  }
}

function ehTipoValido(t: unknown): t is TipoLixeira {
  return t === 'personagem' || t === 'cenario' || t === 'item' || t === 'canvas'
    || t === 'mapa' || t === 'pasta' || t === 'pagina' || t === 'campanha'
}

/**
 * Repara uma entrada lida do disco; entrada sem os campos mínimos (tipo/nomeArquivo) é
 * descartada — quem chama decide o que fazer com `null` (pular, no caso de `entrada.json`
 * corrompido: uma entrada ilegível não pode esconder as outras).
 *
 * `idDaPasta` é o id da PASTA onde `entrada.json` foi encontrado — vira o `id` final da entrada
 * SEMPRE, por cima do que estiver (ou não) gravado dentro do arquivo. A pasta é a fonte da
 * verdade da identidade (é ela que `restaurar`/`esvaziar` de fato apagam); o campo `id` dentro do
 * JSON é redundante por construção, e confiar nele deixaria a entrada "andar" para outra pasta se
 * algum dia divergissem.
 */
export function normalizarEntradaLixeira(raw: unknown, idDaPasta: string): EntradaLixeira | null {
  const e = raw as Partial<EntradaLixeira> | null
  if (!e || typeof e !== 'object') return null
  if (!ehTipoValido(e.tipo)) return null
  if (typeof e.origemDir !== 'string') return null
  if (typeof e.nomeArquivo !== 'string' || !e.nomeArquivo) return null
  return {
    id: idDaPasta,
    tipo: e.tipo,
    nome: typeof e.nome === 'string' && e.nome ? e.nome : e.nomeArquivo,
    excluidoEm: typeof e.excluidoEm === 'string' ? e.excluidoEm : '',
    origemDir: e.origemDir,
    nomeArquivo: e.nomeArquivo,
    ehPasta: e.ehPasta === true,
    temNotas: e.temNotas === true ? true : undefined,
    entidadeId: typeof e.entidadeId === 'string' ? e.entidadeId : undefined,
    paginaDocCaminho: typeof e.paginaDocCaminho === 'string' ? e.paginaDocCaminho : undefined,
  }
}
