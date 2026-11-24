// V175: formulação da dieta pelo menor custo. O operador escolhe os alimentos que quer usar e informa o
// ganho de peso (ou a produção); o sistema calcula quantos kg de cada um vão no cocho para chegar ao
// consumo de matéria seca e às metas de energia (NDT), proteína (PB) e fibra (FDN mínima), gastando o menos possível.
// O mineral entra com a quantidade informada (ou a usual dos Parâmetros). A ureia fica limitada a 1% da MS.
// É uma sugestão: o operador pode mudar os kg para seguir a fórmula do profissional.
import type { Item, Metas } from './dietas';

type Restricao = { coef: number[]; tipo: '<=' | '>=' | '='; valor: number };

/**
 * Simplex (método do "M grande") para: minimizar custo·x, com as restrições e x >= 0.
 * Problemas pequenos (até uns 15 alimentos): tabela cheia, regra de Bland para não ciclar.
 */
function simplex(custo: number[], rs: Restricao[]): number[] | null {
  const n = custo.length;
  // lado direito sempre >= 0
  const R = rs.map((r) => (r.valor < 0 ? { coef: r.coef.map((c) => -c), tipo: (r.tipo === '<=' ? '>=' : r.tipo === '>=' ? '<=' : '=') as Restricao['tipo'], valor: -r.valor } : r));
  const m = R.length;
  const nFolga = R.filter((r) => r.tipo !== '=').length;
  const nArt = R.filter((r) => r.tipo !== '<=').length;
  const total = n + nFolga + nArt;
  const M = 1e7;
  const T: number[][] = [];
  const base: number[] = [];
  let f = n;
  let a = n + nFolga;
  const cAll = new Array(total).fill(0);
  for (let j = 0; j < n; j++) cAll[j] = custo[j];
  R.forEach((r, i) => {
    const linha = new Array(total + 1).fill(0);
    for (let j = 0; j < n; j++) linha[j] = r.coef[j] ?? 0;
    if (r.tipo === '<=') {
      linha[f] = 1;
      base[i] = f++;
    } else if (r.tipo === '>=') {
      linha[f++] = -1;
      linha[a] = 1;
      cAll[a] = M;
      base[i] = a++;
    } else {
      linha[a] = 1;
      cAll[a] = M;
      base[i] = a++;
    }
    linha[total] = r.valor;
    T.push(linha);
  });
  for (let it = 0; it < 500; it++) {
    // custo reduzido de cada coluna
    let entra = -1;
    for (let j = 0; j < total; j++) {
      let z = 0;
      for (let i = 0; i < m; i++) z += cAll[base[i]] * T[i][j];
      if (cAll[j] - z < -1e-9) {
        entra = j;
        break; // Bland: o primeiro que melhora
      }
    }
    if (entra < 0) break;
    let sai = -1;
    let melhor = Infinity;
    for (let i = 0; i < m; i++) {
      if (T[i][entra] > 1e-12) {
        const q = T[i][total] / T[i][entra];
        if (q < melhor - 1e-12 || (Math.abs(q - melhor) <= 1e-12 && base[i] < base[sai])) {
          melhor = q;
          sai = i;
        }
      }
    }
    if (sai < 0) return null; // sem limite (não acontece aqui: a soma da MS é fixa)
    const p = T[sai][entra];
    for (let j = 0; j <= total; j++) T[sai][j] /= p;
    for (let i = 0; i < m; i++) {
      if (i === sai) continue;
      const k = T[i][entra];
      if (Math.abs(k) < 1e-15) continue;
      for (let j = 0; j <= total; j++) T[i][j] -= k * T[sai][j];
    }
    base[sai] = entra;
  }
  // artificial que ficou na base com valor: sem solução
  for (let i = 0; i < m; i++) if (base[i] >= n + nFolga && T[i][total] > 1e-6) return null;
  const x = new Array(n).fill(0);
  for (let i = 0; i < m; i++) if (base[i] < n) x[base[i]] = T[i][total];
  return x;
}

const ehUreia = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('ureia');

const sem = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Valores do cadastro que não parecem certos para o tipo de alimento (MS, NDT, PB fora do usual). */
export function conferirAlimento(i: { nome: string; tipo: string; ms: number; pb: number; ndt: number; fdn: number }): string | null {
  const nm = sem(i.nome);
  const prob: string[] = [];
  const silagem = nm.includes('silagem');
  const milho = nm.includes('milho') && (nm.includes('moid') || nm.includes('muid') || nm.includes('grao'));
  if (silagem && (i.ms < 20 || i.ms > 50)) prob.push(`MS de ${i.ms}% (silagem costuma ter 25 a 40%)`);
  else if (i.tipo === 'volumoso' && i.ms < 12) prob.push(`MS de ${i.ms}%`);
  if (milho && i.ndt < 70) prob.push(`NDT de ${i.ndt}% (milho moído tem cerca de 85%)`);
  else if (i.tipo !== 'mineral' && !ehUreia(i.nome) && i.ndt < 35) prob.push(`NDT de ${i.ndt}%`);
  if (i.tipo === 'volumoso' && i.ms >= 80 && i.fdn < 25) prob.push('parece grão: confira se o tipo não é concentrado');
  else if (i.tipo === 'volumoso' && i.fdn < 25) prob.push(`FDN de ${i.fdn}% (volumoso costuma ter mais de 40%)`);
  if (!ehUreia(i.nome) && i.pb > 60) prob.push(`PB de ${i.pb}%`);
  return prob.length ? `${i.nome}: ${[...new Set(prob)].join(', ')}` : null;
}

