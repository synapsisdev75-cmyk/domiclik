import type { Plugin } from 'vite';

type Req = {
  method?: string;
  on: (event: string, cb: (chunk?: Buffer) => void) => void;
};

type Res = {
  statusCode: number;
  setHeader: (k: string, v: string) => void;
  end: (body?: string) => void;
};

async function readBody(req: Req): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    req.on('data', (chunk) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** Canjea code+PKCE en el servidor Vite para no exponer el client_secret. */
export function googleOAuthTokenPlugin(clientSecret = ''): Plugin {
  const handler = async (req: Req, res: Res, next: () => void) => {
    if (req.method !== 'POST') {
      next();
      return;
    }
    try {
      const data = JSON.parse((await readBody(req)) || '{}') as {
        clientId?: string;
        code?: string;
        codeVerifier?: string;
        redirectUri?: string;
      };
      if (!data.clientId || !data.code || !data.codeVerifier || !data.redirectUri) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'missing_oauth_fields' }));
        return;
      }
      const body = new URLSearchParams({
        client_id: data.clientId,
        code: data.code,
        code_verifier: data.codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: data.redirectUri,
      });
      if (clientSecret) body.set('client_secret', clientSecret);
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const text = await tokenRes.text();
      res.statusCode = tokenRes.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(text);
    } catch {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'token_exchange_failed' }));
    }
  };

  return {
    name: 'google-oauth-token',
    configureServer(server) {
      server.middlewares.use('/api/google-oauth-token', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/google-oauth-token', handler);
    },
  };
}
