# Photographer Website — Development Flow

## Project Goal

Build a premium, responsive photographer portfolio and booking website using:

- **Frontend:** React + Vite
- **Styling:** CSS / Tailwind (if used)
- **Animations:** GSAP + ScrollTrigger
- **3D (optional):** React Three Fiber + Three.js
- **Backend:** Node.js + Express
- **Database:** MongoDB + Mongoose
- **Authentication:** JWT
- **Image Storage:** Cloudinary / ImageKit
- **Deployment:** Vercel (frontend) + Render/Railway (backend)

---

# 1. Overall Architecture

```text
                    PHOTOGRAPHER WEBSITE
                           │
          ┌────────────────┴────────────────┐
          │                                 │
     PUBLIC WEBSITE                     ADMIN PANEL
          │                                 │
  ┌───────┼────────┐              ┌─────────┼─────────┐
  │       │        │              │         │         │
 Home   Portfolio Services      Dashboard Bookings Calendar
 About  Contact   Booking       Clients   Portfolio Packages
                         │
                         ▼
                   EXPRESS API
                         │
                  Controllers
                         │
                   Mongoose Models
                         │
                      MongoDB
```

The project should be developed in **3 major systems**:

1. Public Website
2. Booking System
3. Admin Panel

Do not build everything at once.

---

# 2. Development Order

Follow this order:

```text
1. Planning
      ↓
2. React Setup
      ↓
3. Folder Structure
      ↓
4. Global Components
      ↓
5. Layout + Navbar + Footer
      ↓
6. React Router
      ↓
7. Home Page
      ↓
8. About Page
      ↓
9. Portfolio Page
      ↓
10. Services Page
      ↓
11. Contact Page
      ↓
12. Booking Frontend
      ↓
13. Responsive Design
      ↓
14. GSAP / Advanced Animations
      ↓
15. Node + Express Backend
      ↓
16. MongoDB + Mongoose
      ↓
17. Booking APIs
      ↓
18. Connect Booking Frontend
      ↓
19. Admin Authentication
      ↓
20. Admin Dashboard
      ↓
21. Booking Management
      ↓
22. Admin Calendar
      ↓
23. Blocked Dates / Availability
      ↓
24. Portfolio Management
      ↓
25. Package Management
      ↓
26. Messages
      ↓
27. Email Notifications
      ↓
28. Security
      ↓
29. Testing
      ↓
30. Deployment
```

---

# 3. Phase 1 — Planning

Before coding, finalize:

- Photographer name / brand - Pratik Shelke Photography
- Logo  - Pratik Shelke Photography
- Color palette - Luxury - black and gold
- Fonts 
- Photography categories
- Services
- Packages
- Pricing
- Contact information
- Instagram / WhatsApp links
- Location
- Booking rules

### Public Pages

```text
/
├── /about
├── /portfolio
├── /services
├── /book
├── /contact
└── /client-gallery (optional)
```

### Admin Pages

```text
/admin/login
/admin
/admin/bookings
/admin/calendar
/admin/clients
/admin/portfolio
/admin/packages
/admin/messages
/admin/settings
```

**Important:** Admin Login should not appear in the main public navbar.

---

# 4. Phase 2 — Create React Project

Create the frontend using Vite.

```bash
npm create vite@latest client
cd client
npm install
npm run dev
```

Install only the packages actually needed.

Possible packages:

```bash
npm install react-router-dom
npm install axios
npm install gsap
```

Add Three.js only when the 3D section is actually needed:

```bash
npm install three @react-three/fiber @react-three/drei
```

Do not install every dependency at the beginning.

---

# 5. Phase 3 — Create Folder Structure

Recommended structure:

