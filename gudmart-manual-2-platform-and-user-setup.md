# GudMart — Handover Kit
## Manual 2: Platform and User Setup

**Version:** 1.0  
**Status:** Draft for review  
**Depends on:** Manual 1 phase gate passed  
**Leads into:** Manual 3 — Operator Training Manual

---

## How to Use This Manual

This manual has one job: replace all test data with real data, create real user accounts, and confirm the system is ready for the first live market week.

**Before you start**, confirm that Manual 1 is fully complete:

- [ ] The live URL loads and shows the GudMart login screen
- [ ] Login works with the test operator account from Manual 1
- [ ] A test WhatsApp message sent during Manual 1 appeared in the intake queue

If any of those three boxes is not ticked, stop here and complete Manual 1 first.

---

### Who does what in this manual

This manual has two audiences. Each section begins with an audience callout box so you always know who is acting.

| Symbol | Audience | Who this typically is |
|---|---|---|
| 🧑‍🌾 **OPERATOR** | The person who runs the market | Non-technical — follows plain-language steps |
| 💻 **IT PERSON** | The person who set up the system | Technical — comfortable running terminal commands |

On a small team, both roles may be the same person. If so, read both callouts — you are doing both jobs.

---

### What happens in this manual

| Section | Who | What |
|---|---|---|
| 2.1 — Data Preparation | Operator | Fill in the Google Sheets data template with real customers, farmers, products, and synonyms |
| 2.2 — Data Seed | IT person | Run the seed script to load real data into the live system |
| 2.3 — User Account Creation | IT person | Create real Firebase accounts for operators and volunteers |
| 2.4 — Opening Configuration | IT person + Operator | Enter opening financial balances, confirm webhook, sign off on message templates |
| 2.5 — Phase Gate | Both | Three explicit checks. All three must pass before operator training begins |

**Do not skip ahead.** Each section has a confirmation check at the end. Complete that check before moving to the next section. If the check fails, the troubleshooting notes at the back of this manual tell you what to do.

---
---

## Section 2.1 — Data Preparation

> 🧑‍🌾 **OPERATOR TASK**  
> No technical knowledge required. You need: a computer or phone, access to WhatsApp Web (web.whatsapp.com) to scroll through past order messages, and the Google Sheets template link below.

---

This section is your work. The IT person waits while you fill in four sheets. Nothing enters the live system until you hand the completed sheets to the IT person — so take your time and get them right. Mistakes here mean the system will have wrong data and will need to be re-seeded later.

The four sheets are:

1. **Customers** — your registered customers and their current wallet balances
2. **Farmers** — your outstation and local farmers
3. **Products** — your complete product catalogue (every item you sell or might sell)
4. **Synonyms** — the different words your customers use for the same products in WhatsApp messages

---

### 2.1.1 — Open the data template

1. Open the Google Sheets template at this link:  
   **→ [INSERT TEMPLATE LINK HERE]**

2. Make a copy for yourself so you can edit it:  
   Click **File → Make a copy** → save it to your own Google Drive.  
   Do not edit the shared template directly.

3. Look at the tabs at the bottom of the sheet. You should see four tabs:  
   **Customers · Farmers · Products · Synonyms**

---

### 2.1.2 — Customers sheet

Click the **Customers** tab.

Fill in one row per customer. Every registered customer who currently orders from you should have a row.

| Column | What to enter | Example |
|---|---|---|
| A — Name | Full name, as you recognise them | Priya Rajan |
| B — Phone | WhatsApp number with country code. Must start with `+91`. No spaces, no dashes. | `+919876543210` |
| C — Active | `Yes` for all current customers | Yes |
| D — Wallet Balance (₹) | How much the customer currently has deposited with you, in whole rupees. If they haven't paid an advance, enter `0`. | 500 |

**Important notes:**

- **Phone numbers must be exact.** The system matches incoming WhatsApp order messages to customers using this number. If a customer messages you from `+919876543210` but you enter `9876543210`, their orders will not be recognised. Check your phone contacts for the exact number.
- **Wallet balances in whole rupees only.** No decimals. If a customer has paid you ₹500.50, round to ₹500 or ₹501 — your choice, but no decimal point. The system stores money internally in paise and will not accept decimals.
- **Do not carry over any test customers** from Manual 1. This sheet should contain only real customers.
- **Leave no blank rows in the middle.** If you skip a row and add another below it, the seed script may misread the data.

**Confirmation check — 2.1.2**

Count the rows you have filled in. Write the number here:

> **Total customers entered: ________**

---

### 2.1.3 — Farmers sheet

Click the **Farmers** tab.

