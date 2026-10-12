// 自己畫的 SVG 線條圖示與插圖。不使用 emoji，也不使用文字符號當圖示。

const base = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

const ico = (inner, size = 20) =>
  `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" ${base}>${inner}</svg>`;

export const icon = {
  pin: (s) => ico('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>', s),
  link: (s) => ico('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>', s),
  check: (s) => ico('<path d="M5 12.5l4.5 4.5L19 7.5"/>', s),
  search: (s) => ico('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', s),
  sliders: (s) => ico('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>', s),
  clock: (s) => ico('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', s),
  close: (s) => ico('<path d="M6 6l12 12M18 6L6 18"/>', s),
  dice: (s) => ico('<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none"/>', s),
};

const INK = 'var(--ink)';

// 一碗麵：冒熱氣、筷子靠在碗邊。soup 為 false 時是空碗。
export function bowl({ soup = true, label = '冒著熱氣的一碗麵' } = {}) {
  const steam = soup
    ? `<g fill="none" stroke="var(--blue-deep)" stroke-width="3" stroke-linecap="round">
         <path d="M58 40c-7-8 7-13 0-23"/><path d="M80 44c-7-8 7-13 0-23"/><path d="M102 40c-7-8 7-13 0-23"/>
       </g>`
    : '';
  const toppings = soup
    ? `<circle cx="68" cy="66" r="5.5" fill="#fff" stroke="${INK}" stroke-width="2"/>
       <path d="M86 63c6-5 13-3 15 1-6 5-13 4-15-1z" fill="var(--green)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
       <path d="M50 63c5-4 10-3 12 0-5 4-10 3-12 0z" fill="var(--green)" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
    : `<path d="M52 66c8 4 48 4 56 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity=".45"/>`;
  return `<svg class="art" viewBox="0 0 160 140" role="img" aria-label="${label}">
    ${steam}
    <path d="M24 64c0 40 24 60 56 60s56-20 56-60z" fill="var(--blue)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M38 86c10 14 74 14 84 0" fill="none" stroke="var(--paper)" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M56 124h48l-5 9H61z" fill="var(--blue)" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <ellipse cx="80" cy="64" rx="56" ry="11" fill="${soup ? 'var(--yellow)' : 'var(--paper)'}" stroke="${INK}" stroke-width="3"/>
    ${toppings}
    ${soup ? `<path d="M128 8L102 68M140 14L112 70" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>` : ''}
  </svg>`;
}

// 小小的標誌
export function mark() {
  return `<svg class="mark" viewBox="0 0 40 40" width="36" height="36" aria-hidden="true" focusable="false">
    <path d="M15 12c-3-3 3-5 0-9M25 12c-3-3 3-5 0-9" fill="none" stroke="var(--blue-deep)" stroke-width="2" stroke-linecap="round"/>
    <path d="M6 20c0 10 6 15 14 15s14-5 14-15z" fill="var(--blue)" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <ellipse cx="20" cy="20" rx="14" ry="3.4" fill="var(--yellow)" stroke="${INK}" stroke-width="2.2"/>
  </svg>`;
}
