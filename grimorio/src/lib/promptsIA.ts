/** Instruções de IA para as ações tab-aware dos modais (a entidade + contexto entram à parte). */

/** Gera o conteúdo de uma seção, curto (1-2 frases) ou longo (3-4 parágrafos). */
export function promptVersao(rotuloAba: string, tamanho: 'curta' | 'longa'): string {
  const formato =
    tamanho === 'curta'
      ? 'versão CURTA: 1-2 frases, direta e evocativa'
      : 'versão LONGA: 3-4 parágrafos, rica em detalhes'
  return (
    `Escreva o conteúdo da seção "${rotuloAba}" desta entidade — ${formato}. ` +
    `Coerente com os dados da entidade e o contexto da campanha. ` +
    `Responda só com o texto da seção, sem título nem preâmbulo.`
  )
}

/** Melhora o texto atual de uma seção, mantendo sentido e fatos. */
export function promptMelhorar(rotuloAba: string): string {
  return (
    `Melhore o texto atual da seção "${rotuloAba}": corrija, enriqueça e clarifique, ` +
    `mantendo o sentido e os fatos (não invente contradições). ` +
    `Responda só com o texto revisado, sem título nem preâmbulo.`
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Descrição de entidade (personagem, cenário, item)
//
// O alvo não é inventário do que está na foto: é matéria-prima de narração. A regra
// central é entregar o FATO e não a conclusão — "clima aconchegante" já é a leitura pronta
// da cena e não deixa nada para o mestre fazer, enquanto "luz vindo da lareira" diz onde
// tem sombra, e "seis camas de solteiro" responde a pergunta que o jogador vai fazer.
//
// O que estes prompts acrescentam à regra acima é a ORDEM. O prompt antigo era único para
// as três entidades e só dizia o que evitar; sem ordem prescrita, o modelo enumera por
// saliência visual (o que é grande e colorido primeiro) em vez da convenção de mesa —
// rosto, roupa, o que carrega. Ordem numerada + um exemplo completo é o que faz um modelo
// barato (o padrão do app é o `flash-lite`) acertar o formato sem revisão manual.
// ─────────────────────────────────────────────────────────────────────────────

/** De onde a descrição sai: a imagem anexada, ou os dados da ficha quando não há imagem. */
export type FonteDescricao = 'imagem' | 'ficha'

/**
 * Precisa ser explícito nos dois sentidos: mandar "observe a imagem" sem imagem faz o
 * modelo fraco descrever um retrato que não existe, e omitir a imagem quando ela existe
 * faz ele responder pela ficha e ignorar o desenho que o usuário anexou.
 */
function origem(fonte: FonteDescricao): string {
  return fonte === 'imagem'
    ? 'Observe a imagem e escreva'
    : 'A partir dos dados da ficha e do contexto da campanha, escreva'
}

/**
 * A regra de fidelidade INVERTE conforme a fonte. Com imagem, deduzir é erro: o mestre vai
 * narrar o que os jogadores veem, e "parece abandonado" contradiz a arte na primeira
 * pergunta. Sem imagem, deduzir é o trabalho inteiro — o que não pode é contradizer a ficha.
 */
const REGRA_FIDELIDADE: Record<FonteDescricao, string> = {
  imagem:
    'NÃO deduza o que a imagem não mostra (idade, profissão, origem, história do lugar, ' +
    'se a pessoa é boa ou má). Reproduza a quantidade e o estado EXATOS que a imagem mostra: ' +
    'se a água vai "quase até a borda", não escreva que o balde está cheio.',
  ficha:
    'Complete o que a ficha não diz com detalhe plausível, coerente com ela e com o contexto ' +
    'da campanha; NUNCA contradiga um fato já escrito. ' +
    'APROVEITE o que a ficha já dá em vez de trocar por termo genérico: todo nome próprio de ' +
    'lugar, pessoa ou evento que estiver escrito na ficha ("a capela de Sant Iorven", "fechada ' +
    'desde a peste") tem de aparecer na descrição — é por ele que o mestre amarra a cena na trama.',
}

const REGRA_CONCRETO =
  'Nomeie a coisa ("lareira", "seis camas de solteiro", "espada curta"), não a categoria ' +
  '("fogo", "algumas camas", "uma arma").'

const REGRA_SEM_CONCLUSAO =
  'NÃO entregue a sensação nem a conclusão pronta ("aconchegante", "luz quente", "clima pesado", ' +
  '"ar ameaçador", "estilo medieval"): provocar isso nos jogadores é o trabalho do mestre — dê a ' +
  'ele os fatos que constroem a cena, não o resumo dela.'

const REGRA_SEM_REPETIR = 'NÃO repita o mesmo elemento em dois tópicos.'

/**
 * Só para as listas — a prosa corrida vive de emendar fatos, e aplicar isto lá quebraria o
 * parágrafo em frases picadas.
 *
 * Nasceu de um efeito colateral: quando o prompt passou a exigir que o fato da ficha
 * aparecesse, o modelo o grudou no fim do tópico anterior ("Mofo denso: a cripta está fechada
 * desde a peste") em vez de lhe dar linha própria. Dois fatos num tópico viram explicação, e
 * explicação é justamente a conclusão pronta que o mestre não quer.
 */
const REGRA_UM_FATO =
  'Cada tópico carrega UM fato só. Não cole dois fatos na mesma linha com dois-pontos ou ' +
  'travessão — se há dois, ou são dois tópicos, ou o segundo fica de fora.'

const FECHO_LISTA =
  'Frase curta e direta, sem enchimento. Responda só com a lista, sem título nem preâmbulo.'

/**
 * Descrição de PERSONAGEM, na ordem de mesa: rosto antes de roupa, roupa antes do que
 * carrega. É a ordem em que o jogador olha, e é a ordem em que o mestre fala.
 *
 * O tópico de presença é opcional de propósito. Ele é a única brecha na regra "sem
 * conclusão pronta", e existe porque um vilão sem presença descrita chega à mesa como
 * qualquer taverneiro — mas fica ancorado em comportamento observável ("encara sem
 * piscar"), não no adjetivo ("ameaçador"), para o mestre continuar dono da leitura.
 * Guarda-costas de rua não recebe este tópico; é o que separa o notável do figurante.
 */
export function promptDescreverPersonagem(fonte: FonteDescricao): string {
  return (
    `${origem(fonte)} de 4 a 6 tópicos para o mestre descrever este personagem na mesa. ` +
    'Um por linha, cada linha começando com "- ".\n' +
    'Siga EXATAMENTE esta ordem, no máximo um tópico por item, PULANDO o item que não se aplica:\n' +
    '1. O QUE É E O ROSTO — homem, mulher, criança, máquina, criatura; a cor da pele; e no rosto: ' +
    'a expressão, o cabelo (feitio e cor), uma cicatriz ou marca. Este tópico é obrigatório.\n' +
    '2. VESTIMENTA — o que veste, de que material, e UM detalhe que valha citar. Não liste a roupa ' +
    'peça por peça: só o que o jogador notaria de longe.\n' +
    '3. O QUE CARREGA — arma, ferramenta ou objeto à vista. Se não carrega nada, pule.\n' +
    '4. PRESENÇA — SÓ para quem é misterioso, poderoso ou ameaçador. Descreva o que ele FAZ ' +
    '("encara sem piscar", "fala sem levantar a voz", "ninguém encosta nele na fila"), nunca o ' +
    'adjetivo pronto ("é amedrontador"). NPC comum NÃO recebe este tópico.\n' +
    '5. DIFERENCIAL — SÓ se houver algo fora do comum: falta um membro, prótese, cicatriz grande ' +
    'no corpo, marca incomum. Se não houver, pule.\n' +
    'O piso de 4 tópicos vale mesmo depois de pular: se os itens 4 e 5 não se aplicam e você ficou ' +
    'com 3, acrescente um tópico com OUTRO traço físico visível (as mãos, o porte, a postura, o ' +
    'calçado, a voz) — nunca invente presença ou diferencial que o personagem não tem só para ' +
    'preencher a lista.\n' +
    'Exemplo do formato esperado:\n' +
    '- Homem de pele morena, rosto magro, cicatriz vertical sobre o olho esquerdo, cabelo preto preso atrás\n' +
    '- Casaco de couro gasto até o joelho, com fivelas de metal no peito\n' +
    '- Espada curta na cintura esquerda e uma bolsa amarrada no cinto\n' +
    '- Encara sem piscar e não muda de posição enquanto fala\n' +
    `${REGRA_CONCRETO}\n` +
    `${REGRA_UM_FATO}\n` +
    `${REGRA_SEM_CONCLUSAO}\n` +
    `${REGRA_SEM_REPETIR} ${REGRA_FIDELIDADE[fonte]}\n` +
    FECHO_LISTA
  )
}

/**
 * Descrição de CENÁRIO em tópicos, na ordem em que o grupo entra numa sala: primeiro QUE lugar
 * é e que forma tem, e só depois de que ele é feito. É a ordem do próprio mestre — "vocês entram
 * numa biblioteca, o chão feito de madeira" — e ela importa: nomear o espaço dá ao jogador onde
 * pendurar o resto, enquanto abrir por "paredes de pedra" descreve no vácuo.
 *
 * Depois vem o que está dentro, depois quem está dentro, e só então o detalhe que puxa a
 * atenção — que é o gancho de exploração.
 *
 * Deixar o detalhe interessante por último não é estética: é o tópico que o mestre lê por
 * fim e que o jogador responde com "eu vou lá olhar".
 */
export function promptDescreverCenarioTopicos(fonte: FonteDescricao): string {
  return (
    `${origem(fonte)} de 4 a 6 tópicos para o mestre descrever este cenário na mesa. ` +
    'Um por linha, cada linha começando com "- ".\n' +
    'Siga EXATAMENTE esta ordem, no máximo um tópico por item, PULANDO o item que não se aplica:\n' +
    '1. FORMA E TIPO — que espaço é esse e que feitio tem: sala oval, corredor estreito, biblioteca ' +
    'de dois andares, clareira redonda. Este tópico é obrigatório.\n' +
    '2. DO QUE É FEITO — os materiais do lugar: paredes de pedra, piso de tábua, estrutura de ferro.\n' +
    '3. O QUE TEM DENTRO — móveis e objetos, quantos e ONDE estão: "quatro mesas compridas no centro", ' +
    '"estantes cobrindo a parede do fundo".\n' +
    '4. QUEM ESTÁ LÁ — as pessoas ou criaturas presentes e o que estão fazendo. Se o lugar está ' +
    'vazio, pule.\n' +
    '5. O QUE PUXA A ATENÇÃO — o detalhe que faz o jogador querer chegar perto: de onde vem a luz, ' +
    'um objeto fora do lugar, um som, um cheiro.\n' +
    'O piso de 4 tópicos vale mesmo depois de pular: se o lugar está vazio e você ficou com 3, ' +
    'acrescente um tópico com outro detalhe FÍSICO do espaço (o teto, o piso, uma saída, o som, ' +
    'o cheiro) — nunca invente gente que não está lá só para preencher a lista.\n' +
    'Exemplo do formato esperado:\n' +
    '- Biblioteca retangular, com um mezanino correndo pelas três paredes do fundo\n' +
    '- Paredes de pedra escura e piso de tábuas largas de madeira, que não rangem\n' +
    '- Quatro mesas compridas no centro, cada uma com seis cadeiras, e balcões junto da entrada\n' +
    '- Três pessoas sentadas, lendo, sem falar entre si\n' +
    '- Um único lampião aceso na mesa do fundo; o resto da sala fica na penumbra\n' +
    `${REGRA_CONCRETO}\n` +
    `${REGRA_UM_FATO}\n` +
    `${REGRA_SEM_CONCLUSAO}\n` +
    `${REGRA_SEM_REPETIR} ${REGRA_FIDELIDADE[fonte]}\n` +
    FECHO_LISTA
  )
}

/**
 * Mesma cena do prompt acima, em prosa de leitura direta — o texto que o mestre lê em voz
 * alta quando o grupo entra e a sala não merece cinco tópicos.
 *
 * A ordem por baixo é a mesma (material, forma, o que tem, quem está); o que muda é a
 * embalagem. O molde é o parágrafo que o usuário escreve na mesa: começa em "Vocês entram",
 * emenda os fatos em frases curtas e para antes de virar literatura.
 */
export function promptDescreverCenarioCorrido(fonte: FonteDescricao): string {
  return (
    `${origem(fonte)} um parágrafo curto (3 a 5 frases) para o mestre LER EM VOZ ALTA quando o ` +
    'grupo entra neste cenário.\n' +
    'Comece pela chegada ("Vocês entram…", "Vocês chegam a…") e siga a mesma ordem de sempre: ' +
    'que lugar é esse e que forma tem, do que ele é feito, o que tem dentro, quem está lá e o que ' +
    'está fazendo, e por fim o detalhe que puxa a atenção. Emende tudo em frases curtas, sem ' +
    'tópicos e sem títulos.\n' +
    'Exemplo do tom e do tamanho esperados:\n' +
    '"Vocês entram numa biblioteca de piso de madeira que não range. Há vários balcões, mesas e ' +
    'cadeiras, e estantes com livros variados cobrindo as paredes. Não há muita gente no local, e ' +
    'as poucas pessoas presentes estão sentadas, lendo em silêncio. Um único lampião fica aceso na ' +
    'mesa do fundo."\n' +
    `${REGRA_CONCRETO}\n` +
    `${REGRA_SEM_CONCLUSAO}\n` +
    `${REGRA_FIDELIDADE[fonte]}\n` +
    'Prosa simples e direta, sem adjetivo empilhado e sem metáfora. Responda só com o parágrafo, ' +
    'sem título, sem aspas e sem preâmbulo.'
  )
}

/**
 * Descrição de ITEM — curta de propósito. Um pote de leite não sustenta cinco tópicos, e
 * item comum descrito demais faz o grupo procurar segredo onde não há.
 *
 * O que decide o tamanho é a ficha: item com efeito ou história escrita ganha a segunda
 * linha; o resto sai em uma. O detalhe mecânico continua sendo trabalho das ações
 * "Sugerir efeito" e "Sugerir história do item", não desta.
 */
export function promptDescreverItem(fonte: FonteDescricao): string {
  return (
    `${origem(fonte)} 1 ou 2 tópicos curtos para o mestre apresentar este item na mesa. ` +
    'Um por linha, cada linha começando com "- ".\n' +
    'O primeiro tópico diz O QUE É e uma qualidade concreta — do que é feito, o tamanho, ' +
    'o estado de conservação. Só isso.\n' +
    'O segundo tópico SÓ existe se o item tiver uma marca ou detalhe que o distinga de outro ' +
    'igual (uma gravação, um dano, algo preso nele). Item comum termina no primeiro tópico.\n' +
    'Seja VAGO de propósito: não explique para que serve, não diga se é mágico, não sugira valor ' +
    'nem procedência. O jogador descobre isso jogando.\n' +
    'Exemplo de item comum:\n' +
    '- Um pote de barro com leite, tampado com um pedaço de pano\n' +
    'Exemplo de item notável:\n' +
    '- Uma adaga de lâmina escura, com o cabo enrolado em couro cru\n' +
    '- Três pontos gravados no metal, logo acima do punho\n' +
    `${REGRA_CONCRETO}\n` +
    `${REGRA_UM_FATO}\n` +
    `${REGRA_SEM_CONCLUSAO}\n` +
    `${REGRA_FIDELIDADE[fonte]}\n` +
    FECHO_LISTA
  )
}

/**
 * Persona da IA na escrita (worldbuilding). Irmã de `SYSTEM_MESTRE` (chatIA.ts):
 * aquela é de mesa (respostas curtas); esta é de texto trabalhado e organizado.
 *
 * Vale para a página de escrita E para o menu ✨ dos modais de entidade — tudo que sai
 * dali é gravado numa aba do perfil, então é escrita, não conversa de mesa (o chat de
 * mesa é o botão 💬, com `SYSTEM_ENTIDADE`).
 *
 * A lista de marcação permitida não é decorativa: ela é exatamente o que o editor sabe
 * representar (ver `markdownParaHtml`). Tabela e bloco de código não têm nó no StarterKit
 * e seriam gravados como texto cru, com os pipes e as crases à mostra.
 */
export const SYSTEM_ESCRITOR = [
  'Você é um assistente de escrita e worldbuilding para RPG, em português do Brasil.',
  'Ajuda a desenvolver, revisar e organizar o material do mundo: enredo, mecânicas, lore e regras.',
  'Você recebe o contexto da campanha (personagens, cenários, vínculos); mantenha coerência e NUNCA contradiga esses fatos.',
  'Escreva texto desenvolvido e claro; use Markdown para organizar quando fizer sentido.',
  'A marcação disponível é: ## e ### para títulos, - e 1. para listas (que podem ser aninhadas),',
  '**negrito**, *itálico*, > para citação e --- para separador.',
  'NÃO use tabelas nem blocos de código: o editor não os representa e eles virariam texto cru na página.',
].join(' ')

/** Reorganiza/formata o texto da página em seções, listas e títulos, sem mudar o sentido. */
export function promptEstruturar(): string {
  return (
    'Reorganize e formate o texto a seguir para ficar claro e bem estruturado: ' +
    'use títulos (##, ###), listas e parágrafos curtos, agrupando os assuntos relacionados. ' +
    'Corrija ortografia e clareza SEM mudar o sentido nem inventar fatos novos. ' +
    'Responda em Markdown, só com o texto reorganizado, sem preâmbulo.'
  )
}

/**
 * Anexada aos prompts de escrita quando a página tem imagens: os `<img>` viram
 * marcadores `{{IMG:n}}` (imagensMarcador.ts) e a IA precisa preservá-los.
 */
export const REGRA_MARCADORES =
  'O texto pode conter marcadores como {{IMG:0}} que representam imagens. ' +
  'Mantenha cada marcador EXATAMENTE como está, em linha própria, na posição adequada. ' +
  'Não crie, não renomeie e não remova marcadores.'
