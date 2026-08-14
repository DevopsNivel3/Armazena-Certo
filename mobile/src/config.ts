const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;

if (!configuredApiUrl) {
  throw new Error('EXPO_PUBLIC_API_URL nao foi configurada no arquivo .env do mobile.');
}

export const API_URL = configuredApiUrl.replace(/\/$/, '');
export const PAGE_SIZE = 500;
export const MAX_SYNC_ATTEMPTS = 5;
