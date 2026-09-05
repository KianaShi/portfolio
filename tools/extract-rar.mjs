import { createExtractorFromFile } from 'node-unrar-js';
import fs from 'fs';
import path from 'path';

const file = process.argv[2];
const outDir = process.argv[3];

fs.mkdirSync(outDir, { recursive: true });

const extractor = await createExtractorFromFile({
  filepath: file,
  targetPath: outDir,
});

const list = extractor.getFileList();
const fileHeaders = [...list.fileHeaders];
console.log('entries:', fileHeaders.length);

const extracted = extractor.extract();
const files = [...extracted.files];
console.log('extracted:', files.length);
files.forEach(f => console.log(' -', f.fileHeader.name, f.fileHeader.unpSize));
