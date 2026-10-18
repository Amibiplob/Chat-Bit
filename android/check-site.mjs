import { verifySite } from './verify-site.mjs';
await verifySite(process.env);
console.log('Configured site serves matching Digital Asset Links. Device verification is still required.');
