const fs = require('fs');

// 1. Fix PortraitReelCard.tsx
let c = fs.readFileSync('src/components/cards/PortraitReelCard.tsx', 'utf8');

const imgBlockStart = c.indexOf('{item.thumbnail_url ? (');
const gradientStart = c.indexOf('{/* Gradient Overlay for Text Readability */}');

if (imgBlockStart !== -1 && gradientStart !== -1) {
    const newBlock = `
          {/* Always render fallback underneath */}
          <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-slate-900 via-slate-950 to-indigo-950/50 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-3">
              {getPlatformIcon(item.platform)}
            </div>
            <p className="text-xs text-slate-400 font-medium">{item.platform} Reel</p>
          </div>

          {/* Render image on top, hide if errors */}
          {item.thumbnail_url && (
            <img
              src={item.thumbnail_url}
              alt={item.title}
              className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 ease-out group-hover/media:scale-105 z-10"
              loading="lazy"
              onError={(e) => { (e.currentTarget as any).style.display = 'none'; }}
            />
          )}

`;
    c = c.substring(0, imgBlockStart) + newBlock + c.substring(gradientStart);
    fs.writeFileSync('src/components/cards/PortraitReelCard.tsx', c);
    console.log('PortraitReelCard.tsx updated.');
} else {
    console.log('Could not find markers in PortraitReelCard.tsx');
}

// 2. Fix ReelsDeckModal.tsx - remove buttons
let m = fs.readFileSync('src/components/modals/ReelsDeckModal.tsx', 'utf8');
const regex = /\{\/\* Swipe up\/down arrow hints.*?(?=\s*<\/div>\s*\{\/\* Slide-up Notes Panel)/s;
if (regex.test(m)) {
    m = m.replace(regex, '');
    fs.writeFileSync('src/components/modals/ReelsDeckModal.tsx', m);
    console.log('ReelsDeckModal.tsx buttons removed.');
} else {
    console.log('Could not find buttons to remove in ReelsDeckModal.tsx');
}
