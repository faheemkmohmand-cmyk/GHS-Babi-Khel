// Problem 43: Favicon Solution
// Generate a professional favicon for GHS Babi Khel school website

/*
 * ═══════════════════════════════════════════════════════════════
 * FAVICON GENERATION INSTRUCTIONS
 * ═══════════════════════════════════════════════════════════════
 * 
 * OPTION 1: Use Online Generator (Easiest)
 * ────────────────────────────────────────
 * 1. Go to: https://realfavicongenerator.net/
 * 2. Upload your school logo
 * 3. Select "Favicon for all platforms"
 * 4. Download and extract to /public/ folder
 * 
 * OPTION 2: Use This SVG (Below)
 * ────────────────────────────────────────
 * Save as: public/favicon.svg
 * 
 * OPTION 3: Simple PNG Creation
 * ────────────────────────────────────────
 * Use any image editor to create:
 * - favicon-16.png (16x16px)
 * - favicon-32.png (32x32px)
 * - favicon-192.png (192x192px)
 * - apple-touch-icon.png (180x180px)
 */

// ─── SVG Favicon Code ─────────────────────────────────────────────

export const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0086FF;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0056b3;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background circle -->
  <circle cx="50" cy="50" r="48" fill="url(#grad)" stroke="#fff" stroke-width="2"/>
  
  <!-- Book/Graduation cap icon -->
  <g fill="#fff">
    <!-- Graduation cap base -->
    <path d="M50 25 L20 38 L50 51 L80 38 Z" opacity="0.9"/>
    
    <!-- Cap top -->
    <rect x="47" y="38" width="6" height="22" rx="1"/>
    
    <!-- Tassel -->
    <circle cx="50" cy="62" r="4"/>
    <line x1="50" y1="62" x2="65" y2="55" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    
    <!-- Book pages (subtle) -->
    <path d="M30 42 L45 48 L45 55 L30 49 Z" opacity="0.3"/>
    <path d="M70 42 L55 48 L55 55 L70 49 Z" opacity="0.3"/>
  </g>
  
  <!-- Text "GHS" at bottom -->
  <text x="50" y="85" 
        font-family="Arial, sans-serif" 
        font-size="14" 
        font-weight="bold" 
        fill="#fff" 
        text-anchor="middle">
    GHS
  </text>
</svg>`;

// Alternative: Letter-based favicon (simpler)
export const FAVICON_LETTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="letterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0086FF"/>
      <stop offset="100%" style="stop-color:#0646A8"/>
    </linearGradient>
  </defs>
  
  <!-- Rounded square background -->
  <rect x="5" y="5" width="90" height="90" rx="18" ry="18" fill="url(#letterGrad)"/>
  
  <!-- Letter G -->
  <text x="50" y="68" 
        font-family="Georgia, serif" 
        font-size="60" 
        font-weight="bold" 
        fill="#fff" 
        text-anchor="middle">
    G
  </text>
</svg>`;

// ─── HTML Meta Tags for Favicon ────────────────────────────────────

export const FAVICON_META_TAGS = `
<!-- Favicons - Add these in <head> section -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

<!-- Android Chrome -->
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#0086FF" />

<!-- Microsoft Tiles -->
<meta name="msapplication-TileColor" content="#0086FF" />
<meta name="msapplication-config" content="/browserconfig.xml" />
`;

// ─── manifest.json Updates ─────────────────────────────────────────

export const MANIFEST_ICONS = `
{
  "icons": [
    {
      "src": "/favicon-16.png",
      "sizes": "16x16",
      "type": "image/png"
    },
    {
      "src": "/favicon-32.png",
      "sizes": "32x32",
      "type": "image/png"
    },
    {
      "src": "/favicon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/favicon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
`;

// ─── Quick Start Script ────────────────────────────────────────────

/*
 * Copy this script to generate favicons quickly:
 

#!/bin/bash
# save_favicons.sh - Run this in your project root/public/ directory

# Create SVG favicon
cat > favicon.svg << 'EOF'
${FAVICON_SVG}
EOF

echo "✅ SVG favicon created!"

# If you have ImageMagick installed, generate PNGs:
# if command -v convert &> /dev/null; then
#   convert -background none favicon.svg -resize 16x16 favicon-16.png
#   convert -background none favicon.svg -resize 32x32 favicon-32.png
#   convert -background none favicon.svg -resize 192x192 favicon-192.png
#   convert -background none favicon.svg -resize 180x180 apple-touch-icon.png
#   echo "✅ PNG favicons generated!"
# else
#   echo "⚠️ ImageMagick not found. Use online generator:"
#   echo "   https://realfavicongenerator.net/"
# fi

*/

// ─── React Component for Dynamic Favicon ──────────────────────────

import { useEffect } from 'react';

/**
 * Hook to dynamically update favicon (useful for notifications, etc.)
 */
export function useFavicon(iconUrl: string): void {
  useEffect(() => {
    const link: HTMLLinkElement = document.querySelector("link[rel*='icon']") || 
                           document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    link.href = iconUrl;
    
    document.getElementsByTagName('head')[0].appendChild(link);
  }, [iconUrl]);
}

/**
 * Component to show notification badge on favicon
 */
export const FaviconBadge: React.FC<{ count: number }> = ({ count }) => {
  useEffect(() => {
    if (count > 0) {
      // Create canvas with badge
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Draw original favicon (would need to load it first)
        // For now, just draw badge background
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(24, 8, 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw count
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(count > 99 ? '99+' : String(count), 24, 8);
        
        // Update favicon
        const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
        if (link) {
          link.href = canvas.toDataURL();
        }
      }
    }
  }, [count]);

  return null;
};

export default {
  FAVICON_SVG,
  FAVICON_LETTER_SVG,
  FAVICON_META_TAGS,
  MANIFEST_ICONS,
  useFavicon,
  FaviconBadge,
};
