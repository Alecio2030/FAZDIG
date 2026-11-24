// V158: devolve a pessoa cadastrada na hora para a tela que pediu o cadastro (ex.: a Venda),
// que continua de onde parou, já com a pessoa escolhida.
let esperando: ((id: string) => void) | null = null;

/** A tela que pediu o cadastro fica esperando o id da pessoa nova. */
export function aguardarPessoaNova(aoReceber: (id: string) => void) {
  esperando = aoReceber;
}

/** O cadastro de pessoas entrega o id e volta. Devolve true se havia uma tela esperando. */
export function entregarPessoaNova(id: string): boolean {
  const cb = esperando;
  esperando = null;
  if (!cb) return false;
  cb(id);
  return true;
}
