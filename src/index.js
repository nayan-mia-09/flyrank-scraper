import fs from 'fs';
import path from 'path';
import { clearTimeout } from 'timers';

const CATALOGUE_URL = "https://books.toscrape.com/catalogue/page-1.html";
const CACHE_PATH = path.join('cache','catalogue-page-1.html');
const USER_AGENT = 'FlyRankInternshipA9/1.0 (+https://github.com/nayan-mia-09/flyrank-scraper)';

async function fetchWithCache(url,cachePath) {
    if(fs.existsSync(cachePath)){
        const html = fs.readFileSync(cachePath, 'utf-8');
        console.log(`CACHE HIT - ${cachePath} (${html.length} bytes)`);
        return html;
    }

    const controller = new AbortController();
    const timeOut = setTimeout(()=> controller.abort(), 8000);

    const response = await fetch(url,{
        headers: {'User-Agent': USER_AGENT},
        signal: controller.signal
    });
    clearTimeout(timeOut);

    if(response.status !== 200){
        throw new Error(`Fetch failed with status ${response.status}`);
    }

    const html = await response.text();
    fs.writeFileSync(cachePath,html);
    console.log(`FETCH - ${url} (${html.length} bytes)`);
    return html;
}

async function main() {
    await fetchWithCache(CATALOGUE_URL, CACHE_PATH);
}

main().catch(err => console.log('Error:', err.message));