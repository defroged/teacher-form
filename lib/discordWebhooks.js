function getValidWebhookURLs(data) {
  if (!Array.isArray(data?.webhookURLs)) {
    return [];
  }

  return data.webhookURLs
    .filter((url) => (
      typeof url === 'string'
      && /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\//i.test(url.trim())
    ))
    .map((url) => url.trim());
}

export { getValidWebhookURLs };
