import * as userService from './userService.js';

export async function login(pin: string) {
  const users = await userService.listUsers();
  return users.find((u: any) => u.pin === pin) || null;
}
