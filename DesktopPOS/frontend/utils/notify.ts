export type NotifyKind = "success" | "info" | "error";

export type NotifyPayload = {
  message: string;
  kind?: NotifyKind;
};

export const NOTIFY_EVENT_NAME = "axiaflex:notify";

export function notify(message: string, kind: NotifyKind = "info") {
  if (!message) return;
  window.dispatchEvent(
    new CustomEvent<NotifyPayload>(NOTIFY_EVENT_NAME, {
      detail: { message, kind },
    }),
  );
}

export function notifySuccess(message: string) {
  notify(message, "success");
}

export function notifyError(message: string) {
  notify(message, "error");
}

export function notifyInfo(message: string) {
  notify(message, "info");
}
