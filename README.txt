SCEM — MYSQL-SHARED DASHBOARD (EXISTING DESIGN PRESERVED)

WHAT IS SHARED
- Student event registrations are stored in MySQL. Admin sees all registrations from every computer; students see only their own. Coordinators see registrations for clubs whose Student/Staff Coordinator field matches their account name or username.
- Clubs and their events are stored together in MySQL. Stalls and stall coordinator/location data are also stored in MySQL. Admin is the only role allowed by the server to update shared clubs/events/stalls.
- The existing dashboard HTML/CSS design is retained. No Add Club button is added.

WINDOWS SETUP
1. Extract this folder to Desktop.
2. Open Command Prompt and run: cd %USERPROFILE%\Desktop\SCEM_MySQL_Project
3. Install packages: npm install
4. In MySQL Workbench, open database.sql and execute the whole script. It creates/keeps the users table and adds app_state and event_registrations tables. Existing users are not deleted.
5. Copy .env.example to .env. Set DB_PASSWORD and set SESSION_SECRET to a long random secret. Keep .env private.
6. Run: node server.js
7. Open http://localhost:3000 (do not double-click index.html). Check http://localhost:3000/api/health.
8. If needed, create an Admin account in a second Command Prompt: npm run create-staff

IMPORTANT
- First Admin login seeds the shared clubs and stalls from the current browser's existing local data if the shared MySQL records do not exist yet. Choose the computer that has the correct/current clubs and stalls for this first Admin login. Later Admin edits are saved centrally.
- This initial version syncs event registrations, clubs/events and stalls. Other features such as competition registrations, performance records, profile photos, favorites and theme settings may remain browser-specific.
- localhost only works on this computer. To use from different computers, deploy the Node app and MySQL database to secure hosting with HTTPS and production session settings. Do not expose the development server directly to the public internet.
- Server-side role checks protect shared state and registrations. Keep the .env file private and never share database passwords.
