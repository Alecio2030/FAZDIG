import React, { useCallback } from 'react';
import { View } from 'react-native';
import Campo from './Campo';
import CampoData from './CampoData';
import CampoSugestao from './CampoSugestao';
import { CATEGORIAS, sugestoesProduto, sugestoesServico, type Categoria } from '../lib/mangas';
import { dataValida, paraBanco } from '../lib/datas';
import { lerNumero } from '../lib/formatos';

export type ManejoEd = { data: string; produto: string; qtde: string; servico: string };
export const MANEJO_VAZIO: ManejoEd = { data: '', produto: '', qtde: '', servico: '' };

type Props = {
  categoria: Categoria;
  valor: ManejoEd;
  aoMudar: (v: ManejoEd) => void;
  /** ex.: "Data da limpeza" ou "Nova limpeza (data)" */
  rotuloData: string;
  erro?: string | null;
};

/** Campos do manejo de uma estrutura, conforme o tipo dela. */
export default function CamposManejo({ categoria, valor, aoMudar, rotuloData, erro }: Props) {
  const info = CATEGORIAS[categoria];
  const mudar = (parte: Partial<ManejoEd>) => aoMudar({ ...valor, ...parte });
  const carregarProduto = useCallback(() => sugestoesProduto(categoria), [categoria]);

  return (
    <View style={{ gap: 12 }}>
      <CampoData rotulo={rotuloData} valor={valor.data} aoMudar={(data) => mudar({ data })} erro={erro} />
      {info.rotuloProduto && (
        <>
          <CampoSugestao
            rotulo={info.rotuloProduto}
            valor={valor.produto}
            aoMudar={(produto) => mudar({ produto })}
            carregar={carregarProduto}
            placeholder={categoria === 'cocho_sal' ? 'Ex.: Sal mineral Fos 80' : 'Ex.: Silagem de milho'}
          />
          <Campo rotulo="Quantidade colocada (kg)" value={valor.qtde} onChangeText={(qtde) => mudar({ qtde })} keyboardType="decimal-pad" placeholder="0" />
        </>
      )}
      {categoria === 'cerca' && (
        <CampoSugestao
          rotulo="Serviço executado"
          valor={valor.servico}
          aoMudar={(servico) => mudar({ servico })}
          carregar={sugestoesServico}
          placeholder="Ex.: Troca de 20 mourões"
        />
      )}
    </View>
  );
}

/** Algo foi preenchido neste manejo? */
export function manejoPreenchido(m: ManejoEd): boolean {
  return !!(m.data.trim() || m.produto.trim() || m.qtde.trim() || m.servico.trim());
}

/** Confere o manejo; devolve o problema por extenso ou null. */
export function conferirManejo(m: ManejoEd): string | null {
  if (!manejoPreenchido(m)) return null;
  if (!m.data.trim()) return 'Informe a data.';
  if (!dataValida(m.data)) return 'Data inválida (use dd/mm/aaaa).';
  if (m.qtde.trim()) {
    const q = lerNumero(m.qtde);
    if (q === null || q < 0) return 'Quantidade inválida. Use vírgula para decimais, ex.: 25,5';
  }
  return null;
}

/** Registro para gravar em manga_manejos. */
export function registroManejo(m: ManejoEd, categoria: Categoria) {
  return {
    categoria,
    tipo: CATEGORIAS[categoria].manejo,
    data: paraBanco(m.data)!,
    produto: CATEGORIAS[categoria].rotuloProduto ? m.produto.trim() || null : null,
    quantidade_kg: CATEGORIAS[categoria].rotuloProduto ? lerNumero(m.qtde) : null,
    servico: categoria === 'cerca' ? m.servico.trim() || null : null,
  };
}
