// V156: lê o certificado digital A1 (arquivo .pfx/.p12) com a senha e devolve a chave e o certificado em PEM,
// mais o titular, o CPF/CNPJ e a validade. Aceita os arquivos antigos (3DES/RC2, os do Windows) e os novos (AES).
import forge from 'npm:node-forge@1.3.1';

export type Certificado = {
  chavePem: string; // PKCS#8
  certPem: string; // o certificado do titular, seguido da cadeia que vier no arquivo
  titular: string;
  documento: string | null; // CPF ou CNPJ (só números)
  validoDe: Date;
  validoAte: Date;
};

const OID_CPF = '2.16.76.1.3.1'; // ICP-Brasil, pessoa física: data de nascimento (8) + CPF (11) + ...
const OID_CNPJ = '2.16.76.1.3.3'; // ICP-Brasil, pessoa jurídica: CNPJ (14)

function bytesParaBinario(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return s;
}

/** Procura o CPF/CNPJ no certificado: primeiro nos campos da ICP-Brasil, depois no nome ("NOME:12345678900"). */
function documentoDe(cert: forge.pki.Certificate, titular: string): string | null {
  try {
    const san = cert.getExtension('subjectAltName') as { altNames?: { type: number; value: unknown }[] } | null;
    for (const nome of san?.altNames ?? []) {
      if (nome.type !== 0 || !nome.value) continue; // otherName
      const asn = nome.value as forge.asn1.Asn1;
      const filhos = (asn.value as forge.asn1.Asn1[]) ?? [];
      const oid = filhos[0] && typeof filhos[0].value === 'string' ? forge.asn1.derToOid(filhos[0].value as string) : '';
      const texto = JSON.stringify(filhos[1] ?? '').replace(/[^0-9]/g, '');
      if (oid === OID_CPF && texto.length >= 19) return texto.slice(8, 19);
      if (oid === OID_CNPJ && texto.length >= 14) return texto.slice(0, 14);
    }
  } catch {
    // sem os campos da ICP-Brasil: tenta pelo nome
  }
  const m = titular.match(/:(\d{11}|\d{14})\s*$/);
  return m ? m[1] : null;
}

export function lerCertificado(pfx: Uint8Array, senha: string): Certificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(bytesParaBinario(pfx)), false, senha);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/mac|password|invalid/i.test(msg)) throw new Error('Senha do certificado incorreta.');
    throw new Error('Não foi possível abrir o certificado. Confira se é o arquivo .pfx (ou .p12) do certificado A1.');
  }

  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  const chave = chaves.find((b) => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
  if (!chave) throw new Error('O arquivo não tem a chave privada. Exporte o certificado A1 com a chave privada (arquivo .pfx).');

  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []).map((b) => b.cert).filter(Boolean) as forge.pki.Certificate[];
  // o certificado do titular é o que tem a mesma chave pública da chave privada
  const titularCert = certs.find((c) => {
    const pub = c.publicKey as forge.pki.rsa.PublicKey;
    return pub?.n && pub.n.equals(chave.n);
  });
  if (!titularCert) throw new Error('O arquivo não tem o certificado do titular.');

  const cadeia = [titularCert, ...certs.filter((c) => c !== titularCert)];
  const cn = (titularCert.subject.getField('CN')?.value as string | undefined) ?? '';
  return {
    chavePem: forge.pki.privateKeyInfoToPem(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(chave))),
    certPem: cadeia.map((c) => forge.pki.certificateToPem(c)).join(''),
    titular: cn.replace(/:\d{11,14}\s*$/, '').trim() || cn,
    documento: documentoDe(titularCert, cn),
    validoDe: titularCert.validity.notBefore,
    validoAte: titularCert.validity.notAfter,
  };
}