Fill in one row per farmer — both outstation and local.

| Column | What to enter | Example |
|---|---|---|
| A — Name | Full name | Murugan Selvam |
| B — Phone | WhatsApp number, same `+91` format as customers | `+917890123456` |
| C — Village / Area | Where they are based | Gudalur |
| D — Farmer Type | Must be exactly one of: `outstation` or `local` | outstation |
| E — Active | `Yes` for all current farmers | Yes |

**How to tell outstation from local:**

- **Outstation farmers** send their produce in advance (you place an order with them earlier in the week, they deliver before market day). These are the farmers you currently message via WhatsApp to place consolidated orders.
- **Local farmers** bring produce directly to the market on market day. You record what they brought when they arrive.

If you are unsure about any farmer's type, add a note in a spare column and confirm before handing the sheet over. The seed script will fail validation if the Farmer Type column contains anything other than `outstation` or `local`.

**Confirmation check — 2.1.3**

Count your rows:

> **Outstation farmers: ________**  
> **Local farmers: ________**  
> **Total: ________**

---

### 2.1.4 — Products sheet

Click the **Products** tab.

This is your master product catalogue. List **every item you have ever sold or might sell** — not just this week's items. The catalogue persists across all weeks. You will select from it each time you build a weekly produce list.

| Column | What to enter | Example |
|---|---|---|
| A — English Name | English product name (required) | Tomato |
| B — Tamil Name | Tamil name (optional — leave blank if unsure) | தக்காளி |
| C — Default Unit | Must be exactly one of: `kg`, `piece`, `bunch`, `100g` | kg |
| D — Active | `Yes` for all current products | Yes |

**Choosing the right default unit:**

| Unit | Use for |
|---|---|
| `kg` | Tomatoes, carrots, potatoes, most vegetables sold by weight |
| `piece` | Eggs, coconuts, individual fruits |
| `bunch` | Coriander, curry leaves, spinach, greens sold in bunches |
| `100g` | Spices or small-quantity items sold in 100-gram measures |

The default unit is what the system pre-fills when you add this item to a weekly produce list. You can change it per week, so choose the unit you use most often.

**Tamil names:** Add these only if you are confident of the correct spelling as you would type it to your customers. The system uses Tamil names in the Tamil-language produce list it generates for your WhatsApp group. Incorrect Tamil names will confuse customers. If in doubt, leave the Tamil column blank for now — you can add Tamil names later through the system.

**Confirmation check — 2.1.4**

> **Total products entered: ________**

---

### 2.1.5 — Synonyms sheet

Click the **Synonyms** tab.

**Why this sheet matters:** When your customers send WhatsApp orders, they write product names in many different ways. One customer writes "tomato", another writes "thakkali", another writes "tom 1 kg". The system needs to know that all three mean the same product.

This sheet teaches the system the words and abbreviations **your specific customers** use. The system already knows a basic list of standard words (shown below). You only need to add words that are **different from the ones already in that list**.

**Pre-loaded synonyms already in the system — do not add these again:**

| What customers write | What it means |
|---|---|
| cauli, cauliflow, gobi | Cauliflower |
| tom, tomato, thakkali | Tomato |
| potato, aloo, urulai | Potato |
| carrot, gajar | Carrot |
| beans, bean, payir | Beans |
| onion, vengayam | Onion |
| kg, kilo, kilos, kilogram | kg (unit) |
| gm, gms, gram, grams, g | 100g (unit) |
| pcs, piece, pieces, nos, no, count | piece (unit) |
| bun, bund, bunch, bunches | bunch (unit) |

**Fill in the Synonyms sheet:**

| Column | What to enter |
|---|---|
| A — Raw Word | A word or abbreviation a customer has actually written in a WhatsApp order message |
| B — Maps To | The English product name from your Products sheet. Must match exactly. |

**How to find these words:**

1. Open **WhatsApp Web** on your computer: go to web.whatsapp.com and scan the QR code with your phone.
2. Open the group or individual chats where customers send their orders.
3. Scroll back through **at least 4 weeks** of order messages.
4. Every time you see a product written in an unusual way — an abbreviation, a Tamil word not in the pre-loaded list above, a local name — add it to this sheet.

**Examples of what to look for:**

> "2 kg tomato" → `tomato` is already in the pre-loaded list, skip it  
> "thakkali 1 kilo" → `thakkali` is already in the pre-loaded list, skip it  
> "keerai 1 bunch" → `keerai` means spinach or greens — add it if your Products sheet has a matching item  
> "brinjal 500g" → `brinjal` may not be in the pre-loaded list — add it if you sell brinjal  
> "kothimalli" → local Tamil word for coriander — add it  

