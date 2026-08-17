import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { z } from 'zod';

const START_URL = 'https://books.toscrape.com/catalogue/page-1.html';
const USER_AGENT = 'FlyRankInternshipA9/1.0 (+https://github.com/nayan-mia-09/flyrank-scraper)';
const DELAY_MS = 500;
const MAX_PAGES = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cachePathForUrl(url) {
  const { pathname } = new URL(url);
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

// Stage 2: discover book links across the first 3 catalogue pages
async function discoverAllBookLinks() {
  const seen = new Set();
  const bookEntries = []; // { url, sourcePage }
  let currentUrl = START_URL;
  let pageCount = 0;

  while (currentUrl && pageCount < MAX_PAGES) {
    const html = await fetchWithCache(currentUrl);
    const $ = cheerio.load(html);

    $('article.product_pod h3 a').each((_, el) => {
      const href = $(el).attr('href');
      const absoluteUrl = new URL(href, currentUrl).href;
      if (!seen.has(absoluteUrl)) {
        seen.add(absoluteUrl);
        bookEntries.push({ url: absoluteUrl, sourcePage: currentUrl });
      }
    });

    pageCount++;

    const nextHref = $('li.next a').attr('href');
    currentUrl = (nextHref && pageCount < MAX_PAGES) ? new URL(nextHref, currentUrl).href : null;
  }

  return { pageCount, bookEntries };
}

// Stage 3: visit one book page and extract the raw record
async function extractBookRecord(bookUrl, sourcePage) {
  const html = await fetchWithCache(bookUrl);
  const $ = cheerio.load(html);

  const main = $('div.product_main');

  const title = main.find('h1').text().trim();
  const priceText = main.find('p.price_color').text().trim();
  const availabilityText = main.find('p.availability').text().trim().replace(/\s+/g, ' ');

  const ratingClasses = main.find('p.star-rating').attr('class') || '';
  const ratingText = ratingClasses.replace('star-rating', '').trim() || null;

  const descriptionEl = $('#product_description').next('p');
  const description = descriptionEl.length ? descriptionEl.text().trim() : null;

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

// Stage 4: normalize, validate, and split into valid/error records
const BookRecordSchema = z.object({
  title: z.string().min(1),
  product_url: z.string().url(),
  price_gbp: z.number().positive(),
  price_text: z.string(),
  availability_text: z.string(),
  rating_text: z.string().nullable(),
  description: z.string().nullable(),
  source_page: z.string().url(),
  fetched_at: z.string()
});

function parsePriceToNumber(priceText) {
  const cleaned = priceText.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned);
}

function normalizeAndValidate(rawRecords) {
  const validRecords = [];
  const errors = [];
  const seenUrls = new Set();

  for (const raw of rawRecords) {
    if (seenUrls.has(raw.product_url)) {
      continue;
    }
    seenUrls.add(raw.product_url);

    const normalized = {
      title: raw.title,
      product_url: raw.product_url,
      price_gbp: parsePriceToNumber(raw.price_text),
      price_text: raw.price_text,
      availability_text: raw.availability_text,
      rating_text: raw.rating_text,
      description: raw.description,
      source_page: raw.source_page,
      fetched_at: raw.fetched_at
    };

    const result = BookRecordSchema.safeParse(normalized);

    if (result.success) {
      validRecords.push(result.data);
    } else {
      errors.push({
        product_url: raw.product_url,
        reason: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')
      });
    }
  }

  return { validRecords, errors };
}

async function main() {
  const { pageCount, bookEntries } = await discoverAllBookLinks();
  console.log(`catalogue_pages=${pageCount}`);
  console.log(`discovered=${bookEntries.length}`);
  console.log(`unique_urls=${bookEntries.length}`);

  const rawRecords = [];
  for (const entry of bookEntries) {
    const record = await extractBookRecord(entry.url, entry.sourcePage);
    rawRecords.push(record);
  }
  console.log(`detail_pages=${rawRecords.length}`);

  const { validRecords, errors } = normalizeAndValidate(rawRecords);

  fs.writeFileSync(
    path.join('output', 'books.json'),
    JSON.stringify(validRecords, null, 2)
  );
  fs.writeFileSync(
    path.join('output', 'errors.json'),
    JSON.stringify(errors, null, 2)
  );

  console.log(`valid_records=${validRecords.length}`);
  console.log(`invalid_records=${errors.length}`);
}

main().catch(err => console.error('Error:', err.message));