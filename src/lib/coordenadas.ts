// Lê coordenadas digitadas ou coladas na busca do mapa (do Google Maps, de um GPS, do CAR, de um link).

const noBrasil = (lat: number, lng: number) => lat >= -34.5 && lat <= 6 && lng >= -74.5 && lng <= -28;

function arrumar(a: number, b: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (noBrasil(a, b)) return { lat: a, lng: b };
  if (noBrasil(b, a)) return { lat: b, lng: a }; // vieram na ordem longitude, latitude
  // sem o sinal de menos (no Brasil quase tudo é sul e oeste)
  if (a > 0 && b > 0 && noBrasil(-a, -b)) return { lat: -a, lng: -b };
  if (a > 0 && b > 0 && noBrasil(-b, -a)) return { lat: -b, lng: -a };
  return null;
}

/** Graus, minutos e segundos: 19°31'55.6"S 40°37'52.3"W (ou O de oeste). */
function grausMinutos(t: string): { lat: number; lng: number } | null {
  const re = /(\d{1,3})\s*[°ºd]\s*(\d{1,2})\s*['’′m]\s*(\d{1,2}(?:[.,]\d+)?)?\s*(?:["”″s]|'')?\s*([NSLEOW])/gi;
  const v: { valor: number; letra: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const valor = Number(m[1]) + Number(m[2]) / 60 + Number((m[3] ?? '0').replace(',', '.')) / 3600;
    v.push({ valor, letra: m[4].toUpperCase() });
  }
  if (v.length !== 2) return null;
  const lat = v.find((x) => x.letra === 'N' || x.letra === 'S');
  const lng = v.find((x) => x.letra === 'L' || x.letra === 'E' || x.letra === 'O' || x.letra === 'W');
  if (!lat || !lng) return null;
  const r = { lat: lat.letra === 'S' ? -lat.valor : lat.valor, lng: lng.letra === 'O' || lng.letra === 'W' ? -lng.valor : lng.valor };
  return noBrasil(r.lat, r.lng) ? r : null;
}

/**
 * Coordenadas no texto, ou null se o texto é nome de lugar. Aceita:
 * "-19.5321, -40.6312" · "-19,5321 -40,6312" · "19.5321 S 40.6312 W" · 19°31'55.6"S 40°37'52.3"W · link do Google Maps com @lat,lng.
 */
export function lerCoordenadas(texto: string): { lat: number; lng: number } | null {
  const t = texto.trim();
  if (!t) return null;
  // link do Google Maps: ...!3d-19.53!4d-40.63 (o ponto marcado) ou .../@-19.53,-40.63,15z (o centro da tela)
  const link = t.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ?? t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? t.match(/[?&](?:q|ll|query)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i);
  if (link) return arrumar(Number(link[1]), Number(link[2]));
  if (/^https?:/i.test(t)) return null;
  const gms = grausMinutos(t);
  if (gms) return gms;
  // decimais: dois números com pelo menos 3 casas (para não confundir com endereço, tipo "km 12, lote 4")
  const semRotulo = t.replace(/lat(itude)?|lon(g|gitude)?/gi, '');
  if (semRotulo.replace(/[\d\s.,;:+\-°º]/g, '').replace(/[NSLEOW]/gi, '')) return null;
  const nums = semRotulo.match(/-?\d{1,3}[.,]\d{3,}/g);
  if (!nums || nums.length !== 2) return null;
  let a = Number(nums[0].replace(',', '.'));
  let b = Number(nums[1].replace(',', '.'));
  if (/S/i.test(semRotulo) && a > 0) a = -a;
  if (/[OW]/i.test(semRotulo) && b > 0) b = -b;
  return arrumar(a, b);
}
