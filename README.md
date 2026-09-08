# GHS Babi Khel — Government High School Website

A full-featured school management website for Government High School Babi Khel, District Mohmand, KPK, Pakistan.

## Tech Stack 

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Backend**: Supabase (Database, Auth, Storage)
- **UI**: Shadcn/ui, Framer Motion, Lucide Icons
- **Data**: React Query with caching. 

## Features

### Public Pages
- Home page with hero, stats, notices, news, teachers, achievements
- About, Teachers, Notices, News, Results, Gallery, Library pages
- Text-to-Speech on notices and library content
- Skeleton loading, 3D tilt effects, confetti celebrations

### User Dashboard
- Profile management with photo upload
- View results, timetable, notices, news, gallery, library
- Notification bell for new notices

### Admin Dashboard
- School settings (name, logo, banner, stats)
- Manage teachers, students (with CSV bulk import)
- Manage results (per class/exam/year, CSV import)
- Mark attendance with calendar view and reports
- Timetable editor (visual grid, color-coded subjects)
- Notices, News, Gallery, Library, Achievements CRUD
- User role management

## Setup

1. Clone the repository
2. Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
3. Install dependencies: `npm install`
4. Start dev server: `npm run dev`
5. Build for production: `npm run build`

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |

## First Admin Setup

1. Go to your deployed website → **Sign Up** with your email
2. Go to Supabase Dashboard → **Table Editor** → `profiles` table
3. Find your row → Change `role` from `user` to `admin`
4. Sign out and sign back in
5. Click **Dashboard** → You now have full admin access

## Deployment (Vercel)

1. Push code to GitHub
2. Import repo in Vercel
3. Add environment variables in Vercel project settings
4. Deploy — `vercel.json` handles SPA routing automatically

## Supabase Tables Required

- `school_settings` — School info (single row, id=1)
- `profiles` — User profiles with roles
- `teachers` — Teacher directory
- `students` — Student records
- `results` — Exam results (linked to students)
- `attendance` — Daily attendance records
- `timetables` — Class timetables
- `notices` — School announcements
- `news` — News articles
- `gallery_albums` / `gallery_photos` — Photo gallery
- `library_files` — Downloadable study materials
- `achievements` — School achievements

## Storage Buckets

- `school-assets` — Logo and banner images
- `teacher-photos` — Teacher profile photos
- `student-photos` — Student profile photos
- `news-images` — News article images
- `gallery` — Gallery photos
- `library-files` — PDF/Word documents
- `achievement-images` — Achievement images
- `avatars` — User profile avatars

## License

© GHS Babi Khel. All rights reserved.
