export const MAX_PLACES = 200;
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function tripDays(trip) {
  return Math.round((Date.parse(trip.endDate) - Date.parse(trip.startDate)) / 86400000) + 1;
}
function text(value, max = 200, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error('文字内容为空或过长');
  return value.trim();
}
export function validateWorkspace(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.trips) || input.trips.length > 30) throw new Error('行程文件格式不正确（最多 30 份行程）');
  const ids = new Set();
  let count = 0;
  const trips = input.trips.map(t => {
    const id = text(t.id, 80, true);
    if (ids.has(id)) throw new Error('行程编号重复');
    ids.add(id);
    if (!validDate(t.startDate) || !validDate(t.endDate) || tripDays(t) < 1 || tripDays(t) > 60) throw new Error('每份行程日期应为 1–60 天');
    if (!Array.isArray(t.places) || t.places.length > MAX_PLACES) throw new Error('每份行程最多 200 个地点');
    const placeIds = new Set();
    const places = t.places.map(p => {
      const pid = text(p.id, 80, true);
      if (placeIds.has(pid)) throw new Error('地点编号重复');
      placeIds.add(pid);
      if (!['spot', 'food', 'hotel'].includes(p.type)) throw new Error('地点类型不正确');
      if (!Number.isInteger(p.day) || p.day < 0 || p.day > tripDays(t)) throw new Error('地点日期超出行程范围');
      const location = p.location;
      if (location !== null && (!Array.isArray(location) || location.length !== 2 || !location.every(Number.isFinite) || location[0] < -180 || location[0] > 180 || location[1] < -90 || location[1] > 90)) throw new Error('地点坐标不正确');
      const checkIn = text(p.checkIn || '', 10), checkOut = text(p.checkOut || '', 10);
      if (p.type === 'hotel' && ((checkIn && !validDate(checkIn)) || (checkOut && !validDate(checkOut)) || Boolean(checkIn) !== Boolean(checkOut) || (checkIn && checkOut <= checkIn))) throw new Error('酒店退房日期应晚于入住日期');
      return { id: pid, name: text(p.name, 160, true), type: p.type, day: p.day, location,
        poiId: text(p.poiId || '', 80), address: text(p.address || '', 400), notes: text(p.notes || '', 2000), checkIn, checkOut };
    });
    count += places.length;
    return { id, name: text(t.name, 100, true), city: text(t.city, 80, true), startDate: t.startDate, endDate: t.endDate, places };
  });
  if (count > 1000) throw new Error('所有行程合计最多 1000 个地点');
  return { version: 1, activeTripId: trips.some(t => t.id === input.activeTripId) ? input.activeTripId : (trips[0]?.id || null), trips };
}
