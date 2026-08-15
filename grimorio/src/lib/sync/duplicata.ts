import type { FsBridge } from '../fsBridge'
import { ARQUIVO_DE_CENARIO, ehCopiaDe, marcarComoCopia } from './conflito'

/**
 * Defesa contra a preservação repetida do MESMO perdedor entre ciclos (a sidebar do usuário
 * enchendo de `(conflito) Mapa do Castelo L2` idênticos).
 *
 * O buraco: `preservar.ts` carimba o nome da cópia com `deps.agora()`. Se a preservação der
 * certo mas a TRANSFERÊNCIA que vem depois falhar (rede, 403, arquivo travado), a ação cai em
 * `falhas`, `reconstruir.ts` mantém a entrada anterior do manifesto de propósito, e o ciclo
 * seguinte redetecta o mesmo conflito — só que agora é outro minuto, então é outro nome, e a
 * cópia nasce de novo. Sem alguma noção de "já preservei isto antes", o cofre acumula cópias
 * idênticas enquanto a transferência não colar.
 *
 * A defesa é achar no disco as cópias que já existem para o mesmo caminho original e comparar o
 * CONTEÚDO antes de criar mais uma.
 *
 * **A assimetria de custo manda no desenho deste módulo.** Dizer "é duplicata" quando não é
 * descarta o perdedor: some conteúdo que o usuário escreveu, em silêncio, sem desfazer. Dizer
 * "não é duplicata" quando é deixa um arquivo a mais na sidebar. Os dois erros não se comparam,
 * então todo critério aqui é o mais ESTRITO possível — na dúvida, preserva de novo.
 */

/** Onde procurar candidatos. */
export interface LocalizadorDeCopias {
  fs: FsBridge
  /** Caminho relativo -> absoluto, o mesmo `abs()` que `preservar.ts` já usa internamente. */
  abs(caminhoRelativo: string): string
}

function juntar(pasta: string, nome: string): string {
  return pasta === '' ? nome : `${pasta}/${nome}`
}

/** Pasta-mãe de um caminho relativo canônico; `''` para arquivo na raiz do cofre. */
function pastaDe(caminho: string): string {
  const corte = caminho.lastIndexOf('/')
  return corte < 0 ? '' : caminho.slice(0, corte)
}

/**
 * Onde varrer atrás de candidatos.
 *
 * Para quase tudo é a pasta-mãe do próprio arquivo. Cenário é a exceção: a cópia dele é uma
 * PASTA irmã da pasta do cenário, então a varredura sobe um nível — e as entradas encontradas
 * são diretórios, não arquivos.
 */
function pastaDaVarredura(caminho: string): { pasta: string; copiaEhPasta: boolean } {
  const pasta = pastaDe(caminho)
  const ehCenario = caminho.endsWith(`/${ARQUIVO_DE_CENARIO}`) && pasta !== ''
  return ehCenario ? { pasta: pastaDe(pasta), copiaEhPasta: true } : { pasta, copiaEhPasta: false }
}

/**
 * Cópias de conflito que já existem no disco para este `caminho`, de QUALQUER ciclo anterior —
 * candidatas a "é o mesmo perdedor de novo".
 *
 * Pasta que ainda não existe não é erro: é o caso comum (primeiro conflito deste arquivo).
 * Qualquer outra falha de leitura também devolve lista vazia, e o efeito é preservar de novo —
 * o lado seguro da assimetria. O `console.warn` separa os dois: sem ele, um bug de varredura
 * teria exatamente a mesma aparência do caso feliz.
 *
 * A separação é feita por `exists`, e não pela mensagem do erro, porque a mensagem é TEXTO
 * LOCALIZADO do sistema operacional — nunca contrato. Uma versão anterior testava a mensagem
 * por regex e nunca acertava neste computador: o Windows em português diz "O sistema não pode
 * encontrar o caminho especificado", e o padrão procurava "não encontrad". Resultado: o caso
 * mais comum do sistema avisava como se fosse falha inesperada, a cada conflito. O teste não
 * pegou porque fabricava a mensagem em inglês — entrada inventada só prova que o código
 * concorda consigo mesmo.
 *
 * A pasta sumir ENTRE o `exists` e o `listDir` gera um aviso à toa. É uma linha de log num caso
 * raríssimo, contra um aviso errado em todo primeiro conflito.
 */
export async function candidatosDeCopia(
  loc: LocalizadorDeCopias,
  caminho: string,
): Promise<string[]> {
  const { pasta, copiaEhPasta } = pastaDaVarredura(caminho)

  let entradas
  try {
    if (!(await loc.fs.exists(loc.abs(pasta)))) return []
    entradas = await loc.fs.listDir(loc.abs(pasta))
  } catch (erro) {
    console.warn(`Não deu para varrer ${pasta} atrás de cópias de conflito:`, erro)
    return []
  }

  const candidatos: string[] = []
  for (const entrada of entradas) {
    if (entrada.isDir !== copiaEhPasta) continue
    const candidato = copiaEhPasta
      ? juntar(juntar(pasta, entrada.name), ARQUIVO_DE_CENARIO)
      : juntar(pasta, entrada.name)
    if (ehCopiaDe(caminho, candidato)) candidatos.push(candidato)
  }
  return candidatos
}

/**
 * O perdedor prestes a ser preservado (`bruto`, ainda cru) já está preservado em `existente`
 * (uma cópia de um ciclo anterior, que já passou por `marcarComoCopia`)?
 *
 * Comparar bytes crus daria sempre "diferente": a cópia troca o `id` e prefixa `nome`/`titulo`
 * de propósito. A saída óbvia — escrever uma função que desfaz essas mudanças — é a que estava
 * aqui antes, e ela **perdia dado**: desprefixava TODAS as entradas de `versoes[].nome`,
 * enquanto `marcarComoCopia` só toca a versão ativa cujo nome espelha o de topo. Duas entidades
 * com versões de nomes genuinamente diferentes comparavam iguais, e o perdedor era descartado.
 *
 * Inversa escrita à mão diverge da original em silêncio. Então não há inversa: aplica-se a
 * PRÓPRIA `marcarComoCopia` ao bruto, usando o id que a cópia existente já tem. Se o bruto for
 * o mesmo perdedor, o resultado é caractere a caractere o que o ciclo anterior gravou —
 * `marcarComoCopia` é determinística dado (conteúdo, id), e `prefixar` é idempotente. Divergir
 * de `marcarComoCopia` passa a ser impossível por construção, não por disciplina.
 *
 * Comparação de string crua, e não de JSON canonicalizado: uma cópia reindentada por outra
 * ferramenta vira "diferente" e gera cópia a mais. É o lado certo de errar.
 */
export function mesmoConteudoEntidade(bruto: string, existente: string): boolean {
  const id = idDaEntidade(existente)
  if (id === null) return false
  const marcado = marcarComoCopia(bruto, id)
  // `null` = bruto não é objeto JSON com `id`; sem identidade não há como reproduzir a cópia,
  // e chutar que é a mesma custaria o conteúdo.
  return marcado !== null && marcado === existente
}

/** `id` de um JSON de entidade; `null` se ilegível — ilegível NUNCA é igual a coisa nenhuma. */
function idDaEntidade(conteudo: string): string | null {
  let lido: unknown
  try {
    lido = JSON.parse(conteudo)
  } catch {
    return null
  }
  if (typeof lido !== 'object' || lido === null || Array.isArray(lido)) return null
  const id = (lido as Record<string, unknown>).id
  return typeof id === 'string' && id !== '' ? id : null
}
