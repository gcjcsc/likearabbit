# likearabbit

Herd and pedigree records for MCF Rabbitry's Rex rabbits.

- **Herd**: every rabbit you own, split into bucks and does (sorted by name or by cage), with age, color, parents, cage, and badges for rabbits for sale or in a medication withdrawal period. **Coming up** at the top lists litter jobs and withdrawal periods ending, with a Done button.
- **Rabbit pages**: details (including ear # and tattoo), a four-generation pedigree tree, offspring and litters. Ancestors that appear more than once are marked (×2), and the inbreeding coefficient (COI) is worked out from every ancestor on record. Click an empty box in the tree to add a missing sire or dam.
- **Photos**: add any number of photos to a rabbit, older ones too. The date is read from each photo where possible (and shown with the rabbit's age at the time), and can be changed along with a caption. One is the main photo: it shows on the rabbit's page, its herd card and its pedigree PDF. A scanned pedigree can be kept as a photo too.
- **Share pedigree PDF**: makes a one-page, landscape, letter-size pedigree PDF with a signature line. On an iPhone it opens the share sheet, so you can send it by text, email or AirDrop, save it to Files, or print it. On a computer it downloads.
- **Retire**: when a rabbit is sold, given away, dies or is culled, record the date (plus the buyer and price for a sale). They leave the herd lists and breeding pickers but keep their pedigree, and they appear under **Past rabbits** at the bottom of the herd page. Return to the herd undoes it.
- **Scan a pedigree**: take a photo of a paper pedigree (or pick one from your photos) and Cloudflare's Workers AI (the Qwen 3.8 27B vision model) reads it into the rabbit and its 14 ancestors. You check and fix each one before saving; ancestors already on file are matched by ear number or name so they aren't added twice, and new ones are linked into the tree.
- **Weights**: log weights over time per rabbit, charted; the newest becomes the rabbit's weight on its pedigree. A litter's page has a quick form to weigh every kit at once.
- **Health**: treatments, vaccinations, vet visits and illnesses, with meat withdrawal periods. A rabbit in withdrawal is flagged everywhere, including when retiring it as culled.
- **Shows**: show results, with "Earned a leg" ticked automatically for 1st place with 3+ exhibitors and 5+ rabbits. Legs are counted onto the rabbit, and it's flagged when it has 3 legs and no grand champion number.
- **Cages**: each rabbit's cage or hutch.
- **For sale**: list a rabbit with a price and a note, and it appears on the public sale page at `/sale` (no password) with its photos, contact buttons and a pedigree PDF. Retiring a rabbit takes it off.
- **Sold to a buyer**: a sold rabbit's page has "Send pedigree to the buyer", and its PDF notes who it was sold to and when.
- **Reminders**: each litter has a checklist (palpate day 14, nest box day 28, due day 31, tattoo week 6, wean week 8). Turn on phone notifications in Settings to get each morning's jobs as a notification (on iPhone, from the home-screen app).
- **Backups**: a backup of all records is saved every Sunday (the newest 12 are kept, under Settings), and can be emailed (see below).
- **Litters**: record a breeding and the due date (31 days) is shown. Then fill in kindling and kit counts, and "Add kits to the herd" creates each kit with its sire, dam and birth date already set.
- **Plan a pairing**: pick a buck and a doe to see the kits' pedigree and COI before you breed.
- **Backup**: ⋯ → Download a backup saves all records (including photo dates and captions) as a JSON file. The photo files themselves aren't in it.
- **On your phone**: it installs as a home-screen app with its own icon that opens full screen. With no signal, the herd still opens, as of the last time it loaded, but changes need a connection.

## Put it on your iPhone

1. Open the app's address in **Safari** and sign in.
2. Tap the Share button, then **Add to Home Screen**, then **Add**.
3. Open it from the new MCF Rabbits icon and sign in once more. The home-screen app keeps its own sign-in, separate from Safari's.

On Android, open it in Chrome and choose **Install app** from the ⋮ menu.

The starting herd comes from the paper pedigrees: Blue Doe (SARF2), Tri Doe (SATF1), WalkingTree's Abyss (WT71), WalkingTree's Dante (WT18), 6AF's 6AF2, Jax's Ruger Blackhawk (JAXB34), KA1901 and FBC2. Their 79 known ancestors are also included.

## How it's built

It's a Cloudflare Worker (`src/worker.js`) with a D1 database. The app itself is plain HTML, CSS and JavaScript in `public/`. One shared password, set as the `APP_PASSWORD` secret, protects everything. A sign-in lasts 60 days, and changing the password signs everyone out.

- `migrations/0001_init.sql`: the tables
- `migrations/0002_seed.sql`: the starting herd, generated from `tools/seed-data.mjs` by `npm run seed`
- `src/push.js`: phone notifications (Web Push, with keys made on first use); `src/daily.js`: the daily job (reminders, Sunday backups); `src/sale.js` and `public/sale.html`: the public sale page; `public/reminders.js`: reminder rules shared by the app and the daily job
- `src/scan.js`: sends a pedigree photo to Workers AI and tidies what comes back (the `AI` binding in `wrangler.jsonc`)
- `src/photos.js`, `public/photos.js`: photo upload and viewing. Photo details are in the main database; the image files are in a second free D1 database, `likearabbit-photos` (binding `PHOTOS`, migrations in `migrations-photos/`), so the herd database stays small
- `public/pedigree-pdf.js`: draws the pedigree PDF with jsPDF (`public/vendor/`, MIT license)
- `public/sw.js`: the offline copy; `public/manifest.webmanifest` and `public/icons/`: the home-screen app (the PNGs are made from `icon.svg` by `node tools/make-icons.cjs`)

## Set up on Cloudflare (once)

```bash
npm install
```

The `likearabbit` D1 database already exists on the Cloudflare account and its id is in `wrangler.jsonc`. Set the sign-in password, then deploy:

```bash
npx wrangler secret put APP_PASSWORD
```

```bash
npm run deploy
```

`npm run deploy` creates the tables and loads the starting herd (the first time only), then publishes the app. Later changes go out with the same command. If you deploy through Cloudflare's GitHub integration (Workers Builds) instead, set its deploy command to `npm run deploy`.

## Run it locally

```bash
cp .dev.vars.example .dev.vars
```

```bash
npm run dev
```

Then open http://localhost:8787 and sign in with the password in `.dev.vars`.

## Automatic deploys

Cloudflare Workers Builds deploys every change to `main`. In the Cloudflare dashboard under **Workers & Pages → likearabbit → Settings → Build**:

- **Deploy command**: `npm run deploy` (applies database migrations to both databases, then deploys). Plain `npx wrangler deploy` skips the migrations.
- **Non-production branch deploy command**: `npx wrangler versions upload` (so other branches never touch the live database).
- **API token**: if builds fail instantly with no log, the token was deleted or rolled. Choose **Create new token**, save, then retry the build.

To deploy by hand instead, run `npm run deploy` from a computer.

## Emailing weekly backups (optional)

Backups are always kept under Settings. To also have them emailed, sign up at resend.com (free), create an API key, and:

```bash
npx wrangler secret put RESEND_API_KEY
```

Then set "Email weekly backups to" in Settings to the address you signed up to Resend with. Without your own domain, Resend only sends to that address.