```text
client/
├── public/
│   ├── favicon.ico
│   └── images/
│
├── src/
│   ├── assets/
│   │   ├── images/
│   │   │   ├── hero/
│   │   │   ├── portfolio/
│   │   │   ├── services/
│   │   │   └── about/
│   │   ├── icons/
│   │   ├── videos/
│   │   └── fonts/
│   │
│   ├── components/
│   │   ├── common/
│   │   ├── layout/
│   │   ├── home/
│   │   ├── portfolio/
│   │   ├── services/
│   │   ├── booking/
│   │   ├── contact/
│   │   ├── auth/
│   │   └── admin/
│   │
│   ├── pages/
│   │   ├── Home/
│   │   ├── About/
│   │   ├── Portfolio/
│   │   ├── Services/
│   │   ├── Booking/
│   │   ├── Contact/
│   │   ├── ClientGallery/
│   │   ├── Auth/
│   │   ├── Admin/
│   │   └── NotFound/
│   │
│   ├── layouts/
│   │   ├── PublicLayout.jsx
│   │   └── AdminLayout.jsx
│   │
│   ├── context/
│   │   ├── AuthContext.jsx
│   │   └── BookingContext.jsx
│   │
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useBooking.js
│   │   ├── useFetch.js
│   │   └── useDebounce.js
│   │
│   ├── services/
│   │   ├── api.js
│   │   ├── authService.js
│   │   ├── bookingService.js
│   │   ├── portfolioService.js
│   │   ├── packageService.js
│   │   ├── clientService.js
│   │   └── contactService.jsportfolioService.js
│   │
│   ├── routes/
│   │   └── AppRoutes.jsx
│   │
│   ├── utils/
│   │   ├── constants.js
│   │   ├── formatDate.js
│   │   ├── validation.js
│   │   └── helpers.js
│   │
│   ├── styles/
│   │   ├── global.css
│   │   ├── variables.css
│   │   └── animations.css
│   │
│   ├── App.jsx
│   └── main.jsx
│
├── .env
├── package.json
└── vite.config.js
```

### Component Rule

Do **not** create one huge `components.jsx`.

Use:

```text
One component = one responsibility
```

For example:

```text
Button.jsx
Navbar.jsx
GalleryCard.jsx
BookingForm.jsx
AdminCalendar.jsx
```

---

# 6. Phase 4 — Build Global Components First

Start with reusable components:

```text
components/common/
├── Button.jsx
├── Input.jsx
├── Select.jsx
├── Textarea.jsx
├── Modal.jsx
├── Loader.jsx
├── Badge.jsx
├── Card.jsx
├── SectionTitle.jsx
├── EmptyState.jsx
└── ConfirmModal.jsx
```

Then create:

```text
components/layout/
├── Navbar.jsx
├── Footer.jsx
├── MobileMenu.jsx
└── PageTransition.jsx
```

First goal:

```text
Navbar
↓
Page Content
↓
Footer
```

---

# 7. Phase 5 — React Router + Layouts

Create:

```text
routes/AppRoutes.jsx
layouts/PublicLayout.jsx
layouts/AdminLayout.jsx
```

Public layout:

```text
PublicLayout
├── Navbar
├── Outlet
└── Footer
```

Admin layout:

```text
AdminLayout
├── AdminSidebar
├── AdminHeader
└── Outlet
```

Keep `App.jsx` simple:

```text
App
└── AppRoutes
```

---

# 8. Phase 6 — Build Public Website

Build the public website completely before starting the backend.

## Home Page

Recommended structure:

```text
Home
├── HeroSection
├── AboutPreview
├── FeaturedPortfolio
├── ServicesPreview
├── Testimonials
└── CTASection
```

### Hero

Focus on:

- Strong photography
- Photographer name
- Short tagline
- CTA
- Cinematic composition

---

# 9. Phase 7 — About Page

Suggested design:

```text
About
├── Hero / Video
├── Photographer Story
├── Experience
├── Photography Style
└── CTA
```

Possible animation:

```text
Scroll
   ↓
Video / Photographer moves
   ↓
Text appears
   ↓
Scene transitions
```

Build it in this order:

```text
Static layout
↓
Add video
↓
Add GSAP
↓
Add ScrollTrigger
↓
Optimize mobile
```

Do not start with complex animation.

---

# 10. Phase 8 — Portfolio Page

Components:

```text
portfolio/
├── CategoryFilter.jsx
├── GalleryGrid.jsx
├── GalleryCard.jsx
├── Lightbox.jsx
└── GalleryLoader.jsx
```

Categories can include:

```text
Wedding
Portrait
Events
Commercial
Family
Pre-Wedding
```

Flow:

```text
Portfolio
   ↓
Category Filter
   ↓
Gallery Grid
   ↓
Gallery Card
   ↓
Lightbox
```

Initially use static local images.

Later connect portfolio data to MongoDB.

---

