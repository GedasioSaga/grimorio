import type { CampanhaNode, Cenario, CenarioNode, PastaCenarioNode, PastaItemNode, PastaNode, VaultTree, VersaoCenario, Vinculo } from './types'

/**
 * Lógica pura da Barra de Localização: onde uma entidade mora no cofre (caminho legível,
 * com os NOMES reais das pastas — não os slugs de diretório) e para onde ela pode ir.
 *
 * A árvore (`VaultTree`) já resolve nome de pasta a partir de `pasta.json`, caindo pro slug
 * quando a pasta é legada e não tem esse arquivo (ver `vaultRepo.montarArvoreDeArquivos`) —
 * por isso basta caminhar a árvore por `id`, sem reimplementar essa resolução aqui.
 */

/** Rótulos fixos das seções raiz — não vêm de `pasta.json`, são o mesmo texto da sidebar. */
const ROTULO_PERSONAGENS = 'Personagens'
const ROTULO_CENARIOS = 'Cenários'
const ROTULO_ITENS = 'Itens'
const ROTULO_CAMPANHAS = 'Campanhas'

export interface LocalizacaoEncontrada {
  /** diretório onde a entidade está agora (dir do .json, ou o próprio dir do cenário) */
  dir: string
  /** nomes das pastas/cenários ancestrais, da raiz da seção até o pai direto (sem a raiz) */
  ancestrais: string[]
}

/** Acha um personagem (por id) na área "Personagens soltos". Null se não estiver lá (pode estar numa campanha). */
export function localizarPersonagem(raiz: PastaNode, personagemId: string): LocalizacaoEncontrada | null {
  const busca = (pasta: PastaNode, ancestrais: string[]): LocalizacaoEncontrada | null => {
    if (pasta.personagens.some((p) => p.id === personagemId)) return { dir: pasta.caminho, ancestrais }
    for (const sub of pasta.subpastas) {
      const achado = busca(sub, [...ancestrais, sub.nome])
      if (achado) return achado
    }
    return null
  }
  return busca(raiz, [])
}

/** Acha um personagem (por id) na pasta `personagens` de alguma campanha. Null se não estiver em nenhuma. */
export function localizarPersonagemEmCampanha(campanhas: CampanhaNode[], personagemId: string):
  (LocalizacaoEncontrada & { campanhaNome: string }) | null {
  for (const camp of campanhas) {
    if (camp.personagens.some((p) => p.id === personagemId)) {
      return { dir: `campanhas/${camp.slug}/personagens`, ancestrais: [camp.nome, 'Personagens'], campanhaNome: camp.nome }
    }
  }
  return null
}

/** Acha um item (por id) na área "Itens". */
export function localizarItem(raiz: PastaItemNode, itemId: string): LocalizacaoEncontrada | null {
  const busca = (pasta: PastaItemNode, ancestrais: string[]): LocalizacaoEncontrada | null => {
    if (pasta.itens.some((i) => i.id === itemId)) return { dir: pasta.caminho, ancestrais }
    for (const sub of pasta.subpastas) {
      const achado = busca(sub, [...ancestrais, sub.nome])
      if (achado) return achado
    }
    return null
  }
  return busca(raiz, [])
}

/** Acha um cenário (por id) na área "Cenários": pastas organizacionais + cenários aninhados. */
export function localizarCenario(raiz: PastaCenarioNode, cenarioId: string): LocalizacaoEncontrada | null {
  const dentroDosCenarios = (nos: CenarioNode[], ancestrais: string[]): LocalizacaoEncontrada | null => {
    for (const n of nos) {
      if (n.id === cenarioId) return { dir: n.caminho, ancestrais }
      const achado = dentroDosCenarios(n.filhos, [...ancestrais, n.nome])
      if (achado) return achado
    }
    return null
  }
  const dentroDaPasta = (p: PastaCenarioNode, ancestrais: string[]): LocalizacaoEncontrada | null => {
    const achado = dentroDosCenarios(p.cenarios, ancestrais)
    if (achado) return achado
    for (const sub of p.subpastas) {
      const achadoSub = dentroDaPasta(sub, [...ancestrais, sub.nome])
      if (achadoSub) return achadoSub
    }
    return null
  }
  return dentroDaPasta(raiz, [])
}

