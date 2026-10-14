# ShaTu web demo

A working preview of ShaTu, the SHA-256 tutor, as a web app. I built it to show what a browser version could look like and how it would work before we decide whether to move the project.

Live: <https://freddysant.github.io/shatu-web-demo/>

## What is in it

- A start screen with sign in, Create account and Forgot password.
- A main window laid out like a desktop program:
  - A menu bar with File, Practice, Lab, View and Help, and an account menu.
  - A toolbar with the actions for the open document.
  - A step tree on the left with the practice skills by stage, the Hash Lab steps and the reports.
  - Documents that open in tabs: each practice skill, the Hash Lab, the Progress report and Verification.
  - A bottom panel with Output, Hints, Solution, Rule and History.
  - A Properties panel and a status bar.
- Panels can be resized or hidden, and the layout and the light or dark theme are remembered.
- Keyboard shortcuts for checking, hints, solutions, new problems and the Hash Lab steps.

## What you can practice

- 10 of ShaTu's skills: encoding a character, counting padding zeros, rotate right, shift right, XOR, addition modulo 2ⁿ, Choice, Majority, Σ0 and Σ1.
- Four levels per skill. The skills on words start with 4-bit words and move to 8, 16 and 32 bits. A student moves up after three answers in a row that are right on the first try, without the last hint or the worked solution.
- Feedback on every answer, with the wrong bits marked when the answer is a word, up to three hints that end with the answer, and a worked solution.
- The tutor picks your next problem from your progress.

## Accounts in this demo

Accounts and progress are saved only in the browser where they were made. Passwords are not stored. Each one is hashed with PBKDF2-SHA-256 (150,000 iterations and a random 16-byte salt) using the browser's Web Crypto API. Because only the hash is kept, a forgotten password cannot be recovered, so Forgot password removes the account and its progress from the browser and you create it again. Anyone with access to the same browser can still see or clear this data, so this is only for the demo. The full version would use a real sign-in service, such as Firebase Authentication and Firestore on the free Spark plan [3], so students can sign in from any device and their progress is kept in one place.

## How the tutor decides

The tutor follows the two loops in VanLehn (2006), *The behavior of tutoring systems*:

- **Inner loop.** Inside a problem, the student gets feedback on each answer and can ask for hints that end with the answer.
- **Outer loop.** After each problem the tutor stays on the current skill until it is mastered, then moves to the first skill in the course that is not mastered yet.

The rules are in `src/engine/progress.ts` and `src/engine/policy.ts`.

## Why a static web app

The whole tutor runs in the browser, so there is no server or database to host, pay for or maintain. It can be published free with GitHub Pages from a public repository. Hosted from a repository the instructor owns, it would stay up after the students who built it graduate.

Hosting options, checked in October 2026:

| Option | Cost | Owned by | Expires or pauses | Server to maintain |
| --- | --- | --- | --- | --- |
| **GitHub Pages** (proposed) | Free for public repositories [1]. Sites up to 1 GB, 100 GB a month of bandwidth [2] | The instructor | No | No, static files only |
| Firebase Spark (optional) | Free, with usage limits and no payment method [3] | The instructor | No | No |
| Oracle Cloud Always Free | Free VM and MySQL HeatWave [4] | The instructor | Idle VMs can be reclaimed after 7 days of low use | Yes, a virtual machine |
| Google Cloud Run | Free allowance, then pay as you go. Needs a billing account [5] | The instructor | No | A container service |
| Azure for Students | $100 credit for 12 months, renewed each year while a student [6] | One student | When that student leaves | Managed services |
| Supabase free plan | Free database [7] | The instructor | Pauses after 1 week of inactivity | No |

What would carry over from the Java version: the exercise logic (about 2,400 lines in `objectives`) would move to TypeScript, and the known answers in the Java tests would become the new tests. The Swing screens (16,925 of the 32,854 lines in `src/main`) would be rebuilt as browser screens. The socket server and database code would mostly be replaced by the browser and the progress it saves. Line counts are from the `development` branch in October 2026.

## How it is tested

- `npm test` runs 58 tests: the NIST examples, every message length from 0 to 200 bytes against Node's Web Crypto, all 10 exercises at every level checked against a separate reference, the level-up, review and next-task rules, and the account rules (only a hash is stored, the same message for a wrong username or password, a new password needs the current one, and an account can be removed).
- The Verification report runs similar checks in the browser.
- `.github/workflows/publish.yml` runs the tests and the build on every push to `main` and on pull requests. The site is published only from `main`, and only if both pass.

## Run it locally

Requires Node 20.19 or newer. The workflow uses Node 22.

```sh
npm ci
npm run dev      # local site at http://localhost:5173/shatu-web-demo/
npm test         # automated tests
npm run build    # production build in dist/
```

## Layout

- `src/engine`: exercises, SHA-256, accounts, the student model, the tutor's next-task rules and the verification checks. It does not touch the page, so the tests run it in Node.
- `src/ui`: the start screen, the main window (menus, step tree, tabs, panels and status bar), the documents (practice, Hash Lab, progress and verification) and the dialogs.
- `tests`: automated tests.

## Sources

1. What is GitHub Pages?: <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>
2. GitHub Pages limits: <https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits>
3. Firebase pricing: <https://firebase.google.com/pricing>
4. Oracle Cloud Always Free resources: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>
5. Google Cloud free features: <https://docs.cloud.google.com/free/docs/free-cloud-features>
6. Azure for Students: <https://azure.microsoft.com/en-us/free/students>
7. Supabase pricing: <https://supabase.com/pricing>
8. FIPS 180-4, Secure Hash Standard: <https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.180-4.pdf>
9. VanLehn, K. (2006). The behavior of tutoring systems. *International Journal of Artificial Intelligence in Education*, 16(3), 227–265.

## Notes

Independent proof of concept for the CS493 Senior Capstone ShaTu project. Not an official Regis University site. SHA-256 as specified in FIPS 180-4.
