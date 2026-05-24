---
name: testing-padel-mgr
description: Test the Padel MGR v15 court management app end-to-end. Use when verifying UI, QR payment, export, PWA, or license features.
---

# Testing Padel MGR v15

## Overview
Padel MGR v15 is a single-file HTML application (`index.html`) for managing padel courts. It uses LocalStorage for data, runs entirely client-side, and is deployed via GitHub Pages.

## How to Run Locally
- Open `file:///path/to/padel-mgr/index.html` in Chrome
- The app requires a license key + club name on first use. Generate keys via `keygen.html` or browser console: `generateLicenseKey('Club Name')`
- After license activation, set a password (min 4 chars) for app protection
- Test credentials: Club name `Test Club`, generate key via keygen.html

## App Structure
- **Single HTML file** (`index.html`, ~3200+ lines) — all CSS, JS, and HTML in one file
- **7 navigation tabs**: Bookings, Academy, Closing, History, Customers, Statistics, Settings
- **PWA files**: `manifest.json`, `sw.js`, `icon-192.png`, `icon-512.png`
- **License generator**: `keygen.html` (local-only, not deployed)

## Key Test Scenarios

### 1. UI Scaling Verification
- Check CSS computed values via browser console:
  ```js
  getComputedStyle(document.querySelector('.nbtn .nico')).fontSize  // expect 22px+ (24px on desktop)
  getComputedStyle(document.querySelector('.nbtn')).fontSize         // expect 10px+ (12px on desktop)
  getComputedStyle(document.documentElement).getPropertyValue('--nav-h') // expect 72px
  ```
- Desktop media query (`@media min-width:900px`) applies larger values
- Verify all 7 nav tab labels are readable and not truncated

### 2. QR Payment Wallet Configuration
- Navigate to Settings tab → scroll to "الدفع الإلكتروني (QR Code)" card
- Select wallet type (Vodafone/InstaPay/etc), enter number and name
- Click "حفظ بيانات الدفع ✓" → verify toast + QR preview renders
- QR info text should show wallet type and owner name

### 3. Payment QR in Booking Receipt
- Prerequisites: Wallet must be configured in Settings first
- Create a booking via "+" button on Bookings tab
- Click the booking card to open receipt modal
- Verify "💳 ادفع إلكترونياً" section appears with QR code

### 4. Quick Export from Manual Closing
- Navigate to Closing tab → click "🧮 حساب يدوي" mode toggle
- Enter Cash and Visa values in the "الإدخال الفعلي" section
- Scroll to "📤 تصدير سريع (بدون حجوزات)" section at bottom
- Click Excel/PDF/Image buttons → verify file downloads + toast

### 5. PWA Verification
- On HTTPS (GitHub Pages): Check DevTools → Application tab for manifest and service worker
- On file:// protocol: Service worker won't register (expected). Verify files exist:
  - `manifest.json` with name, display:standalone, icons
  - `sw.js` with cache-first strategy
  - `icon-192.png` and `icon-512.png`

### 6. Console Errors Check
- Navigate through all 7 tabs via clicking nav buttons
- Check browser console for JavaScript errors (should be zero)

## Navigation Tips
- The Closing tab has two modes: "📋 من الحجوزات" (from bookings) and "🧮 حساب يدوي" (manual). The mode toggle buttons are at the TOP of the closing tab — you may need to scroll up to see them.
- The closing tab is the 3rd tab in the nav bar (💰التقفيل). Be careful — clicking nearby tabs (العملاء, السجل) might navigate to the wrong tab. Use browser console `document.querySelectorAll('.nbtn')[2].click()` for reliable tab switching.
- Arabic text input via `type` tool may not render correctly. Use browser console to set values: `document.getElementById('fieldId').value = 'Arabic text'`

## Devin Secrets Needed
No secrets required — the app runs entirely client-side with LocalStorage.

## Known Considerations
- Service worker only works on HTTPS (GitHub Pages), not on file:// protocol
- License keys are generated client-side; the LICENSE_SECRET is obfuscated in the code
- Each browser/device has independent LocalStorage data
- The app is RTL (right-to-left) Arabic interface
