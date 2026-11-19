import fs from 'fs';

// Sent with every outgoing request. Cloudflare in front of pathofexile.com blocks
// fetch's default User-Agent ("node") with a 403, and PoE's API rules ask for this
// format: OAuth <client_id>/<version> (contact: ...).
const { version } = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export const USER_AGENT = `OAuth uniquefilter/${version} (contact: https://uniquefilter.dev)`;
