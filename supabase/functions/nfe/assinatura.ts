// V157: assinatura digital da NF-e e dos eventos (XMLDSig "enveloped", C14N 1.0, RSA-SHA1, como manda o Manual da NF-e).
// O elemento assinado é montado já canônico (ver xml.ts); aqui só se acrescenta o espaço de nomes herdado do pai,
// que entra na forma canônica do elemento.
import { NS_NFE } from './xml.ts';

const NS_DSIG = 'http://www.w3.org/2000/09/xmldsig#';

const paraB64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};

function pemParaDer(pem: string, rotulo: string): Uint8Array {
  const m = pem.match(new RegExp(`-----BEGIN ${rotulo}-----([\\s\\S]*?)-----END ${rotulo}-----`));
  if (!m) throw new Error(`Certificado sem ${rotulo}.`);
  return Uint8Array.from(atob(m[1].replace(/\s+/g, '')), (c) => c.charCodeAt(0));
}

/** Coloca o xmlns da NF-e logo depois do nome do elemento: é como ele fica na forma canônica (o nome do espaço vem antes dos atributos). */
function comNamespace(elemento: string): string {
  return elemento.replace(/^<(\w+)/, `<$1 xmlns="${NS_NFE}"`);
}

/**
 * Assina o elemento (infNFe ou infEvento, que tem o atributo Id) e devolve o bloco <Signature> para ir logo depois dele.
 * certPem: o certificado do titular primeiro (o resto da cadeia, se houver, é ignorado); chavePem: PKCS#8.
 */
export async function assinar(elemento: string, certPem: string, chavePem: string): Promise<string> {
  const id = elemento.match(/^<\w+ Id="([^"]+)"/)?.[1];
  if (!id) throw new Error('Elemento a assinar sem o atributo Id.');

  const digest = paraB64(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(comNamespace(elemento)))));
  const signedInfo =
    '<SignedInfo>' +
    '<CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>' +
    '<SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></SignatureMethod>' +
    `<Reference URI="#${id}">` +
    '<Transforms>' +
    '<Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>' +
    '<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform>' +
    '</Transforms>' +
    '<DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></DigestMethod>' +
    `<DigestValue>${digest}</DigestValue>` +
    '</Reference>' +
    '</SignedInfo>';
  // na forma canônica o SignedInfo leva o xmlns do Signature (pai)
  const signedInfoC14n = signedInfo.replace('<SignedInfo>', `<SignedInfo xmlns="${NS_DSIG}">`);

  const chave = await crypto.subtle.importKey('pkcs8', pemParaDer(chavePem, 'PRIVATE KEY') as BufferSource, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, false, ['sign']);
  const valor = paraB64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(signedInfoC14n))));
  const certB64 = paraB64(pemParaDer(certPem, 'CERTIFICATE'));

  return (
    `<Signature xmlns="${NS_DSIG}">` +
    signedInfo +
    `<SignatureValue>${valor}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo>` +
    '</Signature>'
  );
}
