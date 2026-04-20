/** Préférence d'affichage du plan de salle au POS (stockée en localStorage sur ce navigateur). */

export const ROOM_DISPLAY_STORAGE_KEY = "axiaflex_room_display_mode";

export type RoomDisplayMode = "plan" | "simple";

const EVENT_NAME = "axiaflex-room-display-mode";

export function getRoomDisplayMode(): RoomDisplayMode {
  try {
    const v = localStorage.getItem(ROOM_DISPLAY_STORAGE_KEY);
    if (v === "simple" || v === "plan") return v;
  } catch {
    /* ignore */
  }
  return "plan";
}

export function setRoomDisplayMode(mode: RoomDisplayMode): void {
  try {
    localStorage.setItem(ROOM_DISPLAY_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(
      new CustomEvent<RoomDisplayMode>(EVENT_NAME, { detail: mode }),
    );
  } catch {
    /* ignore */
  }
}

export function subscribeRoomDisplayMode(
  listener: (mode: RoomDisplayMode) => void,
): () => void {
  const handler = (ev: Event) => {
    const ce = ev as CustomEvent<RoomDisplayMode>;
    if (ce.detail === "simple" || ce.detail === "plan") listener(ce.detail);
  };
  window.addEventListener(EVENT_NAME, handler as EventListener);
  return () =>
    window.removeEventListener(EVENT_NAME, handler as EventListener);
}
