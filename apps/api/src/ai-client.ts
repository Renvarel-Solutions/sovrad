import OpenAI from 'openai';

const providerOrigin = 'https://api.openai.com';
const allowedPaths = new Set(['/v1/responses', '/v1/responses/input_tokens']);

export function createPrivateAIClient(config: {apiKey: string; fetch?: typeof fetch}): OpenAI {
  const transport = config.fetch ?? globalThis.fetch;
  const privateFetch: typeof fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== providerOrigin || url.username || url.password || url.search || url.hash ||
        !allowedPaths.has(url.pathname) || options?.method !== 'POST') {
      throw new Error('Unapproved AI transport request');
    }
    // Rebuild the final request so ambient SDK headers and fetch options cannot cross this boundary.
    return transport(url.href, {
      method: 'POST', body: options.body, signal: options.signal, redirect: 'error',
      headers: {
        'content-type': 'application/json', accept: 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
    });
  };
  return new OpenAI({
    apiKey: config.apiKey, baseURL: `${providerOrigin}/v1`,
    organization: null, project: null, adminAPIKey: null, webhookSecret: null,
    logLevel: 'off', timeout: 20000, maxRetries: 0, fetch: privateFetch,
  });
}
