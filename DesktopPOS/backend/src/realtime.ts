type BroadcastFn = (event: string, data: any) => void;

let broadcast: BroadcastFn = () => {};

export const setBroadcast = (fn: BroadcastFn) => {
  broadcast = fn;
};

export const emitEvent = (event: string, data: any) => {
  broadcast(event, data);
};
