// Génère theme-vars.css et l'injecte dans tous les HTML d'une instance

function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255;
  let g = parseInt(hex.slice(3,5),16)/255;
  let b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      case b: h = ((r-g)/d + 4)/6; break;
    }
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1-l);
  const f = n => {
    const k = (n+h/30) % 12;
    const c = l - a * Math.max(Math.min(k-3,9-k,1),-1);
    return Math.round(255*c).toString(16).padStart(2,'0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function derive(hex, lightnessOffset, saturationOffset=0) {
  const [h, s, l] = hexToHsl(hex);
  const newL = Math.max(0, Math.min(100, l + lightnessOffset));
  const newS = Math.max(0, Math.min(100, s + saturationOffset));
  return hslToHex(h, newS, newL);
}

function hexToRgbStr(hex) {
  return [
    parseInt(hex.slice(1,3),16),
    parseInt(hex.slice(3,5),16),
    parseInt(hex.slice(5,7),16),
  ].join(',');
}

function generateThemeCss(theme) {
  const { primary, accent, dark, border } = theme;

  // Dérivés du primary
  const primaryLight   = derive(primary, +25);
  const primaryDark    = derive(primary, -15);
  const primaryVDark   = derive(primary, -30);
  const primaryMid     = derive(primary, +5);

  // Dérivés de l'accent
  const accentLight    = derive(accent, +20);
  const accentVLight   = derive(accent, +35);
  const accentDark     = derive(accent, -10);

  // Dérivés du dark
  const darkDeep       = derive(dark, -3);
  const darkMid        = derive(dark, +5);

  const rgbDark = hexToRgbStr(dark);
  const rgbPrimary = hexToRgbStr(primary);

  return `:root {
  /* === Surcharges thème MDT Builder === */
  --parchment:       ${accentVLight};
  --parchment-dark:  ${primaryLight};
  --parchment-light: ${accentVLight};
  --ink-dark:        ${darkDeep};
  --ink-brown:       ${darkMid};
  --gold:            ${primary};
  --gold-bright:     ${primaryMid};
  --gold-light:      ${accent};
  --olive:           ${primaryVDark};
  --shadow:          rgba(${rgbDark},0.5);
  --header-bg:       ${derive(dark, +8)};
  --row-alt:         rgba(${rgbPrimary},0.18);
  --border:          ${border};

  /* Variables directes */
  --theme-primary:   ${primary};
  --theme-accent:    ${accent};
  --theme-dark:      ${dark};
  --theme-border:    ${border};
  --theme-primary-light: ${primaryLight};
  --theme-accent-light:  ${accentLight};
}

body {
  background-color: ${dark} !important;
}
`;
}

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function applyThemeToInstance(instanceDir, theme) {
  const vuesDir = path.join(instanceDir, 'vues');
  const cssOut = path.join(vuesDir, 'theme-vars.css');

  // 1. Générer le fichier CSS
  fs.writeFileSync(cssOut, generateThemeCss(theme));

  // 2. Injecter <link> dans tous les HTML (en premier dans <head>)
  const htmlFiles = fs.readdirSync(vuesDir)
    .filter(f => f.endsWith('.html'))
    .map(f => path.join(vuesDir, f));

  const linkTag = '<link rel="stylesheet" href="/theme-vars.css">';
  for (const file of htmlFiles) {
    let content = fs.readFileSync(file, 'utf8');
    if (!content.includes('theme-vars.css')) {
      content = content.replace('<head>', '<head>\n' + linkTag);
      fs.writeFileSync(file, content);
    }
  }
}

module.exports = { applyThemeToInstance, generateThemeCss };
