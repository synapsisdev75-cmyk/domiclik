import { readFileSync, writeFileSync } from 'fs';

const SRC = 'C:\\Users\\empre\\Downloads\\data_safety_sample.csv';
const OUT_DESKTOP = 'C:\\Users\\empre\\Desktop\\domiclik-release\\data_safety_domiclick_play.csv';
const OUT_DOCS = 'C:\\Users\\empre\\Desktop\\domiclik-main\\docs\\data_safety_domiclick_play.csv';

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function toCsvField(v) {
  if (v.includes('"') || v.includes(',') || v.includes('\n')) {
    return `"${v.replaceAll('"', '""')}"`;
  }
  return v;
}

const DELETE_URL = 'https://domiclick.com/delete-account.html';

/** Collected types for DomiClick */
const TYPES = {
  PSL_NAME: { shared: false, required: true, purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'] },
  PSL_EMAIL: { shared: false, required: true, purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'] },
  PSL_USER_ACCOUNT: { shared: false, required: true, purposes: ['PSL_APP_FUNCTIONALITY', 'PSL_ACCOUNT_MANAGEMENT'] },
  PSL_ADDRESS: { shared: true, required: true, purposes: ['PSL_APP_FUNCTIONALITY'] },
  PSL_PHONE: { shared: true, required: true, purposes: ['PSL_APP_FUNCTIONALITY'] },
  PSL_PRECISE_LOCATION: { shared: true, required: true, purposes: ['PSL_APP_FUNCTIONALITY'] },
  PSL_PHOTOS: { shared: false, required: false, purposes: ['PSL_APP_FUNCTIONALITY'] },
  PSL_OTHER_MESSAGES: { shared: true, required: true, purposes: ['PSL_APP_FUNCTIONALITY'] },
  PSL_USER_INTERACTION: { shared: false, required: true, purposes: ['PSL_APP_FUNCTIONALITY'] },
  PSL_USER_GENERATED_CONTENT: { shared: false, required: false, purposes: ['PSL_APP_FUNCTIONALITY'] },
};

const answers = new Map();
function set(qid, rid, value) {
  answers.set(`${qid}\t${rid || ''}`, value);
}

set('PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA', '', 'true');
set('PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT', '', 'true');
set('PSL_SUPPORTED_ACCOUNT_CREATION_METHODS', 'PSL_ACM_OAUTH', 'true');
set('PSL_ACCOUNT_DELETION_URL', '', DELETE_URL);
set('PSL_SUPPORT_DATA_DELETION_BY_USER', 'DATA_DELETION_YES', 'true');
set('PSL_DATA_DELETION_URL', '', DELETE_URL);

set('PSL_DATA_TYPES_PERSONAL', 'PSL_NAME', 'true');
set('PSL_DATA_TYPES_PERSONAL', 'PSL_EMAIL', 'true');
set('PSL_DATA_TYPES_PERSONAL', 'PSL_USER_ACCOUNT', 'true');
set('PSL_DATA_TYPES_PERSONAL', 'PSL_ADDRESS', 'true');
set('PSL_DATA_TYPES_PERSONAL', 'PSL_PHONE', 'true');
set('PSL_DATA_TYPES_LOCATION', 'PSL_PRECISE_LOCATION', 'true');
set('PSL_DATA_TYPES_PHOTOS_AND_VIDEOS', 'PSL_PHOTOS', 'true');
set('PSL_DATA_TYPES_EMAIL_AND_TEXT', 'PSL_OTHER_MESSAGES', 'true');
set('PSL_DATA_TYPES_APP_ACTIVITY', 'PSL_USER_INTERACTION', 'true');
set('PSL_DATA_TYPES_APP_ACTIVITY', 'PSL_USER_GENERATED_CONTENT', 'true');

for (const [type, cfg] of Object.entries(TYPES)) {
  const p = `PSL_DATA_USAGE_RESPONSES:${type}`;
  set(`${p}:PSL_DATA_USAGE_COLLECTION_AND_SHARING`, 'PSL_DATA_USAGE_ONLY_COLLECTED', 'true');
  if (cfg.shared) {
    set(`${p}:PSL_DATA_USAGE_COLLECTION_AND_SHARING`, 'PSL_DATA_USAGE_ONLY_SHARED', 'true');
  }
  set(`${p}:PSL_DATA_USAGE_EPHEMERAL`, '', 'false');
  if (cfg.required) {
    set(`${p}:DATA_USAGE_USER_CONTROL`, 'PSL_DATA_USAGE_USER_CONTROL_REQUIRED', 'true');
  } else {
    set(`${p}:DATA_USAGE_USER_CONTROL`, 'PSL_DATA_USAGE_USER_CONTROL_OPTIONAL', 'true');
  }
  for (const purpose of cfg.purposes) {
    set(`${p}:DATA_USAGE_COLLECTION_PURPOSE`, purpose, 'true');
  }
  if (cfg.shared) {
    set(`${p}:DATA_USAGE_SHARING_PURPOSE`, 'PSL_APP_FUNCTIONALITY', 'true');
  }
}

const raw = readFileSync(SRC, 'utf8').replace(/^\uFEFF/, '');
const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
const header = parseCsvLine(lines[0]);
if (header[0] !== 'Question ID (machine readable)') {
  throw new Error(`Unexpected header: ${header[0]}`);
}

const outLines = [lines[0]];
for (let i = 1; i < lines.length; i++) {
  const cols = parseCsvLine(lines[i]);
  while (cols.length < 5) cols.push('');
  const qid = cols[0];
  const rid = cols[1];
  const key = `${qid}\t${rid || ''}`;
  const value = answers.has(key) ? answers.get(key) : '';
  cols[2] = value;
  outLines.push(cols.map(toCsvField).join(','));
}

const csv = outLines.join('\n') + '\n';
writeFileSync(OUT_DESKTOP, csv, 'utf8');
writeFileSync(OUT_DOCS, csv, 'utf8');
console.log(`Wrote ${outLines.length - 1} rows`);
console.log(OUT_DESKTOP);