export type ResultadoFormulacao = {
  /** kg de matéria natural por cabeça por dia, na mesma ordem dos itens */
  kgMn: number[];
  /** metas que não deu para alcançar só com estes alimentos */
  faltou: string[];
  semPreco: string[];
  /** alimentos com valores de cadastro fora do usual (o formulado pode sair errado por causa deles) */
  suspeitos: string[];
  erro?: string;
};

/**
 * Calcula os kg de cada alimento.
 * cmsKg: consumo de MS por cabeça por dia; mineralKg: kg do mineral quando ele estiver sem quantidade.
 */
export function formular(itens: Item[], cmsKg: number | null, metas: Metas, mineralKg: number): ResultadoFormulacao {
  const suspeitos = itens.map(conferirAlimento).filter((x): x is string => !!x);
  const vazio = { kgMn: itens.map((i) => i.kg_mn), faltou: [] as string[], semPreco: [] as string[], suspeitos };
  if (!cmsKg || cmsKg <= 0) return { ...vazio, erro: 'Informe o peso vivo (e o consumo) para formular.' };
  const fixos = itens.map((i) => i.tipo === 'mineral');
  const livres = itens.map((_, k) => k).filter((k) => !fixos[k] && itens[k].ms > 0);
  if (!livres.length) return { ...vazio, erro: 'Escolha pelo menos um volumoso ou concentrado.' };

  // mineral: o que estiver informado; sem quantidade, a usual dos Parâmetros dividida entre eles
  const minerais = itens.map((_, k) => k).filter((k) => fixos[k]);
  const semQtd = minerais.filter((k) => !(itens[k].kg_mn > 0));
  const kgMn = itens.map((i) => i.kg_mn);
  semQtd.forEach((k) => (kgMn[k] = Math.round((mineralKg / semQtd.length) * 1000) / 1000));
  let msF = 0, ndtF = 0, pbF = 0, fdnF = 0;
  minerais.forEach((k) => {
    const ms = (kgMn[k] * itens[k].ms) / 100;
    msF += ms;
    ndtF += (ms * itens[k].ndt) / 100;
    pbF += (ms * itens[k].pb) / 100;
    fdnF += (ms * itens[k].fdn) / 100;
  });
  const resto = cmsKg - msF;
  if (resto <= 0) return { ...vazio, kgMn, erro: 'O mineral já passa do consumo de matéria seca. Confira os kg do mineral.' };

  // custo por kg de MS; sem preço, entra caro (para só ser usado se for preciso) e avisa
  const precos = livres.map((k) => (itens[k].preco_kg_mn != null ? itens[k].preco_kg_mn! / (itens[k].ms / 100) : null));
  const conhecidos = precos.filter((p): p is number => p != null);
  const caro = (conhecidos.length ? Math.max(...conhecidos) : 1) * 1.5;
  const custo = precos.map((p) => p ?? caro);
  const semPreco = livres.filter((_, j) => precos[j] == null).map((k) => itens[k].nome);
  // folgas das metas (o que faltar de NDT, PB e FDN), muito caras
  const pena = Math.max(...custo, 1) * 1000;
  const nv = livres.length + 4;
  const col = (vals: number[], extra: [number, number, number, number]) => [...vals, ...extra];
  // proteína além da conta é custo sem retorno (e risco): teto de 1,35 x a meta, com folga cara
  const pbMax = Math.max(metas.pb * 1.35, metas.pb + 3);
  const rs: Restricao[] = [
    { coef: col(livres.map(() => 1), [0, 0, 0, 0]), tipo: '=', valor: resto },
    { coef: col(livres.map((k) => itens[k].ndt / 100), [1, 0, 0, 0]), tipo: '>=', valor: (metas.ndt / 100) * cmsKg - ndtF },
    { coef: col(livres.map((k) => itens[k].pb / 100), [0, 1, 0, 0]), tipo: '>=', valor: (metas.pb / 100) * cmsKg - pbF },
    { coef: col(livres.map((k) => itens[k].fdn / 100), [0, 0, 1, 0]), tipo: '>=', valor: (metas.fdnMin / 100) * cmsKg - fdnF },
    { coef: col(livres.map((k) => itens[k].pb / 100), [0, 0, 0, -1]), tipo: '<=', valor: (pbMax / 100) * cmsKg - pbF },
  ];
  livres.forEach((k, j) => {
    if (ehUreia(itens[k].nome)) {
      const c = new Array(nv).fill(0);
      c[j] = 1;
      rs.push({ coef: c, tipo: '<=', valor: 0.01 * cmsKg });
    }
  });
  const x = simplex([...custo, pena, pena * 1.2, pena * 0.8, pena * 0.5], rs);
  if (!x) return { ...vazio, kgMn, erro: 'Não deu para formular com estes alimentos. Acrescente um volumoso e um concentrado.' };
  livres.forEach((k, j) => (kgMn[k] = Math.round((x[j] / (itens[k].ms / 100)) * 100) / 100));
  const faltou: string[] = [];
  const [dN, dP, dF, eP] = x.slice(livres.length);
  if (dN > 0.005) faltou.push(`energia (NDT): faltam ${(dN * 1000).toFixed(0)} g de NDT por cabeça`);
  if (dP > 0.005) faltou.push(`proteína (PB): faltam ${(dP * 1000).toFixed(0)} g de PB por cabeça`);
  if (dF > 0.005) faltou.push(`fibra (FDN): faltam ${(dF * 1000).toFixed(0)} g de FDN por cabeça (risco de acidose)`);
  if (eP > 0.005) faltou.push(`proteína acima do teto: sobram ${(eP * 1000).toFixed(0)} g de PB por cabeça`);
  return { kgMn, faltou, semPreco, suspeitos };
}
