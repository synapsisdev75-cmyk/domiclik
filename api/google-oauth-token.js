export default async function handler(req, res) {
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
  if (process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    body.set('client_secret', process.env.GOOGLE_OAUTH_CLIENT_SECRET);
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await tokenRes.text();
  res.status(tokenRes.status).setHeader('Content-Type', 'application/json').send(text);
}
