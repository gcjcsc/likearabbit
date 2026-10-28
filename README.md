# likearabbit

Herd and pedigree records for MCF Rabbitry's Rex rabbits.

- **Herd**: every rabbit you own, split into bucks and does, with age, color and parents. Litters due soon show at the top.
- **Rabbit pages**: details, a four-generation pedigree tree, offspring and litters. Ancestors that appear more than once are marked (×2), and the inbreeding coefficient (COI) is worked out from every ancestor on record. Click an empty box in the tree to add a missing sire or dam.
- **Print pedigree**: a standard landscape, letter-size pedigree with a signature line.
- **Litters**: record a breeding and the due date (31 days) is shown. Then fill in kindling and kit counts, and "Add kits to the herd" creates each kit with its sire, dam and birth date already set.
- **Plan a pairing**: pick a buck and a doe to see the kits' pedigree and COI before you breed.
- **Backup**: ⋯ → Download a backup saves everything as a JSON file.
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
- `public/sw.js`: the offline copy; `public/manifest.webmanifest` and `public/icons/`: the home-screen app (the PNGs are made from `icon.svg` by `node tools/make-icons.cjs`)

## Set up on Cloudflare (once)

```bash
npm install
```

```bash
npx wrangler d1 create likearabbit
```

Copy the `database_id` it prints into `wrangler.jsonc`, then:

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
