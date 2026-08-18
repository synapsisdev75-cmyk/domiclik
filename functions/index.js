const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const googleOAuthSecret = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');

/** Canje OAuth Google (PKCE) — usado por login en domiclick.com y ops */
exports.googleOAuthToken = onRequest(
  { cors: true, secrets: [googleOAuthSecret] },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'method_not_allowed' });
      return;
    }

    const { clientId, code, codeVerifier, redirectUri } = req.body || {};
    if (!clientId || !code || !codeVerifier || !redirectUri) {
      res.status(400).json({ error: 'missing_oauth_fields' });
      return;
    }

    const body = new URLSearchParams({
      client_id: clientId,
      code,
      code_verifier: codeVerifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const secret = googleOAuthSecret.value();
    if (secret) body.set('client_secret', secret);

    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const text = await tokenRes.text();
      res.status(tokenRes.status).set('Content-Type', 'application/json').send(text);
    } catch {
      res.status(500).json({ error: 'token_exchange_failed' });
    }
  }
);
