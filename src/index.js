import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const START_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const USER_AGENT = 'FlyRankInternshipA9/1.0 (+https://github.com/nayan-mia-09/flyrank-scraper)';
const DELAY_MS = 500;
const MAX_PAGES = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cachePathForUrl(url) {
 const {pathname} = new URL(url);
 const segments = pathname.split('/').filter(Boolean);
 const fileName = segments.slice(-2).join('__') + '.html';
 return path.join('cache', fileName);
}

async function fetchWithCache(url) {
  const cachePath = cachePathForUrl(url);

  if (fs.existsSync(cachePath)) {
    const html = fs.readFileSync(cachePath, 'utf-8');
    console.log(`CACHE HIT — ${cachePath} (${html.length} bytes)`);
    return html;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: controller.signal
  });
  clearTimeout(timeout);

  if (response.status !== 200) {
    throw new Error(`Fetch failed with status ${response.status} for ${url}`);
  }

  const html = await response.text();
  fs.writeFileSync(cachePath, html);
  console.log(`FETCH — ${url} (${html.length} bytes)`);

  await sleep(DELAY_MS);

  return html;
}
// Stage 2 : discover book links across the first 3 catalogue pages
async function discoverAllBookLinks() {
  const seen = new Set();
  const bookEntries = []; // {url,sourcepage}
  let currentUrl = START_URL;
  let pageCount = 0;

  while(currentUrl && pageCount < MAX_PAGES){
    const html = await fetchWithCache(currentUrl);
    const $ = cheerio.load(html);

    $('article.product_pod h3 a').each((_,el) =>{
        const href = $(el).attr('href');
        const absoluteUrl = new URL(href,currentUrl).href;
        if(!seen.has(absoluteUrl)){
            seen.add(absoluteUrl);
            bookEntries.push({url: absoluteUrl, sourcePage: currentUrl});
        }
    });

    pageCount++;

    const nextHref = $('li.next a').attr('href');
    currentUrl = (nextHref && pageCount < MAX_PAGES) ? new URL(nextHref,currentUrl).href : null;
  }
  return {pageCount, bookEntries};
}

// Stage 3: visit one book page and extract the raw record
async function extractBookRecord(bookUrl,sourcePage) {
    const html = await fetchWithCache(bookUrl);
    const $ = cheerio.load(html);

    const main = $('div.product_main');

    const title = main.find('h1').text().trim();
    const priceText = main.find('p.price_color').text().trim();
    const availabilityText = main.find('p.availability').text().trim().replace(/\s+/g, ' ');
    
    // raging is stored as a css class , e.g class = "star-rating Three"
    const ratingClasses = main.find('p.star-rating').attr('class') || '';
    const ratingText = ratingClasses.replace('star-rating', '').trim() || null;

    // description sits in a <p>right after the #product_description heading: not every book has one</p>

    const descriptionEl = $('#product_description').next('p');
    const description = descriptionEl.length ? descriptionEl.text().trim(): null;

    return {
        title,
        product_url: bookUrl,
        price_text: priceText,
        availability_text: availabilityText,
        rating_text: ratingText,
        description,
        source_page: sourcePage,
        fetched_at: new Date().toISOString()
    };
} 

async function main() {
  const { pageCount, bookEntries } = await discoverAllBookLinks();
  console.log(`catalogue_pages=${pageCount}`);
  console.log(`discovered=${bookEntries.length}`);
  console.log(`unique_urls=${bookEntries.length}`);

  const records = [];
  for(const entry of bookEntries){
    const record = await extractBookRecord(entry.url, entry.sourcePage);
    records.push(record);
  }

  console.log('--- Sample record ---');
  console.log(JSON.stringify(records[0],null,2));
  console.log(`detail_pages = ${records.length}`);

  fs.writeFileSync(
    path.join('output', 'raw-records.json'),
    JSON.stringify(records, null, 2)
  );
}

main().catch(err => console.error('Error:', err.message));