const CSR_ORIGIN = 'https://my-gojuon.vercel.app';
const API_BASE = 'https://pseuder.com/srv_mygojuon3/get_song';

const BOT_RE = /googlebot|bingbot|yandex|baiduspider|duckduckbot|facebookexternalhit|twitterbot|slackbot|linkedinbot|telegrambot|whatsapp|discordbot|applebot/i;

function esc(s = '') {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
    const ua = req.headers['user-agent'] || '';
    const isBot = BOT_RE.test(ua);

    // 直接用 req.url,它包含完整 path + query,例如 /SongPractice/xxx?artist_id=2
    const fullUrl = req.url || '/';
    const [reqPath, search] = fullUrl.split('?');
    const qs = search ? '?' + search : '';

    const m = reqPath.match(/^\/SongPractice\/([^/?#]+)/);
    const songId = m ? m[1] : null;

    // 爬蟲 + 影片頁:組完整 HTML
    if (isBot && songId) {
        try {
            const data = await fetch(`${API_BASE}/${encodeURIComponent(songId)}`).then(r => r.json());

            const title = data.title || data.name || '';
            const artist = data.singer || data.artist || '';
            const lyrics = data.lyrics || data.lyric || '';

            const canonical = `${CSR_ORIGIN}/SongPractice/${encodeURIComponent(songId)}${qs}`;
            const desc = `${artist} - ${title} 歌詞 ${String(lyrics).slice(0, 120).replace(/\s+/g, ' ')}`;

            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.setHeader('cache-control', 's-maxage=3600, stale-while-revalidate=86400');
            return res.send(`<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} - ${esc(artist)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="music.song">
<meta property="og:title" content="${esc(title)} - ${esc(artist)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">
${JSON.stringify({
                '@context': 'https://schema.org',
                '@type': 'MusicRecording',
                name: title,
                byArtist: { '@type': 'MusicGroup', name: artist },
                lyrics: { '@type': 'CreativeWork', text: lyrics },
            })}
</script>
</head>
<body>
<h1>${esc(title)}</h1>
<h2>${esc(artist)}</h2>
<pre>${esc(lyrics)}</pre>
</body>
</html>`);
        } catch (e) {
            // 失敗就往下導回原網域
        }
    }

    // 其他全部:308 導回原網域(真人、爬蟲非影片頁、API 失敗)
    return res.redirect(308, CSR_ORIGIN + reqPath + qs);
}