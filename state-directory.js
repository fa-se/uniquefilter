import path from 'path';
import { fileURLToPath } from 'url';

// Where the server keeps data it writes at runtime: the league cache and the
// generated unique lists. In production systemd's StateDirectory= sets
// STATE_DIRECTORY (/var/lib/uniquefilter), so the code checkout can stay read-only
// for the service. Locally it defaults to ./state in the checkout.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export const stateDirectory = process.env.STATE_DIRECTORY || path.join(projectRoot, 'state');

// Served at /json/ (the frontend imports /json/*-uniques.js).
export const uniqueListsDirectory = path.join(stateDirectory, 'json');
