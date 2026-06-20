# ZyphraPOS — AI-Powered Business Growth Platform

> A world-class SaaS landing page for ZyphraPOS, built for Sri Lankan businesses. Features GSAP animations, glassmorphism UI, interactive calculators, AI chat demo, and a fully responsive dark-theme design.

![ZyphraPOS](https://img.shields.io/badge/ZyphraPOS-Landing%20Page-00AEEF?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=for-the-badge&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite)
![GSAP](https://img.shields.io/badge/GSAP-ScrollTrigger-88CE02?style=for-the-badge)

---

## What Is ZyphraPOS?

ZyphraPOS is an all-in-one AI-powered Point of Sale and Business Growth Platform designed for Sri Lankan SMEs — restaurants, retail stores, pharmacies, and hardware shops. This repository contains the **marketing landing page** for the product.

---

## Features of This Landing Page

| Section | Description |
|---|---|
| **Hero** | Full-screen headline with live dashboard mockup |
| **Problem Calculator** | Interactive profit-leak calculator with business presets (Restaurant, Retail, Pharmacy, Hardware) |
| **Features Grid** | 15 platform features with live video wallpaper background |
| **Feature Showcase** | Tabbed UI demo — Billing, Inventory, CRM, WhatsApp, Analytics |
| **WhatsApp Automation** | Animated flow diagram showing the automation pipeline |
| **AI Insights Chat** | Functional chat demo with pre-built business Q&A |
| **Comparison Table** | ZyphraPOS vs. traditional methods side-by-side |
| **Pricing** | 3 fixed plans + interactive custom plan builder with live price counter |
| **Scarcity Section** | Live countdown timer + slot availability indicators |
| **Free Analysis CTA** | Lead capture form with business-specific fields |
| **Footer** | Full footer with links, social icons, legal |
| **Floating WhatsApp** | Fixed bottom-right WhatsApp chat button with pulse animation |
| **PillNav** | Animated floating pill navigation with GSAP hover effects |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite 7 |
| Styling | Tailwind CSS v4 |
| Animations | GSAP 3 + ScrollTrigger |
| Routing | Wouter |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| Icons | Lucide React |
| Package manager | pnpm (workspace monorepo) |
| Runtime | Node.js 24 |

---

## Design System

- **Background:** `#050505` (near-black)
- **Primary:** `#00AEEF` (electric blue)
- **Accent red:** `#ef4444`
- **Accent green:** `#4ade80`
- **Style:** Glassmorphism cards, dark theme (forced), GSAP scroll animations
- **Typography:** System sans-serif, black/extrabold weights for headlines
- **No emojis** anywhere in the UI

---

## Project Structure

```
artifacts/
└── zyphrapos/                  # Main landing page app
    ├── public/
    │   └── features-bg.mp4     # Live wallpaper video (features section)
    ├── src/
    │   ├── components/
    │   │   ├── PillNav.tsx          # Animated floating pill navigation
    │   │   ├── PillNav.css          # PillNav styles
    │   │   ├── HeroSection.tsx      # Hero with live dashboard mockup
    │   │   ├── StatsSection.tsx     # Key stats bar
    │   │   ├── ProblemSection.tsx   # Profit-leak calculator
    │   │   ├── FeaturesSection.tsx  # Features grid + video background
    │   │   ├── FeatureShowcase.tsx  # Tabbed product demo
    │   │   ├── WhatsAppSection.tsx  # Automation flow diagram
    │   │   ├── AIInsightsSection.tsx # AI chat demo
    │   │   ├── ComparisonSection.tsx # vs. traditional comparison
    │   │   ├── PricingSection.tsx   # Plans + custom builder
    │   │   ├── ScarcitySection.tsx  # Countdown + urgency
    │   │   ├── FreeAnalysisSection.tsx # Lead form
    │   │   ├── FinalCTA.tsx         # Bottom CTA
    │   │   ├── WhatsAppFloat.tsx    # Floating WhatsApp button
    │   │   └── Footer.tsx           # Site footer
    │   ├── pages/
    │   │   └── Home.tsx             # Assembles all sections
    │   └── App.tsx
    ├── vite.config.ts
    └── package.json
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install

```bash
pnpm install
```

### Run Development Server

```bash
pnpm --filter @workspace/zyphrapos run dev
```

The site will be available at `http://localhost:3000` (or the `PORT` env var).

### Build for Production

```bash
pnpm --filter @workspace/zyphrapos run build
```

Output goes to `artifacts/zyphrapos/dist/public`.

---

## Configuration

### WhatsApp Button

Update the phone number and pre-filled message in `src/components/WhatsAppFloat.tsx`:

```ts
const WHATSAPP_NUMBER = "94771234567"; // Your WhatsApp business number (international format)
const WHATSAPP_MESSAGE = "Hi! I'd like to book a free demo of ZyphraPOS.";
```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Dev server port | `3000` |
| `BASE_PATH` | URL base path (for reverse proxies) | `/` |

---

## Deployment

The project includes deployment configs for:

- **Vercel:** `vercel.json` at repo root
- **Netlify:** `netlify.toml` at repo root

For Vercel:
```bash
vercel --prod
```

For Netlify, connect the repo and set the build command to:
```
pnpm --filter @workspace/zyphrapos run build
```
Publish directory: `artifacts/zyphrapos/dist/public`

---

## Responsive Design

Fully responsive across:
- Mobile (320px+)
- Tablet (768px+)
- Desktop (1280px+)

Mobile-specific features:
- Hamburger menu with GSAP animation
- Full-width stacked CTAs
- Touch-friendly targets (min 44px)
- Horizontally scrollable feature tabs

---

## License

This project is proprietary. All rights reserved by ZyphraPOS.

---

*Built with React, GSAP, and Tailwind CSS.*
