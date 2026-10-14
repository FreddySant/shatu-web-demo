# ShaTu web demo

A working preview of ShaTu, the SHA-256 tutor, as a web app. I built it to show what a browser version could look like and how it would work before we decide whether to move the project.

Live: <https://freddysant.github.io/shatu-web-demo/>

## What is in it

- A start screen with sign in, Create account and Forgot password. Students sign in with their email and a password from any computer.
- A main window laid out like a desktop program:
  - A menu bar with File, Practice, Lab, View and Help, and an account menu.
  - A toolbar with the actions for the open document.
  - A step tree on the left with the practice skills by stage, the Hash Lab steps and the reports.
  - Documents that open in tabs: each practice skill, the Hash Lab, the Progress report and Verification.
  - A bottom panel with Output, Hints, Solution, Rule and History.
  - A Properties panel and a status bar that shows when progress is saved.
- A Class progress report for instructors, with every student's progress and a CSV export.
- Panels can be resized or hidden, and the layout and the light or dark theme are remembered.
- Keyboard shortcuts for checking, hints, solutions, new problems and the Hash Lab steps.

## What you can practice

- 10 of ShaTu's skills: encoding a character, counting padding zeros, rotate right, shift right, XOR, addition modulo 2ⁿ, Choice, Majority, Σ0 and Σ1.
- Four levels per skill. The skills on words start with 4-bit words and move to 8, 16 and 32 bits. A student moves up after three answers in a row that are right on the first try, without the last hint or the worked solution.
- Feedback on every answer, with the wrong bits marked when the answer is a word, up to three hints that end with the answer, and a worked solution.
- The tutor picks your next problem from your progress.

## How accounts and progress are saved

The app runs in the browser and keeps accounts and progress in Firebase, Google's hosted database service, on its free Spark plan [3]. There is still no server to run.

- **Accounts.** Firebase Authentication checks the email and password [4]. New accounts get a verification email, and Forgot password sends a reset link.
- **Progress.** Each student has one document in Cloud Firestore with their name, email, the level and streak for every skill, and their last 30 finished problems. It is loaded when they sign in and saved a moment after every finished problem, so it follows them to any computer and is not lost if the browser is cleared. The status bar shows "Saved to your account", "Saving" or "Not saved, retrying".
- **Instructors.** An instructor is an account whose email is listed in the `instructors` collection and has been verified. Instructors see Reports > Class progress, with each student's course progress, skills mastered, problems solved, checks, hints and last activity, and can export it as a CSV file.
- **Who can see what.** The rules in `firestore.rules` let each student read and write only their own document. Only a verified instructor can read the whole class. Nobody can make themselves an instructor from the app.

Limits to know:

- The free plan allows 50,000 active users a month, 1 GiB of data, 50,000 reads and 20,000 writes a day, and 150 password-reset emails a day [3][4]. A student uses one or two reads when signing in and about one write per finished problem.
- The tutor's checking runs in the browser, so a student who knows how could change their own saved progress. The rules stop them from touching anyone else's. Checking answers on a server would need Cloud Functions, which need the paid Blaze plan [3].

## How the tutor decides

The tutor follows the two loops in VanLehn (2006), *The behavior of tutoring systems*:

- **Inner loop.** Inside a problem, the student gets feedback on each answer and can ask for hints that end with the answer.
- **Outer loop.** After each problem the tutor stays on the current skill until it is mastered, then moves to the first skill in the course that is not mastered yet.

The rules are in `src/engine/progress.ts` and `src/engine/policy.ts`.

## Why this setup

The pages are static files, so GitHub Pages can host them free from a public repository [1][2]. Firebase holds the accounts and progress, also free and without a server. Both the repository and the Firebase project can belong to the instructor, so the app stays up after the students who built it graduate.

Options checked in October 2026:

| Option | Cost | Sign-in built in | Inactivity | Server to maintain |
| --- | --- | --- | --- | --- |
| **GitHub Pages + Firebase** (used) | Free, no payment method [1][3] | Yes, with reset and verification emails [4] | No pause listed [3] | No |
| GitHub Pages + Supabase | Free database, 500 MB [7] | Yes | Pauses after 1 week of inactivity [7] | No |
| Cloudflare Workers + D1 | Free, 5 GB [8] | No, it would have to be written | No pause listed [8] | Yes, our own server code |
| Oracle Cloud Always Free | Free VM and MySQL HeatWave [5] | No | Idle VMs can be reclaimed after 7 days of low use [5] | Yes, a virtual machine |
| Azure for Students | $100 credit for 12 months, renewed each year while a student [6] | Depends on the service | Ends when that student leaves | Managed services |

