HAUNTHUB SAFE WEB READER — RENDER SETUP

IMPORTANT
This is an allowlist-based, read-only HTML reader, not a full transparent proxy. It deliberately does not run destination scripts, forward forms, proxy images/media, follow redirects, or bypass logins, paywalls, school/work filters, or site restrictions.

FILES
- server.js: Express server and safety checks
- package.json: dependencies/start command
- render.yaml: optional Render Blueprint configuration
- public/index.html: custom HauntHub/Frogie's-Arcade-inspired interface

DEPLOY ON RENDER (GitHub is the easiest supported path)
1. Extract this ZIP on your computer.
2. Create a new GitHub repository, e.g. haunthub-safe-proxy.
3. Upload the contents of this folder to the repository root. The root must contain package.json, server.js, render.yaml, and the public folder.
4. In Render, choose New + > Web Service and connect that repository.
5. Set:
   - Runtime: Node
   - Build Command: npm install
   - Start Command: npm start
6. In Environment, add ALLOWED_HOSTS with comma-separated domains you have permission to read, for example:
   example.com,example.org
   Replace those examples with the exact domains you intend to permit. Do not add arbitrary domains you do not control or have permission to access.
7. Optional: set MAX_RESPONSE_BYTES to 1500000.
8. Deploy. Open the *.onrender.com URL Render gives you.

If using render.yaml as a Blueprint, review its ALLOWED_HOSTS value after creating the service. The example domains are placeholders; the service will reject every other domain.

LOCAL TEST (Node.js 20+)
1. Extract the ZIP.
2. Open a terminal in the extracted folder.
3. Run: npm install
4. Set an environment variable before starting:
   Windows PowerShell:
     $env:ALLOWED_HOSTS="example.com,example.org"
     npm start
   macOS/Linux:
     ALLOWED_HOSTS="example.com,example.org" npm start
5. Visit http://localhost:3000

SAFETY NOTES
- Keep ALLOWED_HOSTS limited to domains you trust and are authorized to access.
- Do not make this an unrestricted open proxy.
- Do not store passwords, cookies, or other user secrets.
- Render free services may sleep when idle and can have usage limits.
- This starter is a learning project, not a security-audited production service. For public use, add monitoring and independent security review.