You are capturing the **informal WhatsApp spelling**, not dictionary Tamil. Add words exactly as your customers write them.

**Confirmation check — 2.1.5**

> [ ] I have scrolled through at least 4 weeks of order messages in WhatsApp Web  
> [ ] I have added any product words my customers use that are not in the pre-loaded list above

---

### 2.1.6 — Hand over to the IT person

Your work in this section is done.

Share the completed Google Sheet with the IT person:
- In Google Sheets: click **Share** (top right) → enter their email → set to Viewer or Editor → Send.
- Or: **File → Download → Microsoft Excel (.xlsx)** and send the file directly.

Tell the IT person the sheets are ready. The IT person takes over from Section 2.2.

---
---

## Section 2.2 — Data Seed

> 💻 **IT PERSON TASK**  
> You need: terminal access to the repository, the completed data files from the operator (as CSV or as the shared Google Sheet), and the `MONGODB_URI` secret that was set in Fly.io during Manual 1.

---

This section replaces all test data in the live system with the operator's real data. The seed script is idempotent — it clears the relevant collections and reloads them from scratch. Running it twice produces the same result as running it once.

**Do not proceed until the operator has confirmed all four sheets are complete** (Sections 2.1.2 through 2.1.5). Seeding with incomplete data means re-seeding later.

---

### 2.2.1 — Prepare the data files

You need the four sheets as CSV files. If the operator shared a Google Sheet:

1. Open the sheet.
2. Click the **Customers** tab → **File → Download → Comma Separated Values (.csv)**.
3. Save the file as exactly: `customers.csv`
4. Repeat for each tab, saving as: `farmers.csv`, `products.csv`, `synonyms.csv`
5. Place all four files in the `scripts/data/` directory inside the repository:

```
your-repo/
  scripts/
    data/
      customers.csv
      farmers.csv
      products.csv
      synonyms.csv
```

---

### 2.2.2 — Run the validation script

Before touching the database, run the validation script. It checks for the most common data entry errors without making any changes to the system.

```bash
node scripts/validate-seed-data.js
```

The script checks:

- All phone numbers start with `+91` and are exactly 13 characters long
- No duplicate phone numbers within the Customers sheet
- No duplicate phone numbers within the Farmers sheet
- All `farmer_type` values are exactly `outstation` or `local` (not `Outstation`, not `LOCAL`)
- All `default_unit` values are exactly `kg`, `piece`, `bunch`, or `100g`
- All wallet balance values are non-negative whole numbers (no decimals, no negative values)
- All synonym target names in Column B of the Synonyms sheet exist in the Products sheet

**Expected output if everything is correct:**

```
Validation passed.
  Customers: 50 rows
  Farmers: 22 rows (15 outstation, 7 local)
  Products: 28 rows
  Synonyms: 18 rows
  Wallet balances: 50 rows checked, 0 errors
Ready to seed.
```

*(Your counts will differ. The format should match.)*

**If the validation fails**, the script lists every failing row and the reason. For example:

```
ERROR: customers.csv row 12 — phone "+9198765432" is only 12 characters (expected 13)
ERROR: farmers.csv row 3 — farmer_type "Outstation" must be lowercase "outstation"
ERROR: synonyms.csv row 7 — product "Brinjel" not found in products.csv (did you mean "Brinjal"?)
```

Fix the source CSV files and run the validation script again. **Do not proceed to the seed script until validation passes with zero errors.**

---

### 2.2.3 — Clear test data and run the seed

Once validation passes cleanly, run the seed script:

```bash
node scripts/seed-production.js
```

**What the script does:**

1. Drops and recreates these four collections: `customers`, `farmers`, `product_catalogue`, `config`
2. Loads all rows from the four CSV files into MongoDB Atlas
3. Converts wallet balances from rupees (as the operator entered them) to paise by multiplying by 100
4. For every customer whose wallet balance is greater than zero, creates a `WalletTransaction` record of type `manual_adjustment` with `reference_note: "Opening balance at go-live"` — so the ledger is auditable from the very first day
5. Loads the synonym table into the `config` collection, merging the operator's additions with the built-in pre-seeded entries. The operator's additions do not overwrite built-in entries. Duplicates are automatically deduplicated.

**Collections the script does NOT touch:**

`market_weeks`, `customer_orders`, `wallet_transactions` (beyond opening balance entries), `inbound_messages`, `farmer_order_assignments`, `local_farmer_inbound`, `walkin_sales`, `farmer_payments`, `weekly_summaries`