/** Caminho legível de um personagem (raiz + ancestrais + o próprio nome). Null se o id não estiver na árvore (cache desatualizado). */
export function caminhoLegivelPersonagem(tree: VaultTree, personagemId: string, nomeEntidade: string): string[] | null {
  const emCampanha = localizarPersonagemEmCampanha(tree.campanhas, personagemId)
  if (emCampanha) return [ROTULO_CAMPANHAS, ...emCampanha.ancestrais, nomeEntidade]
  const achado = localizarPersonagem(tree.personagensSoltos, personagemId)
  if (!achado) return null
  return [ROTULO_PERSONAGENS, ...achado.ancestrais, nomeEntidade]
}

/** Caminho legível de um item. Null se o id não estiver na árvore. */
export function caminhoLegivelItem(tree: VaultTree, itemId: string, nomeEntidade: string): string[] | null {
  const achado = localizarItem(tree.itens, itemId)
  if (!achado) return null
  return [ROTULO_ITENS, ...achado.ancestrais, nomeEntidade]
}

/** Caminho legível de um cenário. Null se o id não estiver na árvore. */
export function caminhoLegivelCenario(tree: VaultTree, cenarioId: string, nomeEntidade: string): string[] | null {
  const achado = localizarCenario(tree.cenarios, cenarioId)
  if (!achado) return null
  return [ROTULO_CENARIOS, ...achado.ancestrais, nomeEntidade]
}

/** Um destino oferecido no seletor. `id` só vem preenchido nas opções que são CENÁRIOS (não pastas). */
export interface OpcaoDestino {
  caminho: string
  rotulo: string
  id?: string
}

/** Destinos válidos para mover um personagem: toda pasta de "Personagens soltos" + a pasta de personagens de cada campanha. */
export function destinosPersonagem(tree: VaultTree): OpcaoDestino[] {
  const out: OpcaoDestino[] = []
  const daPasta = (pasta: PastaNode, ancestrais: string[]) => {
    out.push({ caminho: pasta.caminho, rotulo: [ROTULO_PERSONAGENS, ...ancestrais].join(' > ') })
    for (const sub of pasta.subpastas) daPasta(sub, [...ancestrais, sub.nome])
  }
  daPasta(tree.personagensSoltos, [])
  for (const camp of tree.campanhas) {
    out.push({ caminho: `campanhas/${camp.slug}/personagens`, rotulo: `${ROTULO_CAMPANHAS} > ${camp.nome} > ${ROTULO_PERSONAGENS}` })
  }
  return out
}

/** Destinos válidos para mover um item: toda pasta da área "Itens". */
export function destinosItem(tree: VaultTree): OpcaoDestino[] {
  const out: OpcaoDestino[] = []
  const daPasta = (pasta: PastaItemNode, ancestrais: string[]) => {
    out.push({ caminho: pasta.caminho, rotulo: [ROTULO_ITENS, ...ancestrais].join(' > ') })
    for (const sub of pasta.subpastas) daPasta(sub, [...ancestrais, sub.nome])
  }
  daPasta(tree.itens, [])
  return out
}

/** Todo cenário que NÃO é o próprio `cenarioId` nem descendente dele — a raiz da recursão comum às duas ações de cenário. */
function outrosCenarios(tree: VaultTree, cenarioId: string): OpcaoDestino[] {
  const proprio = localizarCenario(tree.cenarios, cenarioId)
  const dirProprio = proprio?.dir
  const ehProprioOuDescendente = (dir: string) => !!dirProprio && (dir === dirProprio || dir.startsWith(`${dirProprio}/`))
  const out: OpcaoDestino[] = []
  const dosNos = (nos: CenarioNode[], ancestrais: string[]) => {
    for (const n of nos) {
      // `continue` pula o nó E a recursão nele: os filhos de um descendente também são descendentes
      if (ehProprioOuDescendente(n.caminho)) continue
      out.push({ caminho: n.caminho, rotulo: [ROTULO_CENARIOS, ...ancestrais, n.nome].join(' > '), id: n.id })
      dosNos(n.filhos, [...ancestrais, n.nome])
    }
  }
  const daPasta = (p: PastaCenarioNode, ancestrais: string[]) => {
    dosNos(p.cenarios, ancestrais)
    for (const sub of p.subpastas) daPasta(sub, [...ancestrais, sub.nome])
  }
  daPasta(tree.cenarios, [])
  return out
}

