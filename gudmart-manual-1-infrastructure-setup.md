# GudMart — Manual 1: Infrastructure Setup

**Version:** 1.0
**Date:** June 2026
**Purpose:** This manual takes you from zero accounts to a live running system.
**Audience:** IT person responsible for platform setup.

---

## Before You Start

Read this page before touching anything.

This manual sets up four platforms and deploys the GudMart application. You will work through the sections in order. Each section ends with a confirmation check — do not move to the next section until the check passes.

**You will need:**
- A laptop running Chrome or Firefox (do not use a phone or Internet Explorer)
- An email address for creating platform accounts — use the organisation's email, not a personal one
- The **Credentials Register** (a separate document) open and ready to fill in — you will record keys, passwords, and URLs as you go
- The GitHub repository invitation sent by the developer — check your email inbox before starting
- Access to the Meta Business account that owns the GudMart WhatsApp Business phone number — needed in Section 1.5

**The golden rule:** Fill in the Credentials Register at every step that produces a password, key, or URL. If you skip this, you will not be able to find these values later and the setup will need to be redone.

---

## Platform Account Checklist

Use this table to track account creation as you work through the manual.

| Platform | Website | Account Created |
|---|---|---|
| MongoDB Atlas | mongodb.com | ☐ |
| Firebase | firebase.google.com | ☐ |
| GitHub | github.com | ☐ |
| Fly.io | fly.io | ☐ |

---

## Section 1.0 — Before You Begin

**Purpose:** Confirm everything is in place before starting. Takes 5 minutes.

### Steps

**Step 1 — Check your device**
Confirm you are on a laptop or desktop computer with Chrome or Firefox installed and up to date.

**Step 2 — Open the Credentials Register**
Open the Credentials Register document now. Keep it open throughout this entire manual. You will fill it in as you go.

**Step 3 — Check your email for the GitHub invitation**
The developer will have sent a GitHub repository invitation to your email. Find it and keep it ready — you will accept it in Section 1.3. If you cannot find it, contact the developer before proceeding.

**Step 4 — Confirm WhatsApp Business API access**
Confirm you have login access to the Meta Business account that owns the GudMart WhatsApp Business phone number. You will need this in Section 1.5. If you are unsure who has this access, resolve it now before starting.

### Confirmation Check
All four items above are confirmed. The Credentials Register is open. Proceed to Section 1.1.

---

## Section 1.1 — MongoDB Atlas Setup

**Purpose:** Create the database that stores all GudMart data — customer records, orders, wallet transactions, and everything else.
**Time:** Approximately 15 minutes.

### What is MongoDB Atlas?
MongoDB Atlas is the database service used by GudMart. Think of it as the filing system where all the market's data is stored. The free tier (called M0) is sufficient for GudMart's scale indefinitely.

### Steps