This means re-running the seed later will not destroy any operational data — only the master data collections are affected.

**Expected output on success:**

```
Connecting to MongoDB Atlas...
Connected.

Dropping: customers, farmers, product_catalogue, config
Collections cleared.

Seeding customers... 50 inserted
  Opening balances: 50 wallet transactions written
Seeding farmers... 22 inserted (15 outstation, 7 local)
Seeding products... 28 inserted
Seeding synonyms... 18 operator entries + 11 built-in entries = 29 total (0 duplicates removed)

Seed complete.
```

If the script fails partway through, check the error message. The most common causes are a `MONGODB_URI` mismatch (wrong cluster) or a network timeout connecting to Atlas. Re-run once — the script is safe to run again because it drops and recreates from scratch.

---

### 2.2.4 — Verify the seed in the operator PWA

Log into the operator PWA with the test operator account from Manual 1.

Check each of the following:

1. Navigate to **Customers**. Confirm the count matches what the operator recorded at the end of Section 2.1.2.
2. Spot-check three customers at random: confirm name, phone number, and wallet balance are correct.
3. Navigate to **Farmers**. Confirm outstation and local counts match what the operator recorded at the end of Section 2.1.3.
4. Navigate to **Product Catalogue**. Confirm the count matches what the operator recorded at the end of Section 2.1.4.

**Confirmation check — 2.2**

