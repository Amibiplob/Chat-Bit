export const THEME_KEY='chatbit-theme';
export const normalizeTheme=value=>['light','dark','system'].includes(value)?value:'system';
export const resolvedTheme=(value,dark)=>normalizeTheme(value)==='system'?(dark?'dark':'light'):normalizeTheme(value);
export function readTheme() {try{return normalizeTheme(localStorage.getItem(THEME_KEY));}catch{return 'system';}}
export function applyTheme() {document.documentElement.classList.toggle('dark',resolvedTheme(readTheme(),matchMedia('(prefers-color-scheme: dark)').matches)==='dark');}
export function changeTheme(value) {try{localStorage.setItem(THEME_KEY,normalizeTheme(value));}catch{throw new Error('Browser storage is unavailable. Allow storage to save a theme.');}applyTheme();window.dispatchEvent(new Event('chatbit-theme'));}
export function subscribeTheme(listener) {
  const update=()=>{applyTheme();listener();};const media=matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener('storage',update);window.addEventListener('chatbit-theme',update);media.addEventListener('change',update);applyTheme();
  return ()=>{window.removeEventListener('storage',update);window.removeEventListener('chatbit-theme',update);media.removeEventListener('change',update);};
}
