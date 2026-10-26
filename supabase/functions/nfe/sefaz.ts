// V156: endereços da Sefaz, cadeia de confiança da ICP-Brasil e envio SOAP com o certificado do produtor.

/** Código IBGE de cada UF (cUF da NF-e). */
export const CODIGO_UF: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17', MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27',
  SE: '28', BA: '29', MG: '31', ES: '32', RJ: '33', SP: '35', PR: '41', SC: '42', RS: '43', MS: '50', MT: '51', GO: '52', DF: '53',
};

/** Estados autorizados pela SVRS (Sefaz Virtual do RS). O Espírito Santo é um deles. */
const SVRS = new Set(['AC', 'AL', 'AP', 'DF', 'ES', 'PB', 'PI', 'RJ', 'RN', 'RO', 'RR', 'SC', 'SE', 'TO']);

export type Servico = 'status' | 'autorizacao' | 'retorno' | 'consulta' | 'evento' | 'inutilizacao';

const CAMINHO: Record<Servico, string> = {
  status: '/ws/NfeStatusServico/NfeStatusServico4.asmx',
  autorizacao: '/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
  retorno: '/ws/NfeRetAutorizacao/NFeRetAutorizacao4.asmx',
  consulta: '/ws/NfeConsulta/NfeConsulta4.asmx',
  evento: '/ws/recepcaoevento/recepcaoevento4.asmx',
  inutilizacao: '/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
};

/** Nome do serviço no WSDL (vai no namespace da mensagem SOAP). */
export const WSDL: Record<Servico, string> = {
  status: 'NFeStatusServico4',
  autorizacao: 'NFeAutorizacao4',
  retorno: 'NFeRetAutorizacao4',
  consulta: 'NFeConsultaProtocolo4',
  evento: 'NFeRecepcaoEvento4',
  inutilizacao: 'NFeInutilizacao4',
};

export function urlServico(uf: string, ambiente: 1 | 2, servico: Servico): string {
  const u = (uf ?? '').toUpperCase();
  if (!SVRS.has(u)) {
    throw new Error(`A emissão de NF-e para fazendas em ${u || 'UF não informada'} ainda não está ligada no sistema (por enquanto, só os estados atendidos pela SVRS, como o Espírito Santo).`);
  }
  const host = ambiente === 1 ? 'https://nfe.svrs.rs.gov.br' : 'https://nfe-homologacao.svrs.rs.gov.br';
  return host + CAMINHO[servico];
}

// Raízes da ICP-Brasil: os servidores da Sefaz usam certificados da ICP-Brasil, que não vêm na lista padrão dos navegadores.
const RAIZES = ['v5', 'v10', 'v11', 'v12'].map((v) => `http://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasil${v}.crt`);
let raizesEmCache: string[] | null = null;

function derParaPem(bytes: Uint8Array): string {
  const texto = new TextDecoder().decode(bytes);
  if (texto.includes('BEGIN CERTIFICATE')) return texto;
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return '-----BEGIN CERTIFICATE-----\n' + (btoa(s).match(/.{1,64}/g) ?? []).join('\n') + '\n-----END CERTIFICATE-----\n';
}

async function raizesIcpBrasil(): Promise<string[]> {
  if (raizesEmCache?.length) return raizesEmCache;
  const lidas = await Promise.all(
    RAIZES.map(async (u) => {
      try {
        const r = await fetch(u);
        if (!r.ok) return null;
        const b = new Uint8Array(await r.arrayBuffer());
        return b.length > 300 ? derParaPem(b) : null;
      } catch {
        return null;
      }
    }),
  );
  const ok = lidas.filter((x): x is string => !!x);
  if (!ok.length) throw new Error('Não foi possível baixar as raízes da ICP-Brasil (site do ITI fora do ar). Tente de novo em alguns minutos.');
  raizesEmCache = ok;
  return ok;
}

/** Envia a mensagem (já dentro de nfeDadosMsg) ao serviço da Sefaz, com o certificado do produtor, e devolve o XML da resposta. */
export async function enviarSoap(url: string, servico: Servico, corpoXml: string, certPem: string, chavePem: string): Promise<string> {
  const envelope =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body>' +
    `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/${WSDL[servico]}">${corpoXml}</nfeDadosMsg>` +
    '</soap12:Body></soap12:Envelope>';
  // deno-lint-ignore no-explicit-any
  const client = (Deno as any).createHttpClient({ caCerts: await raizesIcpBrasil(), cert: certPem, key: chavePem });
  try {
    const r = await fetch(url, {
      method: 'POST',
      body: envelope,
      headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
      client,
      signal: AbortSignal.timeout(30000),
    } as RequestInit);
    const texto = await r.text();
    if (r.status === 403) throw new Error('A Sefaz recusou o certificado (acesso negado). Confira se é o certificado A1 do titular da fazenda e se está dentro da validade.');
    if (!r.ok && !texto.includes('<cStat>')) throw new Error(`A Sefaz respondeu com erro ${r.status}. Tente de novo em alguns minutos.`);
    return texto;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/timed? ?out|aborted/i.test(msg)) throw new Error('A Sefaz não respondeu a tempo. Tente de novo em alguns minutos.');
    throw e;
  } finally {
    client.close?.();
  }
}

/** Pega o texto de uma etiqueta do XML de resposta (a primeira que aparecer). */
export function campo(xml: string, etiqueta: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${etiqueta}>([^<]*)</(?:\\w+:)?${etiqueta}>`));
  return m ? m[1] : null;
}