/** Destinos para "Mover para dentro de...": pastas organizacionais + outros cenários (exceto o próprio/descendentes). */
export function destinosMoverCenario(tree: VaultTree, cenarioId: string): OpcaoDestino[] {
  const pastas: OpcaoDestino[] = []
  const daPasta = (p: PastaCenarioNode, ancestrais: string[]) => {
    pastas.push({ caminho: p.caminho, rotulo: [ROTULO_CENARIOS, ...ancestrais].join(' > ') })
    for (const sub of p.subpastas) daPasta(sub, [...ancestrais, sub.nome])
  }
  daPasta(tree.cenarios, [])
  return [...pastas, ...outrosCenarios(tree, cenarioId)]
}

/** Destinos para "Transformar em versão de...": só cenários (exceto o próprio/descendentes) — nunca uma pasta. */
export function destinosAbsorverCenario(tree: VaultTree, cenarioId: string): OpcaoDestino[] {
  return outrosCenarios(tree, cenarioId)
}

/** Barra o destino inválido antes de chamar o repo: o próprio cenário ou um descendente dele. */
export function cenarioDestinoValido(tree: VaultTree, cenarioId: string, dirDestino: string): boolean {
  const proprio = localizarCenario(tree.cenarios, cenarioId)
  if (!proprio) return false
  return dirDestino !== proprio.dir && !dirDestino.startsWith(`${proprio.dir}/`)
}

/**
 * Nomes das versões absorvidas de um cenário que vira versão de outro.
 * Cenário com uma versão só (o caso comum) vira uma versão homônima — "Torre do Mágo".
 * Cenário com várias versões (já tinha "Base"/"Destruída") precisa distinguir cada uma,
 * senão duas versões absorvidas colidiriam de nome no destino: "Torre do Mágo — Base" etc.
 */
export function nomesVersoesAbsorcao(nomeOrigem: string, versoesOrigem: readonly VersaoCenario[]): string[] {
  return versoesOrigem.length === 1
    ? [nomeOrigem]
    : versoesOrigem.map((v) => `${nomeOrigem} — ${v.nome}`)
}

/** Versões prontas para entrar no `versoes` do destino: mesmo conteúdo, id novo (nunca reusa id de outro cenário), nome sem colisão. */
export function versoesParaAbsorcao(origem: Cenario, novoId: () => string): VersaoCenario[] {
  const nomes = nomesVersoesAbsorcao(origem.nome, origem.versoes)
  return origem.versoes.map((v, i) => ({ ...v, id: novoId(), nome: nomes[i] }))
}

/** União sem duplicar — um personagem já vinculado aos dois cenários não aparece duas vezes no destino. */
export function mesclarPersonagensCenario(atuais: readonly string[], absorvidos: readonly string[]): string[] {
  return Array.from(new Set([...atuais, ...absorvidos]))
}

/**
 * Monta o cenário-destino com o conteúdo do cenário-origem absorvido: versões, personagens
 * vinculados. A versão ativa passa a ser a primeira absorvida — o usuário pousa vendo
 * exatamente o que acabou de entrar, em vez de continuar na versão que já tinha antes.
 * Puro: quem chama persiste o resultado e move a origem pra lixeira.
 */
export function absorverCenario(destino: Cenario, origem: Cenario, novoId: () => string): Cenario {
  // defesa em profundidade: mesma guarda que `moverCenario` já tem na camada baixa
  // (vaultRepo.ts) — sem isto, chamar esta função pura direto com o mesmo cenário nos
  // dois lados duplicaria as versões dele dentro dele mesmo (e o chamador mandaria o
  // "resultado" pra lixeira: o cenário se autodestruiria). A checagem de DESCENDENTE
  // fica a cargo de quem chama (store.ts), que tem a árvore; aqui só dá pra comparar id.
  if (destino.id === origem.id) {
    throw new Error('Não é possível transformar um cenário em versão dele mesmo.')
  }
  const novasVersoes = versoesParaAbsorcao(origem, novoId)
  return {
    ...destino,
    versoes: [...destino.versoes, ...novasVersoes],
    versaoAtivaId: novasVersoes[0].id,
    personagens: mesclarPersonagensCenario(destino.personagens, origem.personagens),
  }
}

