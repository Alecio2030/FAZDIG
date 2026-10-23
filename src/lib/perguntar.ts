import { Alert } from './alerta';

/** Pergunta com dois botões e espera a resposta: true = confirmou. */
export function perguntar(titulo: string, mensagem: string, confirmar = 'Confirmar', voltar = 'Alterar'): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      titulo,
      mensagem,
      [
        { text: voltar, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmar, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/**
 * Sexo que o lote tem: o definido no lote ou, se não tiver, o de todos os animais que estão nele.
 * Devolve null se o lote é misto ou vazio.
 */
export async function sexoDoLote(supabase: any, loteId: string, ignorarAnimalId?: string | null): Promise<{ sexo: 'M' | 'F' | null; numero: number | null }> {
  const { data: l } = await supabase.from('lotes').select('sexo, numero').eq('id', loteId).single();
  const definido = (l?.sexo?.trim() || null) as 'M' | 'F' | null;
  if (definido) return { sexo: definido, numero: l?.numero ?? null };
  let q = supabase.from('animais').select('sexo').eq('lote_id', loteId).eq('situacao', 'ativo');
  if (ignorarAnimalId) q = q.neq('id', ignorarAnimalId);
  const { data: a } = await q.limit(1000);
  const sexos = new Set(((a ?? []) as { sexo: string }[]).map((x) => x.sexo));
  return { sexo: sexos.size === 1 ? ([...sexos][0] as 'M' | 'F') : null, numero: l?.numero ?? null };
}
