export const CacheKeys = {
  user: (sub: string) => `user:${sub}`,
  signIn: (signIn: string) => `signin:${signIn}`,
};
