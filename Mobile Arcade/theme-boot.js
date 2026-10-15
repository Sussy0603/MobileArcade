// Applied before first paint so a returning visitor's saved choice doesn't
// flash the wrong theme. Nothing stored = follow the OS, handled in CSS by
// the prefers-color-scheme block in index.html.
//
// A file rather than an inline <script>, and it has to stay one: this page
// is served on the MOS origin, whose CSP is `script-src 'self'` — inline
// script there is blocked outright (see securityHeaders in ../security.js).
// The tag in <head> is deliberately plain, with no defer/async, because a
// theme applied after first paint is a flash of the wrong colours.
(function(){
  try{
    var saved = localStorage.getItem('mosArcadeTheme');
    if(saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
  }catch(e){}
})();