/**
 * Redireciona os vínculos que apontavam para `origemId` (cenário absorvido) para
 * `destinoId`: sem isto, toda relação tipada com a origem vira "quebrada" mesmo com o
 * conteúdo dela vivo dentro do destino agora (ver `store.ts`, `absorverCenarioComoVersao`).
 *
 * Um vínculo que, depois do redirecionamento, viraria destino↔destino (a origem já tinha
 * uma relação direta com o próprio destino) é descartado — vira auto-relação sem sentido.
 * Colisão com um vínculo que o destino já tinha (mesmo de/para/tipo depois do redirect) é
 * deduplicada, mesmo critério de `adicionarVinculo` em `vinculos.ts`.
 *
 * A dedupe só entra em ação para vínculos que ESTA chamada de fato TOCOU (redirecionou) —
 * nunca para dois vínculos alheios que já colidiam antes, sem envolver origem nem destino.
 * Sem essa distinção, um par de vínculos pré-existentes e legítimos com a mesma chave (algo
 * que sync com resolução de conflito produz normalmente) se apagaria mutuamente toda vez
 * que QUALQUER absorção rodasse em QUALQUER lugar do cofre — dado perdido sem relação
 * nenhuma com a operação que o usuário pediu.
 *
 * Recebe TODAS as origens do lote (a origem direta e, quando aplicável, os sub-cenários
 * dela) de uma vez, em vez de o chamador encadear uma chamada por origem. Precisa ser assim
 * porque a dedupe olha só para o que ESTA chamada tocou: se o chamador encadeasse (chamando
 * de novo com o resultado da chamada anterior), um vínculo do descendente B, já redirecionado
 * nesta rodada, colidiria em `(deId, paraId, tipo)` com um vínculo do descendente A redirecionado
 * numa chamada ANTERIOR — e essa chamada anterior não existe mais no momento em que B roda, então
 * o vínculo de A pareceria "pré-existente" e a dedupe apagaria B mesmo sem ele ter colidido de
 * verdade com nada que já existisse no destino antes da absorção. Processando o lote inteiro numa
 * única passada, "tocado" significa a mesma coisa para A e para B, e a dedupe só funde vínculos que
 * de fato apontam pra mesma relação depois do redirect — nunca um vínculo alheio ao lote.
 *
 * Devolve a MESMA referência quando nada muda (nenhum vínculo tocava nenhuma das origens) —
 * permite ao chamador pular a gravação de `vinculos.json` com um `!==`.
 *
 * `origens[].notaDescendente`, quando informado, é anexado às `notas` de todo vínculo tocado
 * por aquela origem — usado quando a origem é um SUB-cenário do que está sendo absorvido: o
 * conteúdo dele não vira versão de nada (só as versões do cenário absorvido diretamente entram
 * no destino — ver `absorverCenarioComoVersao` em state/store.ts), foi inteiro para a lixeira.
 * Sem a nota, o vínculo redirecionado passaria a apontar para um cenário que não guarda nenhum
 * traço daquele conteúdo, e a relação mentiria em silêncio sobre o que ela realmente representa.
 *
 * Duas origens DIFERENTES do mesmo lote podem, depois do redirect, convergir pra mesma chave
 * (de/para/tipo) — dois sub-cenários que mencionavam o mesmo NPC, por exemplo. Isso NÃO é a
 * dedupe legítima descrita acima (vínculo tocado colidindo com algo que o destino já tinha
 * antes da absorção): são dois vínculos que ESTA chamada tocou, cada um vindo de uma origem
 * diferente. Descartar o segundo em silêncio perderia a nota dele (e, com ela, o único rastro
 * de que aquele conteúdo existiu). Por isso, quando os DOIS lados da colisão foram tocados por
 * esta chamada, a função funde as notas em vez de descartar — nenhum vínculo desaparece sem
 * deixar rastro, mas a coleção não acumula duas linhas idênticas de (de, para, tipo).
 */
