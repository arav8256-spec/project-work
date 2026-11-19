# Mission 2026–2027 Study Tracker

A responsive study tracker with student accounts, individual performance records, admin-managed daily tasks, and admin-managed timetables. The cloud edition uses **Supabase Auth + PostgreSQL + Row Level Security** and can be deployed as a static site on **Vercel**.

## 1. Configure Supabase (required for multi-user deployment)

1. Create a Supabase project at https://supabase.com.
2. Open **SQL Editor** and run the complete `supabase-schema.sql` script.
3. Open **Project Settings → API** and copy the Project URL and `anon` / publishable key.
4. Paste those two public values into `supabase-config.js`:

   ```js
   window.MISSION_SUPABASE_CONFIG = {
     url: 'https://YOUR_PROJECT_ID.supabase.co',
     anonKey: 'YOUR_SUPABASE_ANON_KEY'
   };
   ```

   The anon key is intended for browser use. **Never put a `service_role` key in this website.** Row Level Security protects the data.

5. In Supabase **Authentication → Providers → Email**, decide whether to require email confirmation. If confirmation is enabled, new users must verify their email before they can get a signed-in session. For a simple classroom deployment, you can disable confirmation; use strong passwords and enable it if you want verified email addresses.
6. Create the administrator account in **Authentication → Users** with the admin email and a strong password. Then run the following SQL in SQL Editor, replacing the email:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   where email = 'admin@example.com';

   update public.user_profiles
   set role = 'admin'
   where username = 'admin@example.com';
   ```

7. Sign out and sign back in as the admin after promotion. Use the **Admin Login** tab with that email and password. There is no hardcoded admin password.

## 2. Deploy to Vercel

1. Upload the entire project folder to a GitHub repository (include `index.html`, `style.css`, `app.js`, `data.js`, `backend.js`, `supabase-config.js`, and the SQL/README files).
2. Import the repository into Vercel.
3. Choose **Other** as the framework preset. No build command is required; set the output directory to `.`.
4. Deploy. Open the generated Vercel URL and create student accounts using an email address and password.

`supabase-config.js` contains the public Supabase URL and anon key. These are not secrets; security is enforced by database policies. Never commit a Supabase service-role key.

## 3. How accounts and data work

- A first-time student can register from the Student Access form. Existing students log in with the same email/password.
- Each account has its own cloud profile and stores lecture progress, mock-test scores, daily tasks, timetable, streak, and mentor feedback.
- New student profiles are created by a database trigger and appear in the admin roster.
- The admin selects a student in the admin portal, reviews their performance, and assigns tasks or timetable slots. Those changes are saved to that student's cloud profile.
- Active student pages receive admin task/timetable changes through Supabase Realtime. If a student is offline, the latest assignments load at their next login.
- Row Level Security prevents students from reading other students' profiles or promoting themselves to admin. Only the admin role stored in Supabase Auth app metadata can manage all student profiles.

## 4. Local preview

Run a local static server (for example, VS Code Live Server) from this folder. Configure Supabase first; the shared account features do not work until the project URL and anon key are set.

## Important

This app is a client-side study tracker backed by Supabase. It does not contain a private service key or a Vercel server-side API. Do not remove the RLS policies from `supabase-schema.sql`. Back up your Supabase database periodically.
