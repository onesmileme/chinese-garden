import { useEffect } from "react";

const store = new Map<string, unknown>();
const didHide = new Set<() => void>();
const didShow = new Set<() => void>();

export function useDidHide(handler: () => void): void {
  useEffect(() => {
    didHide.add(handler);
    return () => void didHide.delete(handler);
  }, [handler]);
}

export function useDidShow(handler: () => void): void {
  useEffect(() => {
    didShow.add(handler);
    return () => void didShow.delete(handler);
  }, [handler]);
}

export function emitDidHide(): void {
  for (const handler of didHide) handler();
}

export function emitDidShow(): void {
  for (const handler of didShow) handler();
}

export default {
  getStorage: async ({ key }: { key: string }) => {
    if (!store.has(key)) {
      throw new Error("not found");
    }
    return { data: store.get(key) };
  },
  setStorage: async ({ key, data }: { key: string; data: unknown }) => {
    store.set(key, data);
  },
  removeStorage: async ({ key }: { key: string }) => {
    store.delete(key);
  },
  getStorageSync: (key: string) => store.get(key),
  setStorageSync: (key: string, data: unknown) => {
    store.set(key, data);
  },
  removeStorageSync: (key: string) => {
    store.delete(key);
  },
  login: async () => ({ code: "mock-code" }),
  vibrateShort: () => {},
  navigateTo: async (_options: { url: string }) => {},
  navigateBack: async (_options: { delta: number }) => {},
  redirectTo: async (_options: { url: string }) => {},
  getSystemInfoSync: () => ({ statusBarHeight: 24 }),
  createInnerAudioContext: () => ({
    src: "",
    play: () => {},
    destroy: () => {},
  }),
};
