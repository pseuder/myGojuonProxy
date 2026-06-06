const CSR_ORIGIN = 'https://my-gojuon.vercel.app/'; // ← 改成你原本的 CSR 網域
const API_BASE = 'https://pseuder.com/srv_mygojuon3/get_song';

const BOT_RE = /googlebot|bingbot|yandex|baiduspider|duckduckbot|facebookexternalhit|twitterbot|slackbot|linkedinbot|telegrambot|whatsapp|discordbot|applebot/i;

// 防 XSS:注入 HTML 前先 escape
function esc(s = '') {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
    const ua = req.headers['user-agent'] || '';
    const isBot = BOT_RE.test(ua);
    const segments = req.query.path || [];
    const reqPath = '/' + (Array.isArray(segments) ? segments.join('/') : segments);

    // ── 真人:proxy 回傳原 CSR 頁面(網址不變) ──
    if (!isBot) {
        try {
            const target = CSR_ORIGIN + reqPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
            const upstream = await fetch(target, {
                headers: { 'user-agent': ua, 'accept': req.headers['accept'] || '*/*' },
            });
            const body = await upstream.arrayBuffer();
            res.status(upstream.status);
            const ct = upstream.headers.get('content-type');
            if (ct) res.setHeader('content-type', ct);
            const cc = upstream.headers.get('cache-control');
            if (cc) res.setHeader('cache-control', cc);
            return res.send(Buffer.from(body));
        } catch (e) {
            // proxy 掛了就退回 redirect,至少不會白屏
            return res.redirect(307, CSR_ORIGIN + reqPath);
        }
    }

    // ── 爬蟲:只對影片頁組完整 HTML,其他頁照樣 proxy ──
    const m = reqPath.match(/^\/SongPractice\/([^/?#]+)/);
    if (!m) {
        // 非影片頁的爬蟲流量,一樣 proxy 原頁面
        const upstream = await fetch(CSR_ORIGIN + reqPath);
        const html = await upstream.text();
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.send(html);
    }

    const id = m[1];
    try {
        const data = await fetch(`${API_BASE}/${encodeURIComponent(id)}`).then(r => r.json());

        // ↓↓↓ 對照你實際 JSON 改這三個 key ↓↓↓
        const title = data.title || data.name || '';
        const artist = data.singer || data.artist || '';
        const lyrics = data.lyrics || data.lyric || '';
        // ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

        const canonical = `${CSR_ORIGIN}/SongPractice/${encodeURIComponent(id)}`;
        const desc = `${artist} - ${title} 歌詞 ${lyrics.slice(0, 120).replace(/\s+/g, ' ')}`;

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
        // API 掛了就退回 proxy 原頁面,別給爬蟲 500
        const upstream = await fetch(CSR_ORIGIN + reqPath);
        const html = await upstream.text();
        res.setHeader('content-type', 'text/html; charset=utf-8');
        return res.send(html);
    }
}