> Customers in system: ________ (should match operator's count from 2.1.2)  
> Outstation farmers in system: ________  
> Local farmers in system: ________  
> Products in system: ________ (should match operator's count from 2.1.4)  
> Three spot-checked customers: name ✓ / phone ✓ / wallet balance ✓

If any count is wrong, or a spot-checked customer has incorrect data, re-check the source CSV and re-run the validation and seed scripts. Do not proceed to Section 2.3 until counts and spot-checks are correct.

---
---

## Section 2.3 — User Account Creation

> 💻 **IT PERSON TASK**  
> You need: terminal access to the repository and the list of real accounts to create (names, email addresses, and roles — collected from the operator before this session).

---

This section creates the real Firebase Authentication accounts for everyone who will use the system. These replace the test accounts from Manual 1.

---

### 2.3.1 — Collect the account list from the operator

Before running any commands, confirm you have the following from the operator:

For each **operator** account:
- Full name
- Email address (they will use this to log in)
- Temporary password (minimum 8 characters, they will change it on first login)

For each **volunteer** account:
- Full name
- Email address
- Temporary password

Write these down now. You will use them in Steps 2.3.3 and 2.3.4.

**Note on roles:** In MVP, all operator accounts have identical access. There is no senior/junior operator distinction. All volunteer accounts have identical restricted access. If the team is just one operator and one volunteer to start, that is fine — create one account of each type.

---

### 2.3.2 — Remove test accounts from Manual 1

If test accounts were created during Manual 1 and should not remain in the live system, delete them now.

**Option A — via terminal:**

```bash
node scripts/delete-user.js --email=testoperator@example.com
```

Repeat for each test account to remove.

**Option B — via Firebase console:**

1. Open the [Firebase console](https://console.firebase.google.com)
2. Select your project
3. Go to **Authentication → Users**
4. Find the test account, click the three-dot menu on the right → **Delete user**

Use whichever method is faster. Both are permanent.

---

### 2.3.3 — Create operator accounts

For each operator on your list, run:

```bash
node scripts/create-user.js \
  --email=operator@yourdomain.in \
  --role=operator \
  --password=TheirTempPassword1!
```

**What this script does:**

1. Creates a Firebase Auth user with the provided email and password
2. Sets the custom claim `{ "role": "operator" }` on the account — this is what the system reads to decide which screens to show
3. Prints the Firebase UID to the terminal for your records

Record the Firebase UID for each account in the Credentials Register (Appendix).

**Password requirements:** Minimum 8 characters. Must include at least one letter and one number. The operator will be prompted to change this on first login (or you can remind them — the system does not force a change, but they should do it).

---

### 2.3.4 — Create volunteer accounts

For each volunteer:

```bash
node scripts/create-user.js \
  --email=volunteer@yourdomain.in \
  --role=volunteer \
  --password=TheirTempPassword2!
```

Same process as operator accounts. The only difference is `--role=volunteer`, which sets the custom claim `{ "role": "volunteer" }`. This restricts the account to the delivery, packing, and dispatch screens.

---

### 2.3.5 — Confirm accounts in the Firebase console

1. Open the [Firebase console](https://console.firebase.google.com) → **Authentication → Users**
2. Confirm every expected account is listed
3. Confirm there are no unexpected test accounts remaining
4. Click into one operator account and one volunteer account and confirm the custom claims show the correct role

Custom claims are visible in the Firebase console under each user's detail view. They appear as JSON: `{ "role": "operator" }` or `{ "role": "volunteer" }`.

---

### 2.3.6 — Distribute credentials

Share each person's login email and temporary password with them **securely**. Do not paste passwords into an unencrypted group WhatsApp message.

Options:
- Send email directly to each person
- Share in person verbally
- Use a simple encrypted note (Apple Notes locked, Google Keep with lock, etc.)

Remind each person:
- The URL to log in: `https://[your-fly-app].fly.dev`
- Their email address
- Their temporary password
- To change their password on first login (Settings → Change Password, or via the login screen "Forgot password" flow)

---

### 2.3.7 — Confirm login for both roles

Test each role before moving on.

**Test 1 — Operator login:**

1. Open the live URL in a browser
2. Log in with one of the real operator accounts
3. You should reach the **Operator Dashboard** at `/operator/dashboard`
4. The dashboard should show real customer and farmer data from the seed (not a blank state or test data)

**Test 2 — Volunteer login:**

1. Open the live URL in a browser (an incognito window works well so you can test a different account without logging out of the operator)
2. Log in with one of the real volunteer accounts
3. You should reach the **Volunteer screen** — either the delivery entry screen or a "No active week" message, depending on the current system state. Either is correct. What must not happen: the volunteer must not see the operator dashboard or any operator-only screens.

**Confirmation check — 2.3**

> [ ] Operator account [email: ________________] logs in and reaches the operator dashboard  
> [ ] Volunteer account [email: ________________] logs in and reaches the volunteer screen, not the operator dashboard  
> [ ] All test accounts from Manual 1 have been removed (or deliberately retained — note which)

---
---

## Section 2.4 — Opening Configuration

> 💻 **IT PERSON TASK** for steps 2.4.1 and 2.4.2  
> 🧑‍🌾 **OPERATOR TASK** for step 2.4.3  
> Both may need to be in the same room (or on a call) for step 2.4.3.

---

### 2.4.1 — Confirm the WhatsApp webhook is still active

The webhook URL was registered during Manual 1. It should still be pointing to the live Fly.io URL. This step confirms it has not been disrupted by any redeployment since Manual 1.

**Test:**

1. From any phone (any number — does not need to be a registered customer), send a simple WhatsApp text message to the marketplace's registered WhatsApp Business number. Message content: `test`

2. Wait up to 60 seconds.

3. Log in to the operator PWA as an operator.

4. Navigate to the **Order Intake Queue**.

5. The message should appear in the queue, flagged as either "Unknown customer" (if the phone you sent from is not in the customer database) or "No active week — manual review required" (if no week is currently in Open state). Either flag is correct. What matters is that the message appears.

**If a redeployment happened between Manual 1 and now:**  
The Fly.io URL does not change on redeployment, so the webhook registration with Meta remains valid. You do not need to re-register the webhook. If you changed the app name or domain, however, a re-registration is required — see Troubleshooting Note for Gate Check 3.

**If the message does not appear:**  
Go to the Troubleshooting section at the back of this manual — Troubleshooting Note for Gate Check 3. The same diagnosis steps apply here.

**Confirmation check — 2.4.1**

> [ ] Test WhatsApp message from any number appeared in the intake queue within 60 seconds

---

### 2.4.2 — Enter the opening financial balances

This step records the real starting cash and bank balance before the first live market week begins. The system uses this as the opening balance in the first week's financial summary.

**Ask the operator for:**

- Current cash in hand (in whole rupees) — the physical notes and coins in the market cash box as of today
- Current bank / UPI balance (in whole rupees) — the balance in the bank account or UPI wallet used for market transactions

**Enter in the system:**

1. Log in to the operator PWA as an operator
2. Navigate to **Settings → Opening Balance** (or the equivalent screen — the exact path is labelled in the PWA)
3. Enter the cash amount in rupees
4. Enter the bank/UPI amount in rupees
5. Save

The system stores these amounts internally in paise (multiplied by 100). The display shows rupees. You do not need to convert anything manually.

**Timing note:** This entry should be made before the first market week is created in the system. Creating the first week before entering these balances will mean the first week's financial summary opens with a zero balance, which will not match the operator's physical cash position. If the first test week was created during Manual 1 and not deleted, check with the developer whether it needs to be removed before this entry is made.

**Do not create a market week during this manual.** The first week will be created in Manual 3 as part of operator training.

**Confirmation check — 2.4.2**

> Opening cash balance entered: ₹ ________________  
> Opening bank / UPI balance entered: ₹ ________________  
> [ ] Balances saved in system

---

### 2.4.3 — WhatsApp message template sign-off

> 🧑‍🌾 **OPERATOR TASK** (with IT person present or on call)

The system automatically generates formatted text in Tamil and English for several operator actions. The most important ones are:

1. **Weekly produce list** — the formatted text you copy and send to your customer WhatsApp group every Friday
2. **Per-farmer order summary** — the formatted text you copy and send to each outstation farmer to confirm their consolidated order

These messages will go to your actual customers and farmers. The wording must sound natural and correct to them — not like machine-translated text.

**What to do:**

1. The IT person will generate sample outputs of each message template from the system and share them with you (printed, screenshots, or on screen).

2. Read each sample carefully. Ask yourself:
   - Does this make sense to a customer or farmer reading it in Tamil?
   - Would you send this as-is to your group?
   - Is any phrasing awkward or confusing?

3. Mark up any changes on the printed copy or note them in writing.

4. Hand the marked-up changes to the IT person.

5. The IT person updates the translation strings in the code (`/shared/lib/translations.js` or equivalent file), redeploys the app, and generates new sample outputs.

6. Repeat until you are satisfied with all templates.

**This step is complete only when you have explicitly signed off in writing.** A verbal "yes, that's fine" is not sufficient — write your name and the date on the sign-off line below, or in the appendix checklist at the back of this manual.

**Note on redeployment:** If the IT person redeploys the app to update template wording, the Fly.io URL stays the same and the webhook stays registered. No further webhook configuration is needed. After any redeployment, wait 2–3 minutes and repeat the webhook test from Section 2.4.1 to confirm the intake queue is still working.

**Confirmation check — 2.4.3**

> Operator sign-off on Tamil and English message templates  
> Name: ________________  
> Date: ________________

---
---

## Section 2.5 — Phase Gate

> **Both operator and IT person**

Three checks. All three must pass before Manual 3 (Operator Training) begins. A single failed check sends you back to the relevant section — not forward.

Read each check carefully. Perform the test exactly as described. Mark the result.

---

### Gate Check 1 — Operator sees real data

**Who performs this check:** Operator

**Test:**

1. Log in to the live URL using your real operator account (the one created in Section 2.3, not a test account from Manual 1)
2. Navigate to **Customers** — confirm you can see your real customers with correct names
3. Navigate to **Farmers** — confirm you can see your real farmers
4. Navigate to **Product Catalogue** — confirm you can see your real products

**Pass condition:** You recognise the data as your own. The customer count, farmer count, and product count match the numbers you recorded in Sections 2.1.2, 2.1.3, and 2.1.4. No test data is visible.

**Result:**

> [ ] **PASS** — Real data visible, counts match  
> [ ] **FAIL** — Go to Troubleshooting Note for Gate Check 1

---

### Gate Check 2 — Volunteer sees the correct screen

**Who performs this check:** IT person (and volunteer if available)

**Test:**

1. On a **mobile phone** (Android preferred — this is the volunteer's actual device type), open the live URL
2. Log in with one of the real volunteer accounts from Section 2.3
3. Confirm the volunteer is routed to the volunteer section — either a delivery entry screen or a "No active week" message
4. Confirm the operator dashboard is **not** visible

**Pass condition:**  
- Login succeeds with no error  
- Volunteer sees the volunteer-scoped screen, not the operator dashboard  
- No red error messages or blank screens

**If the only available device right now is a laptop:**  
The gate check can pass using a laptop in a narrow browser window, but note in the appendix that the volunteer should also verify from their actual phone before their first market day.

**Result:**

> [ ] **PASS** — Volunteer account routes to volunteer screen, not operator dashboard  
> [ ] **FAIL** — Go to Troubleshooting Note for Gate Check 2

---

### Gate Check 3 — Test WhatsApp message from a seeded customer phone appears in intake queue

**Who performs this check:** Both operator and IT person

This is the most specific of the three checks. It tests the full end-to-end path: customer phone → WhatsApp → webhook → database → operator queue.

**Test:**

1. Identify a phone whose number is in the **Customers sheet** (and therefore now in the live system). This should be the operator's own phone if their number is registered, or the phone belonging to a customer who is present.

2. From that phone, send a WhatsApp text message to the marketplace's WhatsApp Business number. Use a realistic order message:  
   > `1 kg tomato`

3. Wait up to 60 seconds.

4. Operator logs in to the PWA and opens the **Order Intake Queue**.

**Pass condition:**  
- The message appears in the queue within 60 seconds  
- The customer is identified by name (not "Unknown customer") — because the phone number is in the seeded customer database  
- The parsed preview shows one line item: product matched to Tomato, quantity 1, unit kg  
- The parse status badge shows "Clean" (or "Partial" if the item name matched but unit or quantity did not parse — either is acceptable for this gate check; what matters is the message appeared and was attributed to the correct customer)

**Result:**

> [ ] **PASS** — Message appeared, customer identified by name, item parsed  
> [ ] **FAIL** — Go to Troubleshooting Note for Gate Check 3

---

### Phase Gate summary

All three must be ticked PASS before proceeding.

> [ ] Gate Check 1 — Operator sees real data — **PASS**  
> [ ] Gate Check 2 — Volunteer sees correct screen — **PASS**  
> [ ] Gate Check 3 — WhatsApp message from seeded customer appears in queue — **PASS**

**When all three are ticked:** Manual 2 is complete. Proceed to Manual 3 — Operator Training Manual.

---
---

## Troubleshooting Notes

---

### Troubleshooting — Gate Check 1: Data not visible or counts wrong

Work through these in order:

**1. The seed script did not complete successfully.**  
Check your terminal for the seed script output. Look for any red error lines or an incomplete finish (the final line should say `Seed complete.`). If the script errored out partway, re-run validation (`node scripts/validate-seed-data.js`) then re-run the seed (`node scripts/seed-production.js`).

**2. The seed script ran against the wrong database.**  
The script uses the `MONGODB_URI` environment variable. Confirm it is pointing to the production Atlas cluster (not a local or development database). In your terminal, temporarily print the URI to check (do not commit this to version control):  
```bash
fly secrets list
```
Confirm `MONGODB_URI` is set and that the cluster name in the URI matches your Atlas cluster.

**3. The operator is logged in with a test account.**  
Test accounts from Manual 1 may have full access but the seed may not have run correctly with those credentials. Confirm the operator is using a real account created in Section 2.3, not a leftover test account.

**4. Atlas M0 cold connection delay.**  
MongoDB Atlas M0 (free shared cluster) can take 2–5 minutes to accept connections after a period of inactivity. If the seed ran recently but the PWA shows no data, wait 3 minutes and refresh the browser.

**5. Counts are slightly off (e.g., 49 customers instead of 50).**  
A blank row in the middle of the operator's CSV can cause the script to stop reading early. Open the CSV in a text editor or spreadsheet app, look for any blank rows between data rows, remove them, and re-run the seed.

---

### Troubleshooting — Gate Check 2: Volunteer sees wrong screen or error

Work through these in order:

**1. Volunteer account has the wrong role claim.**  
This is the most common cause. Open the Firebase console → Authentication → Users → click the volunteer account → Custom claims. The value should be exactly `{"role":"volunteer"}`. If it shows `{"role":"operator"}` or is blank, the account was created with the wrong role. Fix it by re-running the create-user script with the correct role:  
```bash
node scripts/create-user.js \
  --email=volunteer@yourdomain.in \
  --role=volunteer \
  --password=NewTempPass1!
```
Or delete and recreate the account.

**2. Volunteer is using the wrong URL.**  
Confirm they are using the live Fly.io URL from Manual 1, not a localhost URL or an old test URL saved in their browser. The URL should be `https://[your-app].fly.dev`.

**3. Volunteer sees a blank page or loading spinner that never resolves.**  
Check Fly.io logs:  
```bash
fly logs
```
Look for any server errors or crashes around the time of the login attempt. A 500 error on the role-checking endpoint would explain this.

**4. Latest deployment not live.**  
If role-based routing was updated in the codebase after Manual 1 but before the current Manual 2 session, confirm the latest code is deployed:  
```bash
fly status
```
The deployed image tag should match the latest commit. If not, redeploy:  
```bash
fly deploy
```

---

### Troubleshooting — Gate Check 3: WhatsApp message does not appear in queue

Work through these in order, starting with step 1. Each step narrows the problem.

**Step 1 — Check whether the message is reaching the server at all.**  
In your terminal, run:  
```bash
fly logs
```
Send another test WhatsApp message. Watch the logs. Within a few seconds of sending, you should see a log line for an incoming POST request to `/webhook/whatsapp`. If you see this, the message is reaching the server — go to Step 3. If you see nothing, go to Step 2.

**Step 2 — Message is not reaching the server. Check Meta webhook configuration.**  
Open [Meta Business Platform](https://business.facebook.com) → **WhatsApp → Configuration → Webhooks**. Check:
- The webhook URL is set to `https://[your-app].fly.dev/webhook/whatsapp` — exactly as registered in Manual 1
- The verify token matches `WHATSAPP_VERIFY_TOKEN` set in Fly.io secrets
- The webhook status shows as active (not paused or failed)

If the status shows failed or paused: Meta pauses webhooks after repeated delivery failures. Re-verify the webhook by clicking the **Verify** button. If the Fly.io app is running, this should succeed.

**Step 3 — Server receives the message but rejects it with HTTP 403.**  
In the logs, look for a `403` response on the webhook route. This means HMAC signature verification is failing — the `WHATSAPP_APP_SECRET` in Fly.io secrets does not match what Meta is signing messages with. To fix:

1. Open Meta Business Platform → **App Settings → Basic** → find the **App Secret**
2. Copy the App Secret exactly
3. Update the Fly.io secret:  
   ```bash
   fly secrets set WHATSAPP_APP_SECRET=your-exact-app-secret-here
   ```
4. Wait 30 seconds for the secret to take effect
5. Send another test WhatsApp message

**Step 4 — Message reaches the server and is processed, but does not appear in the queue.**  
Check the Fly.io logs for any application errors after the webhook POST (look for `ERROR` lines after the POST log). If the message is being received but not written to MongoDB, a database connection issue is the likely cause. Check `fly secrets list` to confirm `MONGODB_URI` is set correctly.

**Step 5 — Message appears in the queue as "Unknown customer".**  
The message is flowing correctly — the webhook, database, and SSE are all working. The issue is that the phone number used for the test is not in the seeded customer database.  

Confirm: the phone number on the test phone starts with `+91` and is 13 characters total. Check the Customers collection in MongoDB Atlas (via Atlas console → Browse Collections → customers → search by phone field). If the number is not there, either:
- The number was entered differently in the Customers sheet (e.g., without `+91`)
- The seed did not include this customer

Correct the Customers CSV and re-run the seed. This is not a code problem — it is a data problem.

**Step 6 — Message appears and customer is identified, but parse shows "Unmatched".**  
This means the webhook, matching, and queue are all working. The parser did not find "tomato" or "1 kg" in the message. This is likely a synonym gap. It is not a gate failure — the gate only requires the message to appear and the customer to be identified. Note the unmatched token and add it to the Synonyms sheet. Re-run the seed after updating the sheet.

---
---

## Appendix — Credentials and Configuration Completion Checklist

Complete this checklist during the session. Keep a copy somewhere accessible to the IT person and operator. Do not store passwords in plain text in a shared location after go-live.

| # | Item | Value / Notes | Section | Done |
|---|---|---|---|---|
| 1 | Operator account 1 email | | 2.3.3 | [ ] |
| 2 | Operator account 1 Firebase UID | | 2.3.3 | [ ] |
| 3 | Operator account 2 email (if applicable) | | 2.3.3 | [ ] |
| 4 | Operator account 2 Firebase UID (if applicable) | | 2.3.3 | [ ] |
| 5 | Volunteer account 1 email | | 2.3.4 | [ ] |
| 6 | Volunteer account 1 Firebase UID | | 2.3.4 | [ ] |
| 7 | Volunteer account 2 email (if applicable) | | 2.3.4 | [ ] |
| 8 | Volunteer account 2 Firebase UID (if applicable) | | 2.3.4 | [ ] |
| 9 | Seed data CSV files location (local path or Google Sheet URL) | | 2.2.1 | [ ] |
| 10 | Date seed script was run | | 2.2.3 | [ ] |
| 11 | Customer count in system after seed | | 2.2.4 | [ ] |
| 12 | Outstation farmer count in system after seed | | 2.2.4 | [ ] |
| 13 | Local farmer count in system after seed | | 2.2.4 | [ ] |
| 14 | Product count in system after seed | | 2.2.4 | [ ] |
| 15 | Opening cash balance entered (₹) | | 2.4.2 | [ ] |
| 16 | Opening bank / UPI balance entered (₹) | | 2.4.2 | [ ] |
| 17 | WhatsApp message templates signed off by operator | Name + date: | 2.4.3 | [ ] |
| 18 | Gate Check 1 passed | Date: | 2.5 | [ ] |
| 19 | Gate Check 2 passed | Date: | 2.5 | [ ] |
| 20 | Gate Check 3 passed | Date: | 2.5 | [ ] |

---

*GudMart Handover Kit — Manual 2 of 5*  
*Internal use only. Do not distribute.*  
*Depends on: Manual 1 (Infrastructure Setup) complete and gate-passed.*  
*Leads into: Manual 3 (Operator Training Manual).*
