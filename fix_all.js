const fs = require('fs');

let storage = fs.readFileSync('src/lib/storage.ts', 'utf8');

const oldCat = "const { data, error } = await supabase.from('categories').select('*').order('created_at', { ascending: true });";
const newCat = "let query = supabase.from('categories').select('*').order('created_at', { ascending: true });\n        if (_currentUserId) { query = (query as any).eq('user_id', _currentUserId); }\n        const { data, error } = await query;";
storage = storage.replace(oldCat, newCat);

const oldItems = "const { data, error } = await supabase\n          .from('content_items')\n          .select('*')\n          .order('priority_score', { ascending: false });";
const newItems = "let query = supabase\n          .from('content_items')\n          .select('*')\n          .order('priority_score', { ascending: false });\n        if (_currentUserId) { query = (query as any).eq('user_id', _currentUserId); }\n        const { data, error } = await query;";
storage = storage.replace(oldItems, newItems);

const oldItemsR = "const { data, error } = await supabase\r\n          .from('content_items')\r\n          .select('*')\r\n          .order('priority_score', { ascending: false });";
const newItemsR = "let query = supabase\r\n          .from('content_items')\r\n          .select('*')\r\n          .order('priority_score', { ascending: false });\r\n        if (_currentUserId) { query = (query as any).eq('user_id', _currentUserId); }\r\n        const { data, error } = await query;";
storage = storage.replace(oldItemsR, newItemsR);

fs.writeFileSync('src/lib/storage.ts', storage);

let card = fs.readFileSync('src/components/cards/PortraitReelCard.tsx', 'utf8');
card = card.replace("loading=\"lazy\"\n            />", "loading=\"lazy\"\n              onError={(e) => { (e.currentTarget as any).style.display = 'none'; }}\n            />");
card = card.replace("loading=\"lazy\"\r\n            />", "loading=\"lazy\"\r\n              onError={(e) => { (e.currentTarget as any).style.display = 'none'; }}\r\n            />");
fs.writeFileSync('src/components/cards/PortraitReelCard.tsx', card);

let modal = fs.readFileSync('src/components/modals/ReelsDeckModal.tsx', 'utf8');
const css = `
      <style>{\`
        .reel-slide-up { animation: slideUp 0.3s ease-out forwards; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        .ig-wrapper { overflow: hidden; position: relative; width: 100%; height: 100%; }
        .ig-wrapper iframe { position: absolute; top: -55px; bottom: -55px; height: calc(100% + 110px); width: 100%; pointer-events: auto; }
      \`}</style>
`;
if (!modal.includes("ig-wrapper")) {
    modal = modal.replace("return (", css + "\n  return (");
}

modal = modal.replace(
    "className=\"relative h-full max-h-[82vh] aspect-[9/16] bg-black rounded-3xl border-2 border-slate-800/80 shadow-2xl shadow-black overflow-hidden shrink-0 select-none\"",
    "key={currentIndex} className=\"relative h-full max-h-[82vh] aspect-[9/16] bg-black rounded-3xl border-2 border-slate-800/80 shadow-2xl shadow-black overflow-hidden shrink-0 select-none reel-slide-up\""
);

modal = modal.replace(
    "if (idx > 0 && parts[idx]) return `https://www.instagram.com/p/${parts[idx]}/embed/`;",
    "if (idx > 0 && parts[idx]) return `https://www.instagram.com/p/${parts[idx]}/embed/?hidecaption=true`;"
);

const ig_render = `
      if (embedUrl) {
        if (embedUrl.includes('instagram.com')) {
          return (
            <div className="ig-wrapper">
              <iframe
                key={\`\${activeItem.id}-\${isMuted}\`}
                src={embedUrl}
                title={activeItem.title}
                className="w-full h-full border-0 scale-[1.02]"
                allowFullScreen
                scrolling="no"
              />
            </div>
          );
        }
        return (
`;
modal = modal.replace("if (embedUrl) {\n      return (", ig_render);
modal = modal.replace("if (embedUrl) {\r\n      return (", ig_render);
modal = modal.replace("if (embedUrl) {\n        return (", ig_render);
modal = modal.replace("if (embedUrl) {\r\n        return (", ig_render);

fs.writeFileSync('src/components/modals/ReelsDeckModal.tsx', modal);
console.log("Fixes applied successfully!");
