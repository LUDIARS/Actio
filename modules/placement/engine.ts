/**
 * Placement engine — pure logic.
 *
 * - haversine: 2 点間の地球上距離 (m)
 * - findCurrentPlace: 一覧から「半径内かつ最も近い」 place を返す
 * - diffTransitions: 過去 state と現在 place を比較して enter/leave を抽出
 */

const EARTH_RADIUS_M = 6_371_000;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export interface PlaceLike {
  id: string;
  lat: number;
  lon: number;
  radiusM: number;
}

/** 半径内の place のうち、 距離が最も近いものを 1 つ返す。 該当なしなら null。 */
export function findCurrentPlace<P extends PlaceLike>(
  lat: number,
  lon: number,
  places: P[],
): P | null {
  let best: { p: P; d: number } | null = null;
  for (const p of places) {
    const d = haversineMeters(lat, lon, p.lat, p.lon);
    if (d <= p.radiusM) {
      if (!best || d < best.d) best = { p, d };
    }
  }
  return best?.p ?? null;
}

export type PlaceTransition =
  | { type: "leave"; placeId: string }
  | { type: "enter"; placeId: string };

/**
 * 直前と現在の在席 place を比較して transition を抽出。
 *
 * - 同じ place のまま (or どちらも null) → 空配列
 * - place 変化なし (null → null) → 空
 * - X → null → leave X
 * - null → Y → enter Y
 * - X → Y → leave X, enter Y (順序固定: leave が先)
 */
export function diffTransitions(
  previousPlaceId: string | null,
  currentPlaceId: string | null,
): PlaceTransition[] {
  if (previousPlaceId === currentPlaceId) return [];
  const out: PlaceTransition[] = [];
  if (previousPlaceId !== null) out.push({ type: "leave", placeId: previousPlaceId });
  if (currentPlaceId !== null) out.push({ type: "enter", placeId: currentPlaceId });
  return out;
}
