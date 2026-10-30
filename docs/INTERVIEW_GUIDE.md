# Interview guide — SEO Growth Agent

প্রতিটা অংশে আগে বাংলায় বোঝানো আছে, তারপর ইংরেজিতে যেভাবে বলবেন। উত্তরগুলো মুখস্থ
করবেন না। মূল কথাটা বুঝে নিজের ভাষায় বলুন।

## 60-second pitch

**বাংলায়:** এটা একটা অটোমেশন, যেটা যেকোনো অনুমোদিত ওয়েবসাইটের SEO পরীক্ষা করে।
সাইটের নিয়ম মেনে পেজ পড়ে, প্রতিটা পেজ থেকে SEO তথ্য বের করে, Google PageSpeed দিয়ে
গতি মাপে। তারপর প্রমাণসহ সমস্যার তালিকা দেয়, কোনটা আগে ঠিক করতে হবে সেই ক্রমে।

**English:**
> I built a reusable SEO audit agent in n8n, running on my own VPS. You give it a URL,
> and it checks the URL is safe and on an allowlist. It then reads robots.txt and the
> sitemap, samples pages across the site and fetches them politely. From each page it
> extracts about 48 SEO fields, adds Google PageSpeed data, and runs 25 rules that
> produce prioritized findings. Every finding shows the exact evidence and links to
> Google's documentation. Results go to Google Sheets and a weekly email that includes
> Search Console totals. The code is covered by 16 automated tests. I also built a
> demo e-commerce store as a safe test site with known issues, and the agent found
> all of them.

## Likely questions

**1. Why n8n and not just a Python script?**
বাংলায়: n8n-এ প্রতিটা ধাপ চোখে দেখা যায়, সময় ঠিক করে চালানো যায়, আর Google Sheets বা
ইমেইলের সাথে সহজে জোড়া যায়। আর যেখানে জটিল যুক্তি দরকার, সেখানে আমি নিজে কোড লিখেছি।
> n8n gives me scheduling, retries, credentials and integrations like Sheets and email
> out of the box, and each step is visible, which helps non-developers. Where the logic is
> complex (robots.txt matching, HTML parsing, the findings rules) I wrote JavaScript Code
> nodes. I keep those in separate files with unit tests.

**2. How do you make sure the data is accurate?**
> Three ways. First, everything comes from primary sources: the page HTML, robots.txt,
> the sitemap and Google's API. Second, failures are recorded, not hidden. A rate-limited
> PageSpeed call shows `RATE_LIMITED`, not a guessed score. Third, I verified the
> extraction against Python's HTML parser on 20 live pages and got zero mismatches.
> I also found and fixed one of my own bugs that way: a timestamp field was misleading.

**3. What about websites built with React or other JavaScript frameworks?**
বাংলায়: এমন সাইটে আসল লেখা পরে লোড হয়। এজেন্ট সেটা চিনে আলাদা করে রাখে আর ভুল finding
দেয় না। এটা একটা জেনেবুঝে নেওয়া সীমা, আর সমাধানও জানা আছে।
> The agent reads raw HTML, which is what a crawler sees first. If a page has very little
> text and several scripts, it's flagged as possibly JavaScript-rendered and excluded from
> content checks, so I don't report a false "missing title". The fix would be a headless
> browser step for those pages only. I left that out because it's heavier on the server.

**4. How do you avoid harming the sites you crawl?**
> An allowlist, robots.txt (including Crawl-delay), one request at a time with at least
> 1.5 seconds between requests, a page cap, and an identifying User-Agent. If robots.txt
> returns a server error, I crawl nothing, which is the rule Google follows.

**5. Security considerations?**
বাংলায়: কেউ যেন এজেন্ট দিয়ে আমার সার্ভারের ভেতরের সার্ভিসে ঢুকতে না পারে (SSRF)।
> The main risk is SSRF: someone pointing the agent at internal services on my server.
> The validator blocks localhost, internal hostnames, raw IPs, non-standard ports and
> credentials in URLs. It only allows allowlisted domains, and look-alike domains like
> `books.toscrape.com.evil.com` are rejected. API keys are stored as n8n credentials,
> never in the workflow JSON.

**6. Why sample pages instead of crawling everything?**
> Cost and politeness. A store can have thousands of URLs. I read the sitemap, group URLs
> by site section, and take them round-robin, so 20 pages cover products, categories and
> blog posts. Most SEO problems are template problems, so a balanced sample finds them.
> The page cap is configurable.

**7. How is priority decided?**
> Severity first (High, Medium, Low, Info), then the share of pages affected. For example,
> duplicate content is High because Google may index the wrong URL. A missing Open Graph
> image is Low because it affects social previews, not rankings. The health score is my
> own formula, and the report says so, so nobody mistakes it for a Google metric.

**8. What was the hardest bug?**
> The n8n Code sandbox doesn't provide JavaScript's `URL` class. My first validator
> rejected every URL. My tests showed 13 out of 13 failing for the same reason, so I
> found it quickly. I rewrote it with a strict parser and added it to the test suite.

**9. What would you improve next?**
> Use Search Console clicks and impressions to rank findings by real traffic once the site
> has search data, add an AI summary that only rewrites the evidence and never adds facts,
> and open fix pull requests directly from n8n. The AI step is off until its cost is approved.

**12. What went wrong while connecting Google?**
বাংলায়: Google-এর সাথে জোড়ার সময় তিনটা সমস্যা হয়েছিল, প্রত্যেকটা error message পড়ে ঠিক করেছি।
> Three things, each found from the exact error. The client secret was mistyped, so I created
> a new one. The Search Console API wasn't enabled in the Google Cloud project. And the n8n
> credential was signed in with a different Google account than the one that owned the
> property, so the API returned an empty site list. I added that account as a user on the
> property. I also made the email still send, with a clear note, if Search Console fails.

**10. Why build your own test store?**
> I needed a site I'm authorized to audit and change. The store has 24 products and 35
> pages, with six SEO issues placed on purpose and documented. That gives a known answer
> key: the agent found all six, plus three real issues I hadn't planted.

**11. Did every fix improve the score?**
বাংলায়: না, আর এটা লুকাইনি। গতির সংশোধনে সমস্যাটা চলে গেছে, কিন্তু score একই থেকেছে। এটা সৎভাবে লিখে রাখাটাই দেখায় যে ডেটা আসল।
> No, and I report that honestly. PageSpeed flagged render-blocking fonts with an
> estimated saving of about 2.1 s. After the fix the opportunity disappeared, but the mobile
> score stayed at 92 and LCP at 2.7 s. The estimate was an upper bound, and the rest is
> network time on GitHub Pages. I measure every change before and after instead of
> assuming the estimate came true.

## Numbers to remember

| | |
|---|---|
| Workflows | 3 (agent, error handler, weekly email) |
| Data points per page | 48 |
| Finding rules | 25+ |
| Automated tests | 16, all passing |
| Extraction cross-check | 20 pages, 0 mismatches |
| Polite delay | ≥ 1.5 s per request |
| Demo store | 24 products, 35 pages, 6 seeded issues, all 6 found |
| Before → after (live) | score 91 → 98, Medium findings 5 → 0 |
| PageSpeed (live) | mobile 92, desktop 99 |
