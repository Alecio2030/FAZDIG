import { useEffect, useState } from 'react';

/** Mostra o aviso de sucesso do lançamento anterior por alguns segundos e some (a tela começa limpa). */
export function useAvisoTemporario(aviso: string | undefined, segundos = 8): string | null {
  const [texto, setTexto] = useState<string | null>(aviso ?? null);
  useEffect(() => {
    setTexto(aviso ?? null);
    if (!aviso) return;
    const t = setTimeout(() => setTexto(null), segundos * 1000);
    return () => clearTimeout(t);
  }, [aviso, segundos]);
  return texto;
}
