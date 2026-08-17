# Books to Scrape — Polite Scraper

A small, polite scraping pipeline that downloads the first three catalogue pages of [Books to Scrape](https://books.toscrape.com), visits all 60 book pages, and turns the raw HTML into clean, schema-validated JSON — without crashing on a broken page, and with an honest report at the end of every run.

Built as part of the FlyRank AI Backend Engineering track — Week 5, Assignment A9.

## Target classification

- **Site:** Books to Scrape (books.toscrape.com)
- **Why:** This is an official practice sandbox, built and published specifically so people can learn and practise web scraping on it — confirmed by reading toscrape.com.
- **Scope:** First 3 catalogue pages only (~60 books). This scraper does not go beyond page 3.
- **Data collected:** Book title, price, availability, star rating, and description — all public, non-personal information already shown to any visitor.
- **robots.txt result:** [tomar actual result ta ekhane likho — jemon "No robots.txt file found at books.toscrape.com/robots.txt" othoba file-e ja lekha silo]

I will not reuse this code on another site without checking its rules and terms first.

## How to run

```bash
cd scraper
npm install
node src/index.js
```

That's it — one command runs the entire pipeline: discover → fetch → extract → clean → validate → store → report. Output lands in `output/books.json`, `output/errors.json`, and `output/run-report.json`.

Re-running the script is safe — cached pages are read from disk instead of being re-fetched, and `books.json` always ends up with exactly 60 unique records, never duplicates.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20+ |
| HTTP requests | Built-in `fetch` |
| HTML parsing | Cheerio |
| Schema validation | Zod |
| Output | Built-in `fs` → JSON files |

## Record schema

Each validated record in `output/books.json` looks like this:

```json
{
  "title": "A Light in the Attic",
  "product_url": "https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html",
  "price_gbp": 51.77,
  "price_text": "£51.77",
  "availability_text": "In stock (22 available)",
  "rating_text": "Three",
  "description": "It's hard to imagine a world without A Light in the Attic. ...",
  "source_page": "https://books.toscrape.com/catalogue/page-1.html",
  "fetched_at": "2026-08-17T05:03:52.165Z"
}
```

- `price_gbp` is a real number, parsed from `price_text`, so it can be sorted and compared.
- `product_url` is each record's canonical identity — if the same book appeared twice, it counts once.
- `source_page` and `fetched_at` are provenance — where and when the fact was collected.
- `description` is `null` when a book has no description on the page — never invented.

Records that fail schema validation are written to `output/errors.json` with a reason, and never appear in `books.json`.

## Politeness rules followed

- **User-Agent:** every real request identifies this scraper (`FlyRankInternshipA9/1.0`) with a link back to this repo.
- **Timeout:** every request gives up after 8 seconds rather than hanging forever.
- **Delay:** at least 500ms between real requests to the site. Cached pages need no delay — they never leave this computer.
- **Cache:** every fetched page is saved to `cache/` and read from there on subsequent runs, so the site is only asked once per page during development.
- **Retry rules:** a timeout or server error (5xx) is retried once; a 404 or 403 is never retried, since asking again won't change the answer.

## Surviving failures

Each book page is handled independently. If one page is broken, missing, or times out, it's logged with a reason and skipped — the other 59 records still make it into `books.json`. This was tested by deliberately adding one fake book URL to the list and confirming the run still finished with 60 good records and `failed_pages: 1` in the report.

## Sample run report

A real `output/run-report.json` from an actual run:

```json
{
  "start_time": "2026-08-17T05:03:52.165Z",
  "duration_ms": 218,
  "pages_fetched": 0,
  "cache_hits": 63,
  "valid_records": 60,
  "invalid_records": 0,
  "failed_pages": 0,
  "failed_page_details": []
}
```

(`pages_fetched: 0` here because this run read entirely from cache — an earlier run had already fetched and cached all 63 pages.)

## Why this assignment needed no browser

All the data this scraper collects — title, price, availability, rating, description — is already present in the plain HTML the server sends back. A browser (e.g. via Playwright) would only add startup cost and memory overhead here, with no extra data to show for it. A browser becomes necessary only when a site builds its content with JavaScript *after* the page loads, which Books to Scrape does not do.

## Ethics note

This scraper only touches a site explicitly built for scraping practice. In general: prefer an official API when one exists rather than scraping; never bypass a login, paywall, or an explicit block; collect only the data actually needed for the task; and always identify the scraper honestly instead of pretending to be a browser or a human.

## Mistakes made & how they were fixed

**1. Cache filename collision**
Every book's URL ends in `/index.html`, so the first cache-key implementation produced the same filename (`cache/index.html`) for all 60 books — the first book fetched was silently reused as the "cached" version of every other book. Fixed by building the cache filename from the last two path segments of the URL (e.g. `a-light-in-the-attic_1000__index.html`), making every book's cache file unique.

**2. Regex typo turned every character into its own "word"**
`availability_text` came out as `" I n  s t o c k  ( 2 2  a v a i l a b l e ) "` — a space inserted between every single character. The cause was `.replace(/\s*/g, ' ')` instead of `.replace(/\s+/g, ' ')`. `\s*` matches *zero or more* whitespace characters, which means it also matches the empty string between every pair of characters — inserting a space everywhere. `\s+` (one or more) only matches actual whitespace. Fixed by changing `*` to `+`.

**3. Scraper didn't stop at 3 pages**
An early version followed the "Next" link with no page limit and pulled in all ~50 catalogue pages (1000 books) instead of the required 3. Fixed by adding a `MAX_PAGES = 3` check to the discovery loop.

## Key takeaways

- **Untrusted input must be checked, not trusted.** Every scraped field goes through Zod validation before it's allowed into `books.json` — a scraper that stores whatever it finds will eventually store garbage.
- **Politeness is a design constraint, not an afterthought.** User-agent, delay, timeout, and cache aren't optional extras — they're what separates a scraper from a denial-of-service attack.
- **A pipeline should survive its own failures.** One broken page is expected, not exceptional — the run-report exists so failures are visible instead of silent.
- **Idempotency matters.** Running the same job twice should never double the data — `books.json` holds exactly 60 records every time, by re-writing the file rather than appending to it.