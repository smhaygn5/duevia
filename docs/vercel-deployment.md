# Duevia on Vercel

Duevia's Vercel deployment runs the Next.js application on Vercel while the
existing private Duevia backend continues to own D1 agreement records and R2
deliverables. Requests under `/api/*` are handled by a server-side bridge. The
private backend bearer token is stored only in Vercel environment variables.

Production URL: `https://duevia.vercel.app`

Required production environment variables:

- `NEXT_PUBLIC_DUEVIA_FACTORY_ADDRESS`
- `DUEVIA_BACKEND_URL`
- `DUEVIA_BACKEND_BEARER_TOKEN`

The backend URL must use HTTPS. Never commit the bearer token or pass it to the
browser.

Vercel Functions accept request and response payloads up to 4.5 MB. Duevia's
Vercel surface therefore enforces a 4 MB protected-deliverable limit to leave
room for multipart form metadata. Larger files should continue through the
Cloudflare-hosted surface until a direct-to-storage upload flow is added.