# 11. Phase 9 — Services Page

Components:

```text
services/
├── ServiceCard.jsx
├── ServicesGrid.jsx
├── PricingCard.jsx
├── PricingSection.jsx
├── FAQ.jsx
└── ServiceCTA.jsx
```

Show:

- Wedding photography
- Pre-wedding
- Portrait
- Events
- Commercial
- Custom shoots

Pricing section:

```text
Package
├── Name
├── Price
├── Duration
├── Features
└── Book Now
```

Initially use static data.

Later make packages editable from Admin Panel.

---

# 12. Phase 10 — Contact Page

Components:

```text
contact/
├── ContactInfo.jsx
├── ContactForm.jsx
├── SocialLinks.jsx
└── Map.jsx
```

Include:

- Email
- Phone
- Location
- Instagram
- WhatsApp
- Contact form
- Map

Initially the form can be UI-only.

Later connect it to:

```text
POST /api/messages
```

---

# 13. Phase 11 — Booking Frontend

Build the booking UI before connecting MongoDB.

Recommended 4-step flow:

```text
Step 1 → Personal Details
Step 2 → Shoot Preferences
Step 3 → Date & Time
Step 4 → Review
```

Components:

```text
booking/
├── BookingProgress.jsx
├── PersonalDetails.jsx
├── ShootPreferences.jsx
├── DateTimePicker.jsx
├── PackageSelector.jsx
├── BookingReview.jsx
└── BookingSuccess.jsx
```

### Step 1 — Personal Details

Collect:

```text
Name
Email
Phone
```

### Step 2 — Shoot Preferences

Collect:

```text
Shoot Type
Location
Number of People
Style / Preferences
Special Request
Package
```

### Step 3 — Date & Time

Collect:

```text
Date
Time
```

Later this calendar will use backend availability.

### Step 4 — Review

Show everything before submission.

```text
Customer Details
+
Shoot Details
+
Date / Time
+
Package
↓
Confirm Booking
```

---

# 14. Phase 12 — Frontend Validation

Before backend integration, validate:

```text
Required fields
Email format
Phone format
Date
Time
Package selection
```

Create:

```text
utils/validation.js
```

Do not allow users to submit incomplete data.

---

# 15. Phase 13 — Responsive Design

Test:

```text
Desktop
Tablet
Mobile
```

At minimum:

```text
1920px
1440px
1024px
768px
480px
375px
```

For every page check:

- Navbar
- Images
- Typography
- Buttons
- Forms
- Gallery
- Animations
- Spacing
- Horizontal overflow

Do not leave responsiveness until the final day.

---

# 16. Phase 14 — Advanced Animations

Only after the static website works.

Recommended order:

```text
Basic CSS transitions
↓
GSAP
↓
ScrollTrigger
↓
Image reveal animations
↓
Text animations
↓
Page transitions
↓
3D / Three.js if required
```

Important:

**Animation should enhance photography, not make the website difficult to use.**

For mobile, simplify heavy animations.

---

# 17. Milestone 1 — Public Frontend Complete

At this point the following should work:

```text
Navbar
↓
Home
↓
About
↓
Portfolio
↓
Services
↓
Contact
↓
Booking UI
```

No MongoDB or authentication yet.

Once this milestone works, commit:

```bash
git add .
git commit -m "Build public photographer website"
```

---

# 18. Phase 15 — Create Backend

Create:

```text
server/
├── config/
│   └── db.js
│
├── models/
│   ├── User.js
│   ├── Booking.js
│   ├── Portfolio.js
│   ├── Package.js
│   ├── BlockedDate.js
│   └── Message.js
│
├── controllers/
│   ├── authController.js
│   ├── bookingController.js
│   ├── portfolioController.js
│   ├── packageController.js
│   ├── clientController.js
│   └── messageController.js
│
├── routes/
│   ├── authRoutes.js
│   ├── bookingRoutes.js
│   ├── portfolioRoutes.js
│   ├── packageRoutes.js
│   ├── clientRoutes.js
│   └── messageRoutes.js
│
├── middleware/
│   ├── authMiddleware.js
│   ├── adminMiddleware.js
│   └── errorMiddleware.js
│
├── utils/
│   ├── sendEmail.js
│   └── generateBookingId.js
│
├── .env
└── server.js
```

---

