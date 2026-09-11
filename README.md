# Shop OS

Simple shop management & fast billing (MERN).

> **Dukaan chalao. Data entry nahi.**

## Stack

| Layer | Tech |
|-------|------|
| Web | React 19 + TypeScript + Vite + Tailwind + PWA |
| API | Node.js + Express + TypeScript |
| DB | MongoDB + Mongoose |
| Shared | Zod schemas + types (`packages/shared`) |

## Monorepo

```
apps/web          React app (POS UI)
apps/api          Express API
packages/shared   Shared Zod schemas, types, constants
```

## Setup

```bash
npm install
cp apps/api/.env.example apps/api/.env
# Start MongoDB locally, then:
npm run dev:api
npm run dev:web
```

- Web: http://localhost:5173  
- API health: http://localhost:4000/api/health  

## Build phases (from product spec)

0. Foundation ✓  
1. Auth / Shop / Membership ✓  
2. Products (Quick Add, Add & Sell) ✓  
3–4. Billing + Payments ✓  
5. Inventory ✓  
6. Customers / Udhaar ✓  
7. Reports / Expenses ✓  
8. Invoice / Sharing ✓  
9. Staff / Privacy ✓  
10. CSV import ✓  
11. Offline queue + sync banner ✓  
12. Supplier / Purchase ✓  
13. AI stubs (review-required) ✓  
14. Rate limit + audit hardening ✓  

```bash
npm run test -w @shop-os/api
npm run build
```

## Key UX

- Login OTP (dev OTP on screen, never logged)
- Naya Bill → Cash / UPI / Udhaar → Print / WhatsApp / Don't Send
- Products CSV import, Quick items, Add & Sell
- Offline sales queued in IndexedDB, sync on reconnect
- Cashier cannot see purchase cost / profit
"# Shop-OS" 
