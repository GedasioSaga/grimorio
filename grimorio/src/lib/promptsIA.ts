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

/**
 * Persona da IA na escrita (worldbuilding). Irmã de `SYSTEM_MESTRE` (chatIA.ts):
 * aquela é de mesa (respostas curtas); esta é de texto trabalhado e organizado.
 */
export const SYSTEM_ESCRITOR = [
  'Você é um assistente de escrita e worldbuilding para RPG, em português do Brasil.',
  'Ajuda a desenvolver, revisar e organizar o material do mundo: enredo, mecânicas, lore e regras.',
  'Você recebe o contexto da campanha (personagens, cenários, vínculos); mantenha coerência e NUNCA contradiga esses fatos.',
  'Escreva texto desenvolvido e claro; use Markdown (## títulos, listas, **negrito**) para organizar quando fizer sentido.',
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