# 19. Phase 16 — Express Setup

Install:

```bash
npm init -y
npm install express mongoose dotenv cors
npm install bcryptjs jsonwebtoken
```

Development:

```bash
npm install -D nodemon
```

Basic backend flow:

```text
Request
  ↓
Route
  ↓
Middleware
  ↓
Controller
  ↓
Model
  ↓
MongoDB
```

Keep controllers separate from routes.

---

# 20. Phase 17 — MongoDB + Mongoose

Connect:

```text
Express
   ↓
Mongoose
   ↓
MongoDB Atlas
```

Create models.

### User

```text
name
email
password
role
```

Role:

```text
admin
```

Customer accounts are not required for V1.

---

# 21. Booking Model

Suggested fields:

```text
bookingId
name
email
phone
shootType
location
date
time
package
budget
numberOfPeople
specialRequest
status
createdAt
```

Status:

```text
pending
confirmed
completed
cancelled
```

---

# 22. Blocked Date Model

Suggested:

```text
date
type
reason
note
createdAt
```

Types:

```text
offline_booking
editing
vacation
personal
other
```

This is important because photographer availability is not based only on customer bookings.

---

# 23. Portfolio Model

Suggested:

```text
image
title
category
description
createdAt
```

Later admin can:

```text
Upload
Edit
Delete
```

---

# 24. Package Model

Suggested:

```text
name
price
duration
features
category
description
active
```

Admin can manage packages without changing frontend code.

---

# 25. Message Model

Suggested:

```text
name
email
phone
message
createdAt
status
```

---

# 26. Phase 18 — Build Booking API

Create:

```text
routes/bookingRoutes.js
controllers/bookingController.js
models/Booking.js
```

Important API:

```text
POST /api/bookings
GET  /api/bookings
GET  /api/bookings/:id
PATCH /api/bookings/:id
DELETE /api/bookings/:id
```

Public:

```text
POST /api/bookings
```

Admin-only:

```text
GET
PATCH
DELETE
```

---

# 27. Availability System

This is one of the most important parts.

Availability should check:

```text
Bookings
+
Blocked Dates
=
Unavailable Dates
```

Flow:

```text
Customer selects date
        ↓
Frontend requests availability
        ↓
Backend checks MongoDB
        ↓
Bookings + BlockedDate
        ↓
Available / Unavailable
```

Example:

```text
June 10 → Booked
June 11 → Editing
June 12 → Available
June 13 → Vacation
June 14 → Available
```

Customer should only be able to select available dates.

**Never rely only on frontend availability.**

The backend must re-check availability before creating the booking to prevent double booking.

---

# 28. Phase 19 — Connect React to Backend

Create:

```text
services/api.js
services/bookingService.js
```

Flow:

```text
Booking Form
     ↓
BookingContext
     ↓
bookingService
     ↓
Axios
     ↓
POST /api/bookings
     ↓
Express
     ↓
MongoDB
```

On success:

```text
BookingSuccess.jsx
```

---

# 29. Phase 20 — Admin Authentication

Create:

```text
/admin/login
```

Flow:

```text
Admin Login
     ↓
POST /api/auth/login
     ↓
Verify email/password
     ↓
Generate JWT
     ↓
React AuthContext
     ↓
Protected Admin Routes
```

Components:

```text
auth/
├── LoginForm.jsx
└── ProtectedRoute.jsx
```

Important:

**Frontend route protection is not enough.**

Backend must verify:

```text
Valid JWT
+
Admin role
```

before allowing admin operations.

---

# 30. Phase 21 — Admin Layout

Create:

```text
AdminLayout.jsx
```

Structure:

```text
AdminLayout
├── AdminSidebar
├── AdminHeader
└── Main Content
```

Sidebar:

```text
Dashboard
Bookings
Calendar
Clients
Portfolio
Packages
Messages
Settings
Logout
```

---

# 31. Phase 22 — Admin Dashboard

Dashboard components:

```text
AdminSidebar.jsx
AdminHeader.jsx
StatCard.jsx
RecentBookings.jsx
AdminCalendar.jsx
QuickActions.jsx
NotificationPanel.jsx
```

Stats:

```text
Total Bookings
Upcoming Bookings
Pending Bookings
Revenue
```

Dashboard flow:

