export const CacheKeys = {
  user: (sub: string) => `user:${sub}`,
  signIn: (signIn: string) => `signin:${signIn}`,
  discordState: (state: string) => `discord-state:${state}`,
  mergeOffer: (token: string) => `merge-offer:${token}`,
};
