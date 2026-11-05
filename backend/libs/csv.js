import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { config } from './config.js';

export const readCsv = name => parse(fs.readFileSync(path.join(config.dataDir, name), 'utf8'), { columns: true, bom: true, skip_empty_lines: true });