```text
Admin
 ↓
GET /api/bookings
 ↓
Backend
 ↓
MongoDB
 ↓
Dashboard
```

---

# 32. Phase 23 — Booking Management

Admin should be able to:

```text
View bookings
View booking details
Confirm booking
Cancel booking
Mark completed
Delete booking
```

Components:

```text
BookingTable.jsx
BookingRow.jsx
BookingDetails.jsx
```

Suggested status flow:

```text
Pending
  ↓
Confirmed
  ↓
Completed

Pending
  ↓
Cancelled
```

---

# 33. Phase 24 — Admin Calendar

Admin calendar should show:

```text
Customer Booking
Editing
Vacation
Personal Day
Offline Booking
```

Example:

```text
June 10 → Wedding Booking
June 11 → Editing
June 12 → Available
June 13 → Vacation
```

Components:

```text
AdminCalendar.jsx
CalendarEvent.jsx
BlockedDayModal.jsx
```

---

# 34. Phase 25 — Block / Unblock Dates

Admin can select:

```text
Date
Type
Reason
Note
```

Example:

```text
Date: 15 June
Type: Vacation
Note: Family trip
```

Flow:

```text
Admin
 ↓
BlockedDayModal
 ↓
POST /api/blocked-dates
 ↓
MongoDB
 ↓
Calendar
 ↓
Customer availability
```

---

# 35. Phase 26 — Portfolio Management

Admin features:

```text
Add image
Edit title
Change category
Delete image
```

Flow:

```text
Admin Portfolio
      ↓
Upload Image
      ↓
Image Storage
      ↓
MongoDB stores URL
      ↓
Public Portfolio
```

Use Cloudinary/ImageKit for production instead of storing large images directly in MongoDB.

---

# 36. Phase 27 — Package Management

Admin can:

```text
Create package
Edit package
Delete package
Activate / deactivate package
Change price
Change features
```

Public services page reads active packages from API.

---

# 37. Phase 28 — Contact Messages

Flow:

```text
Contact Form
    ↓
POST /api/messages
    ↓
MongoDB
    ↓
Admin Messages
```

Admin can:

```text
View
Mark as read
Delete
```

---

# 38. Phase 29 — Email Notifications

Add email after the core system is stable.

Possible notifications:

### Customer

```text
Booking Received
Booking Confirmed
Booking Cancelled
```

### Photographer

```text
New Booking
New Contact Message
```

Do not implement email first. Get the database and booking flow working first.

---

# 39. Phase 30 — Security

Before deployment, check:

```text
JWT authentication
Password hashing
Admin authorization
Environment variables
Input validation
CORS
Rate limiting
Error handling
MongoDB security
```

Never put:

```text
MongoDB URI
JWT secret
API keys
Email credentials
```

inside frontend code.

Use `.env`.

---

# 40. Phase 31 — Testing

Test the complete customer flow:

```text
Open Website
 ↓
Browse Portfolio
 ↓
View Services
 ↓
Open Booking
 ↓
Fill Details
 ↓
Select Available Date
 ↓
Review
 ↓
Submit
 ↓
Booking Saved
 ↓
Success Page
```

Test admin:

```text
Login
 ↓
Dashboard
 ↓
View Booking
 ↓
Confirm Booking
 ↓
Calendar Updates
```

Test blocked date:

```text
Admin blocks date
 ↓
Calendar updates
 ↓
Customer cannot select date
```

Test double booking:

```text
Customer A selects date
Customer B tries same date
 ↓
Backend re-checks availability
 ↓
Second booking rejected
```

---

# 41. Phase 32 — Performance

Before deployment:

- Compress large images
- Use WebP/AVIF where appropriate
- Lazy-load portfolio images
- Optimize videos
- Avoid unnecessarily large 3D models
- Remove unused packages
- Minimize unnecessary API requests
- Test mobile performance

Photography websites can become very heavy, so image/video optimization is extremely important.

---

# 42. Phase 33 — Deployment

Recommended architecture:

```text
                    USERS
                      │
                      ▼
              Vercel Frontend
                      │
                  HTTPS API
                      │
                      ▼
             Render / Railway
                  Backend
                      │
                      ▼
                MongoDB Atlas
                      │
              ┌───────┴───────┐
              ▼               ▼
        ImageKit/         Email Service
        Cloudinary
```

