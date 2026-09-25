const url = "https://www.instagram.com/reel/C2Q_1H9v9t0/";

async function test() {
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
    }
  });
  const text = await r.text();
  const ogTitleMatch = text.match(/<meta property="og:title" content="([^"]+)"/);
  const ogImageMatch = text.match(/<meta property="og:image" content="([^"]+)"/);
  console.log("Title:", ogTitleMatch ? ogTitleMatch[1] : null);
  console.log("Image:", ogImageMatch ? ogImageMatch[1] : null);
}

test();
