import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { twaManifest, debugManifest } from './config.mjs';
import { generateProject } from './project.mjs';
// A locked build-only dependency; never imported by Next.js runtime routes.
const require=createRequire(import.meta.url);
const {TwaManifest}=require('@bubblewrap/core');
const debug=process.argv.includes('--debug');
const value=debug?debugManifest(process.env):twaManifest(process.env),manifest=new TwaManifest(value);
if(manifest.validate()!==null)throw new Error('Invalid Bubblewrap manifest.');
if(process.argv.includes('--check')){console.log('Pinned Bubblewrap manifest validation passed.');}
else {
 const directory=fileURLToPath(new URL('./generated/',import.meta.url));
 await mkdir(directory,{recursive:true});
 await generateProject(directory,value,{localAssets:debug});
 console.log('Generated Android source. Build and signing remain separate steps.');
}