Set production environment variables separately.

---

# 43. Git Workflow

Create meaningful commits.

Example:

```bash
git add .
git commit -m "setup react project"

git add .
git commit -m "build public layout"

git add .
git commit -m "build portfolio page"

git add .
git commit -m "build booking form"

git add .
git commit -m "setup express backend"

git add .
git commit -m "add booking api"

git add .
git commit -m "add admin authentication"

git add .
git commit -m "build admin dashboard"
```

Avoid:

```text
final
final2
final_latest
final_latest2
```

---

# 44. Recommended Git Milestones

### Milestone 1

```text
React setup
Navbar
Footer
Routing
```

### Milestone 2

```text
Home
About
Portfolio
Services
Contact
```

### Milestone 3

```text
Booking UI
Validation
Responsive design
```

### Milestone 4

```text
GSAP
ScrollTrigger
Advanced animations
```

### Milestone 5

```text
Express
MongoDB
Mongoose
```

### Milestone 6

```text
Booking API
Availability
Frontend API integration
```

### Milestone 7

```text
JWT
Admin Login
Protected Routes
```

### Milestone 8

```text
Dashboard
Bookings
Calendar
Blocked Dates
```

### Milestone 9

```text
Portfolio Manager
Packages
Messages
```

### Milestone 10

```text
Email
Security
Testing
Optimization
Deployment
```

---

# 45. What NOT to Build Initially

Avoid overengineering V1.

Do NOT start with:

```text
Redux
Microservices
WebSockets
Complex analytics
Payment gateway
Customer accounts
AI chatbot
Complex role system
Real-time notifications
```

Build the core product first.

You can add these later if the client actually needs them.

---

# 46. Final Feature Set

## Public

```text
✓ Home
✓ About
✓ Portfolio
✓ Services
✓ Packages
✓ Contact
✓ Booking
✓ Availability
✓ Responsive design
✓ Animations
```

## Booking

```text
✓ Guest booking
✓ Personal details
✓ Shoot details
✓ Package selection
✓ Date/time selection
✓ Availability check
✓ Review
✓ Booking confirmation
```

## Admin

```text
✓ Admin login
✓ Dashboard
✓ Booking management
✓ Calendar
✓ Blocked dates
✓ Client information
✓ Portfolio management
✓ Package management
✓ Messages
✓ Settings
```

## Backend

```text
✓ Express
✓ MongoDB
✓ Mongoose
✓ JWT
✓ Password hashing
✓ REST APIs
✓ Validation
✓ Error handling
```

---

# 47. The Most Important Development Rule

Do not jump randomly between frontend, backend and admin.

Follow:

```text
STATIC UI
   ↓
FUNCTIONAL UI
   ↓
BACKEND
   ↓
DATABASE
   ↓
API INTEGRATION
   ↓
AUTHENTICATION
   ↓
ADMIN
   ↓
ADVANCED FEATURES
   ↓
TESTING
   ↓
DEPLOYMENT
```

---

# 48. Your First Task

Start ONLY with:

```text
1. Create Vite React project
2. Install React Router
3. Create folder structure
4. Create Navbar
5. Create Footer
6. Create PublicLayout
7. Create AppRoutes
8. Create empty pages
9. Make all public routes work
```

Your first working navigation should be:

```text
/
├── /about
├── /portfolio
├── /services
├── /book
└── /contact
```

Once this works, start designing the **Home page**.

**Do not start MongoDB, JWT or Admin Dashboard yet.**

---

# 49. Final Project Flow

```text
                    PHOTOGRAPHER
                         │
                         ▼
                  PUBLIC WEBSITE
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
   Portfolio          Services          About
       │                 │                 │
       └─────────────────┼─────────────────┘
                         ▼
                     BOOKING
                         │
                         ▼
                  Availability Check
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
           Bookings            Blocked Dates
              │                     │
              └──────────┬──────────┘
                         ▼
                      MongoDB
                         │
                         ▼
                   ADMIN PANEL
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
    Bookings          Calendar         Portfolio
        │                │                │
        ▼                ▼                ▼
     Clients       Block Dates        Packages
                         │
                         ▼
                  Photographer
```

## Build Principle

**First make it look good.  
Then make it work.  
Then make it secure.  
Then make it fast.  
Then deploy it.**
