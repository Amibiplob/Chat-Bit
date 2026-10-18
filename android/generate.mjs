import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { twaManifest } from './config.mjs';
// A locked build-only dependency; never imported by Next.js runtime routes.
const require=createRequire(import.meta.url);
const {TwaManifest,TwaGenerator,ConsoleLog}=require('@bubblewrap/core');
const value=twaManifest(process.env),manifest=new TwaManifest(value);
if(manifest.validate()!==null)throw new Error('Invalid Bubblewrap manifest.');
if(process.argv.includes('--check')){console.log('Pinned Bubblewrap manifest validation passed.');}
else {
 const directory=fileURLToPath(new URL('./generated/',import.meta.url));
 await mkdir(directory,{recursive:true});
 await new TwaGenerator().createTwaProject(directory,manifest,new ConsoleLog('ChatBit Android'));
 await writeFile(new URL('./generated/twa-manifest.json',import.meta.url),JSON.stringify(value,null,2)+'\n');
 console.log('Generated Android source. Build and signing remain separate steps.');
}
