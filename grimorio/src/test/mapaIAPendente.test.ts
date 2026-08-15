import { afterEach, describe, expect, it, vi } from 'vitest'
import { definirPlantaPendente, retirarPlantaPendente } from '../lib/mapaIAPendente'

// formas de mentira — o módulo só guarda e devolve, não olha o conteúdo
const formasFake = [{ id: 'shape:1', type: 'sala-mapa' }] as never

describe('mapaIAPendente', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('caminho feliz: define e retira uma vez só', () => {
    definirPlantaPendente('mapas-soltos/a.json', formasFake)
    expect(retirarPlantaPendente('mapas-soltos/a.json')).toBe(formasFake)
    // segunda retirada: já foi consumida
    expect(retirarPlantaPendente('mapas-soltos/a.json')).toBeNull()
  })

  it('caminho sem planta pendente devolve null', () => {
    expect(retirarPlantaPendente('mapas-soltos/nunca-existiu.json')).toBeNull()
  })

  it('entrada expira sozinha depois do TTL, mesmo sem nunca ser retirada', () => {
    const agora = 1_000_000
    vi.spyOn(Date, 'now').mockReturnValue(agora)
    definirPlantaPendente('mapas-soltos/orfao.json', formasFake)

    // ainda dentro do prazo: continua lá
    vi.spyOn(Date, 'now').mockReturnValue(agora + 60_000)
    expect(retirarPlantaPendente('mapas-soltos/orfao.json')).toBe(formasFake)

    // de novo, mas agora deixa passar o TTL sem retirar
    vi.spyOn(Date, 'now').mockReturnValue(agora)
    definirPlantaPendente('mapas-soltos/orfao2.json', formasFake)
    vi.spyOn(Date, 'now').mockReturnValue(agora + 6 * 60 * 1000) // 6 min > TTL de 5 min
    expect(retirarPlantaPendente('mapas-soltos/orfao2.json')).toBeNull()
  })

  it('definir uma planta nova varre e descarta as expiradas de outros caminhos', () => {
    const agora = 2_000_000
    vi.spyOn(Date, 'now').mockReturnValue(agora)
    definirPlantaPendente('mapas-soltos/velho.json', formasFake)

    vi.spyOn(Date, 'now').mockReturnValue(agora + 6 * 60 * 1000)
    definirPlantaPendente('mapas-soltos/novo.json', formasFake)

    // a entrada velha expirou e foi varrida na chamada acima; a nova continua lá
    expect(retirarPlantaPendente('mapas-soltos/velho.json')).toBeNull()
    expect(retirarPlantaPendente('mapas-soltos/novo.json')).toBe(formasFake)
  })
})
