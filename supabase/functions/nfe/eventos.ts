// V157: evento de cancelamento da NF-e (tpEvento 110111).
import { NS_NFE, soNumeros, texto } from './xml.ts';

export function montarInfEventoCancelamento(p: {
  codigoUf: string;
  ambiente: 1 | 2;
  docEmitente: string;
  chave: string;
  protocolo: string;
  justificativa: string;
  quando: string; // AAAA-MM-DDThh:mm:ss-03:00
}): string {
  const doc = soNumeros(p.docEmitente);
  return (
    `<infEvento Id="ID110111${p.chave}01">` +
    `<cOrgao>${p.codigoUf}</cOrgao>` +
    `<tpAmb>${p.ambiente}</tpAmb>` +
    (doc.length === 14 ? `<CNPJ>${doc}</CNPJ>` : `<CPF>${doc}</CPF>`) +
    `<chNFe>${p.chave}</chNFe>` +
    `<dhEvento>${p.quando}</dhEvento>` +
    '<tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento>' +
    '<detEvento versao="1.00"><descEvento>Cancelamento</descEvento>' +
    `<nProt>${p.protocolo}</nProt>` +
    `<xJust>${texto(p.justificativa, 255)}</xJust>` +
    '</detEvento></infEvento>'
  );
}

export const montarEvento = (infAssinada: string) => `<evento xmlns="${NS_NFE}" versao="1.00">${infAssinada}</evento>`;
export const montarEnvEvento = (idLote: string, evento: string) => `<envEvento xmlns="${NS_NFE}" versao="1.00"><idLote>${idLote}</idLote>${evento}</envEvento>`;
