import { somenteDigitos } from './formatos';

/** V162: endereço achado pelo CEP (bases públicas e gratuitas: ViaCEP, com a BrasilAPI de reserva). */
export type EnderecoCep = {
  cep: string; // só dígitos
  logradouro: string;
  bairro: string;
  municipio: string;
  uf: string;
  ibge: string; // código do município (a NF-e usa)
};

const TEMPO = 8000;

async function json(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TEMPO);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Busca o endereço de um CEP. null = CEP não existe; lança erro = sem internet / serviço fora. */
export async function buscarCep(cepDigitado: string): Promise<EnderecoCep | null> {
  const cep = somenteDigitos(cepDigitado);
  if (cep.length !== 8) return null;
  const v = await json(`https://viacep.com.br/ws/${cep}/json/`);
  if (v && !v.erro) {
    return { cep, logradouro: v.logradouro ?? '', bairro: v.bairro ?? '', municipio: v.localidade ?? '', uf: (v.uf ?? '').toUpperCase(), ibge: String(v.ibge ?? '') };
  }
  if (v?.erro) return null; // a ViaCEP respondeu: o CEP não existe
  // ViaCEP fora do ar: tenta a BrasilAPI
  const b = await json(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (b && b.city) {
    return { cep, logradouro: b.street ?? '', bairro: b.neighborhood ?? '', municipio: b.city ?? '', uf: (b.state ?? '').toUpperCase(), ibge: '' };
  }
  if (b === null && v === null) throw new Error('Sem internet para consultar o CEP agora. Preencha a cidade e a UF.');
  return null;
}

/** Procura CEPs pela UF, cidade e rua/localidade (a rua precisa de ao menos 3 letras). */
export async function procurarCep(uf: string, cidade: string, rua: string): Promise<EnderecoCep[]> {
  const u = uf.trim().toUpperCase();
  const c = cidade.trim();
  const r = rua.trim();
  if (u.length !== 2 || c.length < 3 || r.length < 3) return [];
  const lista = await json(`https://viacep.com.br/ws/${encodeURIComponent(u)}/${encodeURIComponent(c)}/${encodeURIComponent(r)}/json/`);
  if (!Array.isArray(lista)) return [];
  return lista.slice(0, 30).map((v: any) => ({
    cep: somenteDigitos(v.cep ?? ''),
    logradouro: v.logradouro ?? '',
    bairro: v.bairro ?? '',
    municipio: v.localidade ?? '',
    uf: (v.uf ?? '').toUpperCase(),
    ibge: String(v.ibge ?? ''),
  }));
}

/** Confere os três campos obrigatórios do endereço. Devolve as mensagens de erro (vazio = tudo certo). */
export function conferirEndereco(e: { cep: string; municipio: string; uf: string }): { cep?: string; municipio?: string; uf?: string } {
  const r: { cep?: string; municipio?: string; uf?: string } = {};
  if (somenteDigitos(e.cep).length !== 8) r.cep = 'Informe o CEP (8 números).';
  if (!e.municipio.trim()) r.municipio = 'Informe a cidade.';
  if (!/^[A-Za-z]{2}$/.test(e.uf.trim())) r.uf = 'Informe a UF.';
  return r;
}
