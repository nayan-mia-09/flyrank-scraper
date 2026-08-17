import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

const START_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const USER_AGENT = 'FlyRankInternshipA9/1.0 (+https://github.com/nayan-mia-09/flyrank-scraper)';
const DELAY_MS = 500;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cachePathForUrl(url) {
  const fileName = url.split('/').filter(Boolean).pop();
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

async function discoverAllBookLinks() {
  const allLinks = new Set();
  let currentUrl = START_URL;
  let pageCount = 0;
  const MAX_PAGES = 3;

  while (currentUrl && pageCount < MAX_PAGES) {
    const html = await fetchWithCache(currentUrl);
    const $ = cheerio.load(html);

    $('article.product_pod h3 a').each((_, el) => {
      const href = $(el).attr('href');
      const absoluteUrl = new URL(href, currentUrl).href;
      allLinks.add(absoluteUrl);
    });

    pageCount++;

    const nextHref = $('li.next a').attr('href');
    currentUrl = (nextHref && pageCount < MAX_PAGES) ? new URL(nextHref, currentUrl).href : null;
  }

  return { pageCount, links: Array.from(allLinks) };
}

async function main() {
  const { pageCount, links } = await discoverAllBookLinks();
  console.log(`catalogue_pages=${pageCount}`);
  console.log(`discovered=${links.length}`);
  console.log(`unique_urls=${links.length}`);
}

main().catch(err => console.error('Error:', err.message));