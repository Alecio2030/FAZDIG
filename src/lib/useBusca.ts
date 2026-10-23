import { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { traduzirErro } from './supabase';

/** Tira da busca os caracteres que atrapalham o filtro do banco. */
export const limparBusca = (t: string) => t.replace(/[,()*%\\]/g, '').trim();

/** "123" -> "*1*2*3*": acha os dígitos mesmo com pontos, barras e traços no meio (CPF/CNPJ). */
export const padraoDigitos = (digitos: string) => `*${digitos.split('').join('*')}*`;

/**
 * Busca enquanto a pessoa digita (espera ela parar um instante).
 * Refaz a busca ao voltar para a tela, para mostrar o que foi alterado.
 * A função `buscar` deve vir de um useCallback.
 */
export function useBusca<T>(termo: string, buscar: (termo: string) => Promise<T[]>, opcoes?: { listarTudo?: boolean }) {
  // V130: nos cadastros, a consulta já abre com a relação dos cadastrados (a busca filtra)
  const listarTudo = !!opcoes?.listarTudo;
  const focado = useIsFocused();
  const [achados, setAchados] = useState<T[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!focado) return;
    if (!termo && !listarTudo) {
      setAchados(null);
      setBuscando(false);
      return;
    }
    let vivo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      setErro(null);
      try {
        const d = await buscar(termo);
        if (vivo) setAchados(d);
      } catch (e) {
        if (vivo) setErro(traduzirErro(e));
      }
      if (vivo) setBuscando(false);
    }, termo ? 350 : 0);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [termo, buscar, focado, listarTudo]);

  return { achados, buscando, erro };
}
