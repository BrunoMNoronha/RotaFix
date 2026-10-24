import { parseLabel, extractCeps } from '@/services/labelParser';

const mercadoLivre = `
Mercado Envios
Destinatário
João da Silva Souza
Rua das Flores, 123 - Apto 42
Jardim Primavera
CEP: 72331-502 Brasília - DF
Remetente
Loja XPTO LTDA
Av. Paulista, 1578
CEP: 01310-200 São Paulo - SP
`;

const shopee = `
Shopee Xpress BR
PARA: Maria Oliveira
Quadra QS 601 Conjunto B, Nº 15, Casa 2
Samambaia Norte
72331502 - Brasília/DF
DE: Vendedor Legal
Rua A, 10 - 04538-133 São Paulo SP
`;

const amazon = `
amazon
SHIP TO:
Carlos Pereira
Avenida Brigadeiro Faria Lima 1811 Bloco B
Itaim Bibi
SAO PAULO, SP 04538-133
BR
`;

const correios = `
REMETENTE: Empresa Alfa
Rua B, 50
30130-010 Belo Horizonte MG

DESTINATÁRIO: Ana Costa
Praça da Alfândega, 2529, sala 301
Centro Histórico
90010-150 PORTO ALEGRE RS
`;

describe('extractCeps', () => {
  it('encontra todos, em qualquer formato, sem repetir', () => {
    expect(extractCeps('CEP 72331-502 e 01310200 e 72331 502 e 72331.502')).toEqual(['72331502', '01310200']);
  });
});

describe('parseLabel', () => {
  it('Mercado Livre: destinatário antes do remetente', () => {
    const r = parseLabel(mercadoLivre);
    expect(r.cep).toBe('72331502');
    expect(r.label).toBe('João da Silva Souza');
    expect(r.number).toBe('123');
    expect(r.complement).toMatch(/Apto 42/i);
    expect(r.allCeps).toEqual(['72331502', '01310200']);
  });

  it('Shopee: PARA/DE e número com Nº', () => {
    const r = parseLabel(shopee);
    expect(r.cep).toBe('72331502');
    expect(r.label).toBe('Maria Oliveira');
    expect(r.number).toBe('15');
    expect(r.complement).toMatch(/Casa 2/i);
  });

  it('Amazon: SHIP TO e número sem vírgula', () => {
    const r = parseLabel(amazon);
    expect(r.cep).toBe('04538133');
    expect(r.label).toBe('Carlos Pereira');
    expect(r.number).toBe('1811');
    expect(r.complement).toMatch(/Bloco B/i);
  });

  it('Correios: remetente antes do destinatário', () => {
    const r = parseLabel(correios);
    expect(r.cep).toBe('90010150');
    expect(r.label).toBe('Ana Costa');
    expect(r.number).toBe('2529');
    expect(r.complement).toMatch(/sala 301/i);
  });

  it('sem marcadores: usa o primeiro CEP e não inventa nome', () => {
    const r = parseLabel('Rua Augusta, 1500\n01304-001 São Paulo');
    expect(r.cep).toBe('01304001');
    expect(r.number).toBe('1500');
    expect(r.label).toBeNull();
  });

  it('sem CEP: tudo nulo mas não quebra', () => {
    const r = parseLabel('texto qualquer sem nada util');
    expect(r).toEqual({ cep: null, number: null, label: null, complement: null, allCeps: [] });
  });
});
