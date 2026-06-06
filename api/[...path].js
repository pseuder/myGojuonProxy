const CSR_ORIGIN = 'https://my-gojuon.vercel.app'; // 你的原 CSR 網域
const API_BASE = 'https://pseuder.com/srv_mygojuon3/get_song';

const BOT_RE = /googlebot|bingbot|yandex|baiduspider|duckduckbot|facebookexternalhit|twitterbot|slackbot|linkedinbot|telegrambot|whatsapp|discordbot|applebot/i;

// 靜態資源副檔名:這些直接導回原網域,不經過 proxy 邏輯
const ASSET_RE = /\.(js|mjs|css|map|json|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|eot|mp4|webm|txt|xml)$/i;

function esc(s = '') {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
    const ua = req.headers['user-agent'] || '';
    const isBot = BOT_RE.test(ua);

    const segments = req.query.path || [];
    const reqPath = '/' + (Array.isArray(segments) ? segments.join('/') : segments);
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';

    // ── 靜態資源:一律 308 導回原網域,讓原網域服務(MIME 才正確) ──
    if (ASSET_RE.test(reqPath)) {
        return res.redirect(308, CSR_ORIGIN + reqPath + qs);
    }

    // ── 影片頁 + 爬蟲:組完整 HTML ──
    const m = reqPath.match(/^\/SongPractice\/([^/?#]+)/);
    const songId = m ? m[1] : null;

    if (isBot && songId) {
        try {
            const data = await fetch(`${API_BASE}/${encodeURIComponent(songId)}`).then(r => r.json());

            // ↓↓↓ 對照實際 JSON 改這三個 key ↓↓↓
            const title = data.title || data.name || '';
            const artist = data.singer || data.artist || '';
            const lyrics = data.lyrics || data.lyric || '';
            // ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑

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
            // API 掛了就退回 proxy 原頁面
        }
    }

    // ── 其他所有情況(真人、或非影片頁的爬蟲):proxy 原網域的 HTML ──
    try {
        const upstream = await fetch(CSR_ORIGIN + reqPath + qs, {
            headers: { 'user-agent': ua, accept: req.headers['accept'] || 'text/html' },
        });
        const ct = upstream.headers.get('content-type') || 'text/html; charset=utf-8';
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.status(upstream.status);
        res.setHeader('content-type', ct);
        return res.send(buf);
    } catch (e) {
        return res.redirect(307, CSR_ORIGIN + reqPath + qs);
    }
}