**Step 1 — Create a MongoDB Atlas account**
1. Go to [mongodb.com](https://mongodb.com)
2. Click **Try Free**
3. Fill in your details and create an account using the organisation email address
4. Verify your email address when the confirmation email arrives
5. When asked what you are building, select any option — it does not affect the setup

> **Credentials Register:** Record the Atlas account email and password.

**Step 2 — Create a new project**
1. Once logged in, you will be on the Atlas dashboard
2. Click **New Project**
3. Name the project `gudmart`
4. Click **Next**, then **Create Project**
5. You do not need to add any team members

**Step 3 — Create a free M0 cluster**
1. Inside the `gudmart` project, click **Build a Database**
2. Select **M0 Free** (the free tier option)
3. For cloud provider, select **AWS**
4. For region, select **Singapore (ap-southeast-1)**

   > **Why Singapore?** It is the closest available free-tier region to Gudalur/Ooty, which means the application responds faster when reading and writing data.

5. For cluster name, type `gudmart-cluster`
6. Click **Create**
7. The cluster will take 1–3 minutes to provision. You will see a progress indicator. Wait for it to show as **Active** before continuing.

**Step 4 — Create a database user**
This is a separate login used only by the GudMart application to access the database. It is not the same as your Atlas account login.

1. In the left menu, click **Database Access**
2. Click **Add New Database User**
3. Choose **Password** as the authentication method
4. Enter a username: `gudmart-app`
5. Click **Autogenerate Secure Password** and copy the generated password
6. Under **Database User Privileges**, select **Atlas Admin**
7. Click **Add User**

> **Credentials Register:** Record the database username (`gudmart-app`) and the generated password as **Atlas DB Username** and **Atlas DB Password**.

**Step 5 — Set network access**
This allows the GudMart application (hosted on Fly.io) to connect to the database from any IP address.

1. In the left menu, click **Network Access**
2. Click **Add IP Address**
3. Click **Allow Access from Anywhere**
4. The IP address field will show `0.0.0.0/0`
5. Click **Confirm**

> **Note:** Allowing all IP addresses is safe here because the database also requires the username and password from Step 4 to connect. No one can access the data without those credentials.

**Step 6 — Get the connection string**
1. In the left menu, click **Database**
2. Click **Connect** on the `gudmart-cluster` row
3. Select **Drivers**
4. Select **Node.js** as the driver (any recent version)
5. Copy the connection string shown. It will look like:
   `mongodb+srv://gudmart-app:<password>@gudmart-cluster.xxxxx.mongodb.net/`
6. Replace `<password>` in the string with the actual password you recorded in Step 4
7. Add `gudmart` at the end of the URL before any `?` characters, so the database name is included:
   `mongodb+srv://gudmart-app:YOURPASSWORD@gudmart-cluster.xxxxx.mongodb.net/gudmart`

> **Credentials Register:** Record the full connection string (with the real password substituted) as **MONGODB_URI**.

### Confirmation Check
- Atlas dashboard shows `gudmart-cluster` with status **Active** (green indicator)
- Database user `gudmart-app` exists under Database Access
- Network Access shows `0.0.0.0/0` as an allowed entry
- Full connection string is recorded in the Credentials Register as **MONGODB_URI**

> **Troubleshooting:** If the cluster is still showing as provisioning after 5 minutes, refresh the browser page. If it shows an error, delete the cluster and repeat Step 3.

---

## Section 1.2 — Firebase Setup

**Purpose:** Create the authentication service that manages operator and volunteer logins.
**Time:** Approximately 15 minutes.

### What is Firebase?
Firebase Authentication is the service that handles "who is allowed to log in." When an operator or volunteer enters their email and password on the GudMart login screen, Firebase checks whether those credentials are correct. GudMart uses the free Spark plan, which supports far more logins than the team will ever need.

### Steps

**Step 1 — Go to Firebase and sign in**
1. Go to [firebase.google.com](https://firebase.google.com)
2. Click **Get started**
3. Sign in with a Google account

   > **Important:** Use the organisation's Google account, not a personal one. This account becomes the permanent owner of the Firebase project. If the person who set this up leaves, the organisation needs to still have access.

> **Credentials Register:** Record the Google account email used as **Firebase Owner Email**.

**Step 2 — Create a new Firebase project**
1. Click **Add project**
2. Name the project `gudmart`
3. On the next screen, **disable Google Analytics** — it is not needed. Toggle it off.
4. Click **Create project**
5. Wait 30–60 seconds for the project to be created, then click **Continue**

**Step 3 — Enable Email/Password authentication**
1. In the left menu, click **Authentication**
2. Click **Get started**
3. Under the **Sign-in method** tab, find **Email/Password** in the list
4. Click on it
5. Toggle **Enable** to on
6. Click **Save**
7. Confirm the status now shows **Enabled** next to Email/Password

**Step 4 — Note the Firebase Project ID**
1. Click the gear icon ⚙ near the top of the left menu
2. Select **Project settings**
3. On the General tab, find **Project ID** near the top of the page
4. Copy this value — it looks something like `gudmart-a1b2c`

> **Credentials Register:** Record this as **FIREBASE_PROJECT_ID**.

**Step 5 — Generate a service account key**
This is a file that gives the GudMart application admin-level access to Firebase. It must be kept secure.

1. Still in Project Settings, click the **Service accounts** tab
2. Click **Generate new private key**
3. Click **Generate key** on the confirmation popup
4. A JSON file will download to your computer automatically
5. Move this file to a safe location — for example, a folder named `gudmart-secrets` on your desktop
6. **Do not share this file with anyone. Do not upload it to GitHub. Do not email it.**

> **Credentials Register:** Record the file name and its location on your computer as **Firebase Service Account JSON Location**.

### Confirmation Check
- Firebase project `gudmart` exists and is open in the console
- Authentication → Sign-in method shows **Email/Password** as Enabled
- **FIREBASE_PROJECT_ID** is recorded in the Credentials Register
- Service account JSON file is downloaded and stored in a safe location recorded in the Credentials Register

> **Troubleshooting:** If you cannot find the Service accounts tab, make sure you are in Project Settings (gear icon), not in another section. The tab is at the top of the Project Settings page.

---

## Section 1.3 — GitHub Repository Setup

**Purpose:** Put the GudMart source code into the organisation's own GitHub account so it can be deployed and managed independently.
**Time:** Approximately 10 minutes (plus waiting for the developer to push the code).

### What is GitHub?
GitHub is where the GudMart application code lives. When a code change is made and pushed to GitHub, it automatically triggers a deployment to the live system. The organisation owns the code repository — it is not dependent on the developer's personal account.

### Steps

**Step 1 — Create a GitHub account**
If the organisation does not already have a GitHub account:
1. Go to [github.com](https://github.com)
2. Click **Sign up**
3. Use the organisation email address
4. Complete the account creation steps

> **Credentials Register:** Record the GitHub username as **GitHub Username**.

**Step 2 — Accept the repository invitation**
1. Go to [github.com/notifications](https://github.com/notifications)
2. Find the invitation from the developer to collaborate on the GudMart repository
3. Accept the invitation

   > If you cannot find the invitation, check your email inbox for a message from GitHub. If it is not there, contact the developer to resend it.

**Step 3 — Create a new repository**
1. Click the **+** icon in the top right of GitHub
2. Select **New repository**
3. Set the owner to the organisation's GitHub account
4. Name the repository `gudmart`
5. Set visibility to **Private**
6. Do **not** tick "Add a README file" or any other initialisation option
7. Click **Create repository**

**Step 4 — Notify the developer**
This step is a handoff point. You do not need to do anything technical.

Contact the developer and tell them:
- The new repository has been created
- The GitHub username is: *(your username from the Credentials Register)*
- The repository name is: `gudmart`

The developer will push the application code to your repository. Wait for confirmation from the developer that this is done before continuing.

**Step 5 — Add the Fly.io deployment secret (return here after Section 1.4 Step 5)**

> **Note:** You cannot complete this step yet. You need a value from Section 1.4 first. When you reach Section 1.4 Step 5, you will be reminded to return here.

Once you have the `FLY_API_TOKEN` value from Section 1.4:
1. In your GitHub repository, click **Settings**
2. In the left menu, click **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `FLY_API_TOKEN`
5. Value: paste the token from Section 1.4 Step 5
6. Click **Add secret**

### Confirmation Check
- GitHub account exists and the username is recorded in the Credentials Register
- New private repository named `gudmart` exists under the organisation account
- Developer has confirmed the code has been pushed — the repository shows files when you browse it (not an empty page)
- `FLY_API_TOKEN` secret has been added (complete this after Section 1.4 Step 5)

> **Troubleshooting:** If the repository shows as empty after the developer says they have pushed, refresh the page. If it is still empty, ask the developer to confirm the push went to the correct repository URL.

---

## Section 1.4 — Fly.io Setup and Deployment

**Purpose:** Create the hosting account, configure the application with all its secrets, and trigger the first live deployment.
**Time:** Approximately 30 minutes. This is the most involved section.

### What is Fly.io?
Fly.io is where the GudMart application runs. It is the equivalent of a permanently-on computer in a data centre in Singapore. When someone opens the GudMart URL in their browser, Fly.io serves the application. The free tier provides three always-on virtual machines — GudMart uses one.

### What is a terminal / command line?
Several steps in this section require typing commands into a terminal. A terminal is a text-based window where you type instructions directly to your computer.

- **On Windows:** Press the Windows key, type `cmd`, and press Enter. Or search for **Command Prompt**.
- **On Mac:** Press Cmd + Space, type `terminal`, and press Enter.
- **On Linux:** Press Ctrl + Alt + T.

When this manual says "type a command," it means type it into this terminal window and press Enter to run it.

### Steps

**Step 1 — Create a Fly.io account**
1. Go to [fly.io](https://fly.io)
2. Click **Get Started**
3. Sign up using the organisation email address
4. No credit card is required for the free tier

> **Credentials Register:** Record the Fly.io account email as **Fly.io Account Email**.

**Step 2 — Install the Fly.io command-line tool (flyctl)**
The Fly.io CLI is a small program you install on your computer. It lets you manage the application by typing commands.

**On Windows:**
Open the terminal (Command Prompt) and run:
```
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

**On Mac:**
Open the terminal and run:
```
brew install flyctl
```
If you do not have Homebrew, run this first:
```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

**On Linux:**
Open the terminal and run:
```
curl -L https://fly.io/install.sh | sh
```

After installation, verify it worked by typing:
```
fly version
```
A version number should print (for example, `fly v0.2.x`). If you see an error instead, restart your terminal and try again.

**Step 3 — Log in to Fly.io from the terminal**
Type:
```
fly auth login
```
A browser window will open. Log in with the Fly.io account you created in Step 1. Once logged in, return to the terminal — it will confirm you are logged in.

**Step 4 — Navigate to the repository folder**
You need to be inside the GudMart repository folder on your computer to run the next command.

1. The developer will have told you where the repository was cloned to, or you can find it by going to the GitHub repository page and looking at the clone URL
2. In the terminal, type `cd ` (with a space after it), then drag the folder from your file explorer into the terminal window — this fills in the path automatically
3. Press Enter
4. Type `ls` (Mac/Linux) or `dir` (Windows) and press Enter — you should see a list of files including `fly.toml` and `package.json`

**Step 5 — Create the application on Fly.io**
Type:
```
fly launch
```
You will be asked several questions. Answer them as follows:
- **App name:** type `gudmart` (or `gudmart-app` if `gudmart` is already taken — Fly.io app names are globally unique)
- **Region:** select `sin` — Singapore
- **Would you like to deploy now?** type `N` and press Enter — do **not** deploy yet

This creates the application slot on Fly.io without deploying. The deployment happens in Step 8 after the secrets are set.

**Step 6 — Generate a Fly.io API token for GitHub**
This token allows GitHub to deploy to Fly.io automatically whenever code is updated.

Type:
```
fly tokens create deploy -x 999999h
```

A long string of characters will print in the terminal. Copy the entire string carefully — it starts with `FlyV1` or similar.

> **Credentials Register:** Record this as **FLY_API_TOKEN**.

Now return to **Section 1.3 Step 5** and add this token as a GitHub secret before continuing.

**Step 7 — Convert the Firebase service account JSON to base64**
The Firebase service account JSON file from Section 1.2 Step 5 needs to be converted to a single-line format before it can be stored as a Fly.io secret.

**On Mac/Linux**, type this command (replace the path with the actual location of your JSON file):
```
base64 -i /path/to/your/firebase-service-account.json
```

**On Windows**, type:
```
certutil -encode C:\path\to\firebase-service-account.json encoded.txt && type encoded.txt
```

A long string of characters will print. Copy the entire output.

> **Credentials Register:** Record this encoded string as **FIREBASE_SERVICE_ACCOUNT_JSON (base64)**.

**Step 8 — Set all application secrets on Fly.io**
These commands store the sensitive configuration values on Fly.io so the application can use them securely. Run each command one at a time, replacing the placeholder values with the actual values from your Credentials Register.

```
fly secrets set MONGODB_URI="paste MONGODB_URI value here"
```
```
fly secrets set FIREBASE_PROJECT_ID="paste FIREBASE_PROJECT_ID value here"
```
```
fly secrets set FIREBASE_SERVICE_ACCOUNT_JSON="paste the base64 encoded string from Step 7 here"
```
```
fly secrets set WHATSAPP_APP_SECRET="paste the WhatsApp App Secret from your Meta Business account here"
```
```
fly secrets set WHATSAPP_VERIFY_TOKEN="gudmart2026"
```

> **What each secret does:**
> - `MONGODB_URI` — tells the application where the database is and how to connect to it
> - `FIREBASE_PROJECT_ID` — tells the application which Firebase project handles logins
> - `FIREBASE_SERVICE_ACCOUNT_JSON` — gives the application admin access to Firebase to verify logins
> - `WHATSAPP_APP_SECRET` — used to verify that incoming WhatsApp messages are genuinely from Meta and not from someone pretending to be Meta
> - `WHATSAPP_VERIFY_TOKEN` — a passphrase used once during webhook setup in Section 1.5

> **Credentials Register:** Record `WHATSAPP_VERIFY_TOKEN` as `gudmart2026` (or whatever phrase you chose) under **WHATSAPP_VERIFY_TOKEN**.

> **Finding the WhatsApp App Secret:** Log in to the Meta Business account → go to the WhatsApp app settings → look for App Secret under the Basic Settings or Security section.

**Step 9 — Trigger the first deployment**
1. Go to your GitHub repository in the browser
2. Click the **Actions** tab
3. Find the deployment workflow in the list (it will be named something like **Deploy to Fly.io**)
4. Click on it
5. Click **Run workflow** → **Run workflow**
6. Watch the progress — deployment takes 3–5 minutes
7. When the workflow shows a green tick (✓), the deployment is complete

**Step 10 — Confirm the live URL**
In the terminal, type:
```
fly status
```
The output will show the application name and the live URL ending in `.fly.dev`. Open this URL in a browser.

> **Credentials Register:** Record the live URL as **Live Application URL**.

### Confirmation Check
- `fly version` prints a version number without error
- `fly status` shows the application as running
- The live URL opens in a browser and shows the GudMart login screen
- All five secrets are set (you can verify by typing `fly secrets list` — names will show but values are hidden)
- `FLY_API_TOKEN` has been added as a GitHub secret (from Section 1.3 Step 5)
- Live URL is recorded in the Credentials Register

> **Troubleshooting:** If the GitHub Actions workflow shows a red cross (✗), click on the failed workflow run, then click on the failed step to see the error message. Common causes: `FLY_API_TOKEN` secret not added to GitHub (Section 1.3 Step 5), or a secret value was pasted with extra spaces. If the login screen does not appear, type `fly logs` in the terminal to see recent application error messages.

---

## Section 1.5 — WhatsApp Webhook Registration

**Purpose:** Tell Meta's WhatsApp Business API to send incoming customer messages to the GudMart system. Without this step, customer WhatsApp orders will never appear in the operator's intake queue.
**Time:** Approximately 10 minutes.

### What is a webhook?
A webhook is an automatic notification. When a customer sends a WhatsApp message to the GudMart business number, Meta's servers send a notification to the GudMart application. This section tells Meta where to send those notifications — the live URL from Section 1.4.

### Steps

**Step 1 — Log in to Meta Business**
Go to [business.facebook.com](https://business.facebook.com) and log in with the account that owns the GudMart WhatsApp Business phone number.

**Step 2 — Navigate to the WhatsApp app**
1. In the left menu, find and click **WhatsApp** (under the products or apps section)
2. Select the WhatsApp Business account linked to the GudMart phone number
3. Click **Configuration** in the left menu

**Step 3 — Enter the webhook URL**
1. Under the **Webhook** section, click **Edit**
2. In the **Callback URL** field, enter:
   `https://YOURAPPNAME.fly.dev/webhook/whatsapp`

   Replace `YOURAPPNAME` with the actual Fly.io app name from Section 1.4 (found in the Credentials Register under **Live Application URL**).

3. In the **Verify token** field, enter exactly what you set as `WHATSAPP_VERIFY_TOKEN` in Section 1.4 Step 8 — which is `gudmart2026` (or the phrase you chose)

4. Click **Verify and save**

   Meta will immediately send a verification request to the GudMart application. If the application is running and the verify token matches, this will succeed and show as **Verified**.

> **If verification fails:** Check two things. First, confirm the application is running (`fly status` in the terminal should show it as running). Second, confirm the verify token entered here exactly matches what was set in Section 1.4 Step 8 — they must be identical, including capitalisation.

**Step 4 — Subscribe to the messages field**
1. Still in the Webhook section, find the list of **Webhook fields**
2. Find **messages** in the list
3. Click **Subscribe** next to it

   This ensures that when a customer sends a message, the webhook notification is triggered.

### Confirmation Check
- Webhook URL is entered and shows status **Verified** in the Meta Business dashboard
- The **messages** webhook field shows as **Subscribed**

> **Troubleshooting:** If the webhook shows as not verified after clicking Verify and save, the most likely causes are: (1) the application is not running — check `fly status` and `fly logs` in the terminal, or (2) the verify token does not match — re-check the exact value set in Section 1.4 Step 8.

---

## Section 1.6 — Phase Gate

**Purpose:** Confirm the entire system is working end to end before proceeding to Manual 2. All three checks must pass. Do not proceed to Manual 2 if any check fails.

---

### Check 1 — Application Loads

**What to do:**
Open the live URL (from the Credentials Register) in a browser.

**Expected result:**
The GudMart login screen appears.

**If this fails:**
- Type `fly status` in the terminal. If the application shows as stopped, type `fly restart` to restart it.
- Type `fly logs` in the terminal to see recent error messages. Share these with the developer.

---

### Check 2 — Login Works

**What to do:**
1. On the GudMart login screen, enter the test operator email and password provided by the developer
2. Click Login

**Expected result:**
The operator dashboard appears.

**If this fails:**
- Go to the Firebase console → Authentication → Users tab
- Confirm the test operator account exists in the list
- Confirm Email/Password authentication is still showing as Enabled under Sign-in method
- If the account does not exist, contact the developer to create the test account

---

### Check 3 — WhatsApp Messages Arrive

**What to do:**
1. Send a WhatsApp message from any phone to the GudMart business WhatsApp number. The message can say anything — for example, "test message"
2. Wait 60 seconds
3. Log in to the operator dashboard
4. Navigate to the order intake queue

**Expected result:**
The test message appears in the intake queue. It will be flagged as "Unknown sender" or "No active week" — this is expected and correct at this stage since no customers are seeded yet.

**If this fails:**
- Go to the Meta Business dashboard and confirm the webhook shows as Verified and the messages field is Subscribed (Section 1.5)
- Type `fly logs` in the terminal and look for any webhook-related error messages
- Contact the developer with the exact error messages from `fly logs`

---

### Phase Gate Result

| Check | Result |
|---|---|
| Check 1 — Application loads | ☐ Pass / ☐ Fail |
| Check 2 — Login works | ☐ Pass / ☐ Fail |
| Check 3 — WhatsApp message appears in queue | ☐ Pass / ☐ Fail |

**All three checks pass:** Notify the operator that Manual 2 can begin. Proceed to Manual 2.

**Any check fails:** Work through the troubleshooting note for the failing check. If unresolved, contact the developer with the check number that failed and the exact error message observed.

---

## Appendix — Credentials Register Completion Checklist

Before moving to Manual 2, confirm every value below is recorded in the Credentials Register. If any field is blank, return to the section listed and find it.

| Value | Recorded In Section | Field Name |
|---|---|---|
| MongoDB Atlas account email | 1.1 Step 1 | Atlas Account Email |
| MongoDB Atlas account password | 1.1 Step 1 | Atlas Account Password |
| MongoDB database username | 1.1 Step 4 | Atlas DB Username |
| MongoDB database password | 1.1 Step 4 | Atlas DB Password |
| Full MongoDB connection string (with password) | 1.1 Step 6 | MONGODB_URI |
| Firebase owner Google account email | 1.2 Step 1 | Firebase Owner Email |
| Firebase Project ID | 1.2 Step 4 | FIREBASE_PROJECT_ID |
| Firebase service account JSON file location | 1.2 Step 5 | Firebase Service Account JSON Location |
| GitHub username | 1.3 Step 1 | GitHub Username |
| Fly.io account email | 1.4 Step 1 | Fly.io Account Email |
| Fly.io API token | 1.4 Step 6 | FLY_API_TOKEN |
| WhatsApp verify token phrase | 1.4 Step 8 | WHATSAPP_VERIFY_TOKEN |
| Live application URL | 1.4 Step 10 | Live Application URL |

**All 13 values recorded?** Manual 1 is complete. Proceed to Manual 2.

---

*GudMart Handover Kit — Manual 1 of 5*
*For internal use only. Do not distribute.*
