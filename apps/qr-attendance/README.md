# QR Attendance System

A production-grade QR-based attendance management system built with Next.js 14, Prisma, and PostgreSQL.

## Features

- QR code generation (PNG, bulk ZIP download)
- Camera-based QR scanning (html5-qrcode)
- USB HID barcode/QR scanner support
- CSV and Excel student import
- Slot-based attendance (Morning/Afternoon)
- Atomic duplicate prevention (ON CONFLICT DO NOTHING)
- JWT auth with httpOnly cookies
- CSV export with date/slot/department filters
- Real-time attendance dashboard

## Quick Start (Local Development)

### Prerequisites
- Node.js 20+
- PostgreSQL 14+

### Setup

```bash
# 1. Install dependencies
cd apps/qr-attendance
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your DATABASE_URL and a strong JWT_SECRET:
# openssl rand -base64 32

# 3. Create database and run migrations
npm run db:push

# 4. Seed default data
npm run db:seed

# 5. Start development server
npm run dev
```

Open http://localhost:3001

### Default Login
- **Email:** admin@attendance.local
- **Password:** Admin@1234

## Docker Setup

```bash
# Start everything (PostgreSQL + App)
docker-compose up --build

# With custom secrets
JWT_SECRET=$(openssl rand -base64 32) DB_PASSWORD=mypassword docker-compose up --build
```

The app will be available at http://localhost:3001

## Usage Workflow

### 1. Upload Students
- Navigate to **Admin → Students → Upload Students**
- Download the CSV template
- Fill in student data (name is required, student_id auto-generated if blank)
- Upload CSV or XLSX file
- Review import results

### 2. Generate QR Codes
- Navigate to **Admin → QR Codes**
- Click **"Generate for All (Without QR)"**
- Download individual QR PNGs or bulk ZIP
- Print and distribute to students

### 3. Configure Slots
- Navigate to **Admin → Config**
- Set Morning and Afternoon time ranges
- Times are in IST (UTC+5:30) 24-hour format

### 4. Register Scanner Devices
- Navigate to **Admin → Devices**
- Click **"Add Device"** with a label and location
- Copy the generated device key
- Enter the key in the Scanner page settings

### 5. Scan Attendance
- Open **/scan** (scanner interface, mobile-optimized)
- Click the settings gear icon, enter the device key
- Point camera at student QR code, or use a USB HID barcode scanner
- Results:
  - **GREEN - PRESENT**: Successfully marked
  - **YELLOW - ALREADY MARKED**: Duplicate scan
  - **RED - OUTSIDE SLOT**: No active slot for current time
  - **RED - INVALID/UNKNOWN**: Invalid or unlinked QR

### 6. Export Attendance
- Navigate to **Admin → Attendance**
- Select date and slot filter
- Click **Export CSV** or use **Advanced Export** for date ranges

## CSV Format

```csv
name,email,phone,department,batch,section,student_id
John Doe,john@example.com,9876543210,Computer Science,2024,A,B20240001
Jane Smith,jane@example.com,9876543211,Electronics,2024,B,
```

- `name` — required
- `email` — optional, must be unique
- `phone` — optional
- `department` — optional
- `batch` — optional (year of joining)
- `section` — optional
- `student_id` — optional, auto-generated as `B{year}{seq:04d}` if blank

## API Reference

### Public (no auth)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/scan/mark | Mark attendance (requires device_key) |
| GET | /api/scan/status | Current slot and today's counts |

### Admin (requires session cookie)
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/logout | Logout |
| GET | /api/admin/students | List students |
| POST | /api/admin/students/upload | Import CSV/XLSX |
| GET | /api/admin/students/:id | Student detail |
| PATCH | /api/admin/students/:id | Update student |
| POST | /api/admin/qr/generate | Generate QR tokens |
| GET | /api/admin/qr/student/:id | Get QR PNG |
| GET | /api/admin/qr/download/zip | Download all QRs as ZIP |
| GET | /api/admin/attendance | List attendance records |
| GET | /api/admin/attendance/export | Export CSV |
| GET | /api/admin/attendance/summary | Daily summary stats |
| GET | /api/admin/config/slots | Get slot configs |
| PATCH | /api/admin/config/slots | Update slot timing |
| GET | /api/admin/devices | List devices |
| POST | /api/admin/devices | Create device |
| PATCH | /api/admin/devices | Update/toggle device |

### Scan API Request Format
```json
POST /api/scan/mark
{
  "qr_payload": "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
  "device_key": "your-device-key-uuid"
}
```

## Architecture

- **Next.js 14** App Router with Server Components
- **Prisma** ORM with PostgreSQL
- **jose** JWT (httpOnly cookies, 8h expiry)
- **bcryptjs** password hashing (12 rounds)
- **Atomic inserts** via `ON CONFLICT DO NOTHING` for concurrency safety
- **Student IDs** generated via atomic DB sequence
- **IST timezone** for all slot/date calculations

## Production Deployment

1. Set strong `JWT_SECRET` (min 32 chars): `openssl rand -base64 32`
2. Use a managed PostgreSQL database
3. Run `npm run db:migrate` to apply migrations
4. Run `npm run db:seed` once for initial data
5. Build: `npm run build`
6. Start: `npm start`