What would carry over from the Java version: the exercise logic (about 2,400 lines in `objectives`) would move to TypeScript, and the known answers in the Java tests would become the new tests. The Swing screens (16,925 of the 32,854 lines in `src/main`) would be rebuilt as browser screens. The socket server and the MySQL code would mostly be replaced by Firebase. Line counts are from the `development` branch in October 2026.

## Setting up the Firebase project

This is done once by the project owner in the Firebase console (<https://console.firebase.google.com>):

1. Create a project. The free Spark plan needs no payment method.
2. **Authentication > Sign-in method:** turn on Email/Password.
3. **Authentication > Settings > Authorized domains:** add `freddysant.github.io` (or wherever the site is hosted).
4. **Firestore Database:** create a database in production mode and pick a location.
5. **Firestore Database > Rules:** replace the rules with the contents of `firestore.rules` and publish. Do this again whenever that file changes.
6. **Project settings > General > Your apps:** add a web app and copy its `apiKey`, `authDomain`, `projectId` and `appId`.
7. In the GitHub repository, **Settings > Secrets and variables > Actions > Variables:** add `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID` and `FIREBASE_APP_ID` with those values. They identify the project and are not secret; the rules protect the data [9].
8. To make someone an instructor: after they create an account and verify their email, add a document to a collection named `instructors` with their email in lower case as the document ID (add any field, such as `name`).
9. To hand the project to the instructor: **Project settings > Users and permissions**, add them with the Owner role.

## How it is tested

- `npm test` runs 54 tests: the NIST examples, every message length from 0 to 200 bytes against Node's Web Crypto, all 10 exercises at every level checked against a separate reference, the level-up, review and next-task rules, and the account form rules.
- `npm run test:cloud` starts the Firebase emulators and runs 15 more tests: the database rules (students see only their own document, only verified instructors see the class, nobody can add an instructor) and the accounts (verification and reset emails, the same message for a wrong password and an unknown email, password changes, and progress saved on one copy of the app and loaded on another).
- `.github/workflows/publish.yml` runs all of these and the build on every push to `main` and on pull requests. The site is published only from `main`, and only if everything passes.

## Run it locally

Requires Node 20.19 or newer, and Java 21 or newer for the emulators. The workflow uses Node 22.

```sh
npm ci
npm run emulators      # terminal 1: local Firebase, no account needed
npm run dev:emulator   # terminal 2: http://localhost:5173/shatu-web-demo/
npm test               # unit tests
npm run test:cloud     # rules and account tests on the emulators
npm run build          # production build in dist/
```

To run against the real project instead, put the four values from step 6 in a file named `.env.local` as `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID`, then run `npm run dev`. That file is not committed.

## Layout

- `src/engine`: exercises, SHA-256, the student model, the tutor's next-task rules, the account form rules and the verification checks. It does not touch the page or the network, so the tests run it in Node.
- `src/cloud`: Firebase sign-in, saving and loading progress, and the class list.
- `src/ui`: the start screen, the main window (menus, step tree, tabs, panels and status bar), the documents (practice, Hash Lab, progress, class progress and verification) and the dialogs.
- `firestore.rules` and `firebase.json`: the database rules and the emulator settings.
- `tests`: unit tests. `tests/cloud`: tests that need the emulators.

## Sources

1. What is GitHub Pages?: <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>
2. GitHub Pages limits: <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>
3. Firebase pricing: <https://firebase.google.com/pricing>
4. Firebase Authentication limits: <https://firebase.google.com/docs/auth/limits>
5. Oracle Cloud Always Free resources: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>
6. Azure for Students: <https://azure.microsoft.com/en-us/free/students>
7. Supabase pricing: <https://supabase.com/pricing>
8. Cloudflare D1 pricing: <https://developers.cloudflare.com/d1/platform/pricing/>
9. Firebase API keys: <https://firebase.google.com/docs/projects/api-keys>
10. FIPS 180-4, Secure Hash Standard: <https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf>
11. VanLehn, K. (2006). The behavior of tutoring systems. *International Journal of Artificial Intelligence in Education*, 16(3), 227–265.

## Notes

Independent proof of concept for the CS493 Senior Capstone ShaTu project. Not an official Regis University site. SHA-256 as specified in FIPS 180-4.
