// External async scripts are supported by React during client error recovery.
// The layout marks this script render-blocking to apply the theme before paint.
try {
  var theme = localStorage.getItem('chatbit-theme');
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches));
} catch {
  document.documentElement.classList.toggle('dark', matchMedia('(prefers-color-scheme: dark)').matches);
}