/** Anexa a nota de fusão preservando o que o usuário já tinha escrito ali. */
function anexarNotaFusao(notasAtuais: string, nomeDescendente: string): string {
  const nota = `(era sobre: ${nomeDescendente}, fundido no destino)`
  return notasAtuais ? `${notasAtuais} ${nota}` : nota
}

export interface OrigemAbsorcao {
  id: string
  /** presente só quando `id` é um sub-cenário — a origem direta não leva nota, o conteúdo dela migrou de verdade */
  notaDescendente?: string
}

export function redirecionarVinculosAbsorcao(
  vinculos: readonly Vinculo[],
  origens: readonly OrigemAbsorcao[],
  destinoId: string,
): Vinculo[] {
  let mudou = false
  const notaPorOrigemId = new Map(origens.map((o) => [o.id, o.notaDescendente]))
  const processados = vinculos.map((v) => {
    const deOrigemId = v.deTipo === 'cenario' && notaPorOrigemId.has(v.deId) ? v.deId : null
    const paraOrigemId = v.paraTipo === 'cenario' && notaPorOrigemId.has(v.paraId) ? v.paraId : null
    const deId = deOrigemId ? destinoId : v.deId
    const paraId = paraOrigemId ? destinoId : v.paraId
    const tocado = deId !== v.deId || paraId !== v.paraId
    if (tocado) mudou = true
    // um vínculo cenario->cenario poderia, em tese, ter os dois lados apontando pra origens
    // diferentes do lote — prioriza a nota do lado `para` (é o que decide "sobre o que é" o vínculo)
    const notaDescendente = tocado
      ? (paraOrigemId ? notaPorOrigemId.get(paraOrigemId) : notaPorOrigemId.get(deOrigemId!))
      : undefined
    const notas = tocado && notaDescendente
      ? anexarNotaFusao(v.notas, notaDescendente)
      : v.notas
    return { v: tocado ? { ...v, deId, paraId, notas } : v, deId, paraId, tocado, notaDescendente, chave: `${deId}|${paraId}|${v.tipo}` }
  })

  // auto-relação criada PELO redirect (origem já tinha vínculo direto com o destino) — só
  // descarta quando foi este redirect que gerou o loop, nunca um auto-vínculo pré-existente
  const semAutoLoop = processados.filter((p) => {
    if (p.tocado && p.deId === destinoId && p.paraId === destinoId) { mudou = true; return false }
    return true
  })

  // chaves que pelo menos um vínculo TOCADO carrega — só nessas a dedupe é permitida
  const chavesTocadas = new Set(semAutoLoop.filter((p) => p.tocado).map((p) => p.chave))
  // por chave: índice do sobrevivente em `out` e se ele veio de um vínculo TOCADO por esta
  // chamada — decide entre "descarta" (dedupe legítima com algo pré-existente do destino) e
  // "funde as notas" (colisão entre duas origens do MESMO lote, ver docstring acima)
  const sobreviventePorChave = new Map<string, { indice: number; tocado: boolean }>()
  const out: Vinculo[] = []
  for (const p of semAutoLoop) {
    if (!chavesTocadas.has(p.chave)) { out.push(p.v); continue }
    const existente = sobreviventePorChave.get(p.chave)
    if (!existente) {
      sobreviventePorChave.set(p.chave, { indice: out.length, tocado: p.tocado })
      out.push(p.v)
      continue
    }
    mudou = true
    if (existente.tocado && p.tocado && p.notaDescendente) {
      out[existente.indice] = { ...out[existente.indice], notas: anexarNotaFusao(out[existente.indice].notas, p.notaDescendente) }
    }
    // senão (um dos dois lados não foi tocado por esta chamada): dedupe legítima com o que o
    // destino já tinha antes da absorção — descarta o duplicado sem fundir nota, como sempre foi
  }
  return mudou ? out : (vinculos as Vinculo[])
}
