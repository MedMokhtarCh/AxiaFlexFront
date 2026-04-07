export type ConfirmPayload = {
  id: string;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: "danger" | "default";
};

export type ConfirmResponsePayload = {
  id: string;
  confirmed: boolean;
};

export const CONFIRM_REQUEST_EVENT_NAME = "axiaflex:confirm:request";
export const CONFIRM_RESPONSE_EVENT_NAME = "axiaflex:confirm:response";

export function askConfirm(options: Omit<ConfirmPayload, "id">): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const onResponse = (event: Event) => {
      const customEvent = event as CustomEvent<ConfirmResponsePayload>;
      if (customEvent.detail?.id !== id) return;
      window.removeEventListener(
        CONFIRM_RESPONSE_EVENT_NAME,
        onResponse as EventListener,
      );
      resolve(Boolean(customEvent.detail?.confirmed));
    };

    window.addEventListener(
      CONFIRM_RESPONSE_EVENT_NAME,
      onResponse as EventListener,
    );

    window.dispatchEvent(
      new CustomEvent<ConfirmPayload>(CONFIRM_REQUEST_EVENT_NAME, {
        detail: {
          id,
          title: options.title,
          message: options.message,
          confirmText: options.confirmText,
          cancelText: options.cancelText,
          tone: options.tone,
        },
      }),
    );
  });
}
