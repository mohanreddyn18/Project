# Sightline Vision Suite

An integrated 6-module multimodal computer vision, audio emotion, and 3D spatial inspection workstation built with **React**, **TypeScript**, **Three.js**, **Motion**, **Tailwind CSS**, **Express**, and the **Google GenAI SDK (`@google/genai`)**.

---

## Table of Contents

- [Overview](#overview)
- [Implemented Modules (All 6 Tasks)](#implemented-modules-all-6-tasks)
- [3D Spatial & Interactive UI Features](#3d-spatial--interactive-ui-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Endpoints](#api-endpoints)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Available Scripts](#available-scripts)

---

## Overview

**Sightline Vision Suite** unifies six real-time visual and acoustic recognition models inside a single workstation shell. Every analysis request is processed server-side through Express (`/api/analyze/*`) using structured JSON schemas with automatic retry and fallback resilience, while the client renders interactive **2D bounding-box overlays**, **Three.js 3D volumetric spatial views**, **video keyframe timelines**, **live webcam feeds**, **real-time Web Audio visualizers**, and **pop-up safety alerts**.

---

## Implemented Modules (All 6 Tasks)

### 01. Car Colour & Traffic Signal Detection
- **Input:** Traffic scene image upload, drag-and-drop, or built-in sample scene.
- **Behaviour:**
  - Identifies vehicle types and exterior paint colours near traffic signals.
  - Renders **red rectangles** for **blue cars** and **blue rectangles** for **all other car colours**.
  - Detects and counts pedestrians/people present at the signal (toggleable amber boxes).
  - Interactive filter tabs (`All`, `Blue`, `Other`) and clickable vehicle inspection table synced with both 2D and 3D viewports.

### 02. Multi-Species Animal Detection
- **Input:** Image mode (upload, drag-and-drop, sample wildlife scene) and **Video mode** (upload video, multi-frame timeline scanner, frame scrubber & playback).
- **Behaviour:**
  - Detects multiple animals in a single frame and distinguishes between species and diet classifications (`carnivore`, `herbivore`, `omnivore`).
  - Highlights **carnivorous animals in red** and non-carnivores in green.
  - Displays a **pop-up alert modal** reporting the exact count and species of detected carnivorous animals.

### 03. Emotion Detection through Voice
- **Input:** Audio file upload / drag-and-drop (`WAV`, `MP3`, `OGG`, `WebM`, `M4A`) and **live microphone voice recording**.
- **Behaviour:**
  - **Female Voice Exclusive Gate:** Evaluates the speaker's vocal profile first. If a non-female voice or non-speech audio is provided, emotion prediction is blocked and a prompt instructs the user to upload or record a **female voice** instead.
  - When a female voice is confirmed, outputs the predicted emotion, confidence meter, speech transcript, and acoustic cues across a **3-Stage Verification Pipeline**.
  - Includes dual real-time visualizers: **2D Wave** (oscilloscope & frequency bars with peak caps) and **3D Harmonic** (Three.js instanced 3D frequency pillars).

### 04. Nationality & Conditional Attribute Detection
- **Input:** Portrait image upload, drag-and-drop, or built-in sample portrait.
- **Behaviour:**
  - Predicts the subject's nationality group and facial emotion, then unlocks conditional output attributes strictly according to regional rules (enforced both on the backend and highlighted in the live **Conditional Output Matrix**):
    - **Indian:** Nationality, Emotion, Age, Dress Colour
    - **United States:** Nationality, Age, Emotion *(only)*
    - **African:** Nationality, Emotion, Dress Colour *(only)*
    - **Other:** Nationality, Emotion *(only)*

### 05. Sign Language Detection
- **Input:** Image upload mode and **Real-Time Webcam Video mode** (manual frame capture or continuous auto-recognition every `3.5s`).
- **Behaviour:**
  - Recognizes sign language gestures and known vocabulary (`Hello`, `Thank You`, `Yes`, `No`, `Please`, `Sorry`, `Help`, `I Love You`, `Stop`, `Good`, etc.) with gesture descriptions and close matches.
  - **Scheduled Operational Window (6:00 PM – 10:00 PM / `18:00–22:00`):** Automatically enforces the evening operating schedule on both client and server, accompanied by a live 24-hour timeline bar and an explicit **`Simulate 6:00 PM – 10:00 PM Window (Testing)`** toggle for evaluation outside active hours.

### 06. Vehicle Drowsiness Detection
- **Input:** Image mode (upload, drag-and-drop, sample vehicle cabin) and **Video mode** (dashcam/cabin video frame scanner).
- **Behaviour:**
  - Detects multiple occupants inside a vehicle cabin (driver and passengers), counting total people, awake count, and sleeping count.
  - Highlights **sleeping occupants in red** with their **predicted age** (and awake occupants in green).
  - Triggers a **pop-up alert modal** displaying the number of sleeping people and each sleeping individual's estimated age.

---

## 3D Spatial & Interactive UI Features

- **2D Overlay / 3D Spatial Viewport (`SpatialDetectionCanvas3D`):**
  - Switch any image inspection viewport between `2D Overlay` (with `1.0x`/`1.35x` zoom and label toggles) and `3D Spatial` powered by **Three.js**.
  - Projects the analyzed image onto a multi-part titanium optical calibration rig with `RoomEnvironment` PBR reflections and three-point studio lighting.
  - Extrudes bounding boxes into translucent volumetric 3D prisms with corner depth tethers, floating canvas callout plaques, raycasted click-to-highlight synchronization, `Iso 3D` / `Front` / `Side Depth` camera presets, an **Exploded Depth** slider (`0%–100%`), auto-orbit toggle, and an animated 3D scan plane during analysis.
- **3D Acoustic Harmonic Stage (`AudioSpectrum3D`):**
  - Renders 32 beveled `InstancedMesh` frequency columns with falling peak caps driven in real time by the Web Audio `AnalyserNode`.
- **Global Bottom Status Bar (`GlobalStatusBar`):**
  - Displays real-time Camera and Microphone permission/stream states alongside consolidated detection totals across all 6 modules, complete with an expandable per-module breakdown popover and session counter reset.
- **Tactile Workstation Shell:**
  - Obsidian 3D navigation rail, sculpted surface depth (`TactileCard` pointer micro-tilt), animated scan beams, and `prefers-reduced-motion`-aware transitions via `MotionConfig`.

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Motion (`motion/react`), Lucide React |
| **3D & Audio/Video** | Three.js (`OrbitControls`, `RoomEnvironment`, `InstancedMesh`), WebGL2, Web Audio API, MediaRecorder API, HTML5 Canvas |
| **Backend** | Node.js, Express 4, `tsx`, `dotenv` |
| **AI Inference** | `@google/genai` (`gemini-4-hydrogen` primary with automatic retry & `gemini-3.1-flash-lite` fallback) |

---

## Project Structure

```text
├── .env.example
├── index.html
├── metadata.json
├── package.json
├── server.ts                          # Express + Vite middleware server & 6 Gemini API routes
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── App.tsx                        # Main workspace shell, shortcuts & module routing
    ├── index.css                      # Tailwind v4 theme, 3D surface tokens & optical grid
    ├── main.tsx
    ├── assets/images/                 # Built-in sample traffic, wildlife, portrait, sign & cabin images
    ├── types/vision.ts                # Shared TypeScript interfaces for all 6 models
    ├── utils/
    │   ├── media.ts                   # Base64, URL loading & video frame extraction helpers
    │   └── webgl.ts                   # WebGL capability check, software-WebGL guard & frame pacing
    └── components/
        ├── AlertModal.tsx             # Carnivore & Drowsiness pop-up alert modal
        ├── AnimatedNumber.tsx         # Smooth numeric counter animation
        ├── AudioSpectrum3D.tsx        # Three.js 3D harmonic spectrum visualizer
        ├── BoundingBoxOverlay.tsx     # Interactive 2D bounding boxes & focus rings
        ├── GlobalStatusBar.tsx        # Bottom hardware & consolidated detection status bar
        ├── InspectionViewport.tsx     # Unified 2D Overlay / 3D Spatial viewport stage
        ├── InteractiveDropZone.tsx    # Drag-and-drop file upload overlay
        ├── ScanBeamOverlay.tsx        # Animated optical scan sweep overlay
        ├── SpatialDetectionCanvas3D.tsx # Three.js 3D volumetric detection rig
        ├── TactileCard.tsx            # 3D perspective micro-tilt card container
        ├── VideoFrameAnalyzer.tsx     # Multi-frame video scanner & timeline scrubber
        └── modules/
            ├── CarColorModule.tsx
            ├── AnimalDetectionModule.tsx
            ├── VoiceEmotionModule.tsx
            ├── NationalityModule.tsx
            ├── SignLanguageModule.tsx
            └── DrowsinessModule.tsx
```

---

## Getting Started

### Prerequisites

- **Node.js** `v20+` (or `v22+`)
- A valid **Gemini API Key**

### Installation & Local Setup

1. **Clone the repository and install dependencies:**
   ```bash
   git clone <your-repository-url>
   cd <your-repository-folder>
   npm install
   ```

2. **Configure environment variables:**
   Create a `.env` file based on `.env.example`:
   ```env
   GEMINI_API_KEY="your_gemini_api_key_here"
   APP_URL="http://localhost:3000"
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

4. **Build and run in production:**
   ```bash
   npm run build
   NODE_ENV=production npm start
   ```

> **Note:** Real-Time Webcam (Module 05) and Live Voice Recording (Module 03) require browser Camera/Microphone permissions over `localhost` or `HTTPS`.

---

## API Endpoints

All endpoints accept JSON payloads and return typed JSON responses on port `3000`:

| Method & Path | Module | Input Payload |
| :--- | :--- | :--- |
| `POST /api/analyze/car-color` | Car Colour Detection | `{ imageBase64, mimeType }` |
| `POST /api/analyze/animals` | Animal Detection | `{ imageBase64, mimeType }` |
| `POST /api/analyze/voice-emotion` | Voice Emotion Detection | `{ audioBase64, mimeType }` |
| `POST /api/analyze/nationality` | Nationality Detection | `{ imageBase64, mimeType }` |
| `POST /api/analyze/sign-language` | Sign Language Detection | `{ imageBase64, mimeType, clientHour, overrideWindow }` |
| `POST /api/analyze/drowsiness` | Drowsiness Detection | `{ imageBase64, mimeType }` |

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+1` / `Alt+1` | Switch to **01. Car Colour Detection** |
| `Ctrl+2` / `Alt+2` | Switch to **02. Animal Detection** |
| `Ctrl+3` / `Alt+3` | Switch to **03. Voice Emotion** |
| `Ctrl+4` / `Alt+4` | Switch to **04. Nationality Detection** |
| `Ctrl+5` / `Alt+5` | Switch to **05. Sign Language** |
| `Ctrl+6` / `Alt+6` | Switch to **06. Drowsiness Detection** |
| `Escape` | Close mobile navigation drawer |

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Express + Vite development server on port `3000` |
| `npm run build` | Builds the production Vite client bundle into `dist/` |
| `npm start` | Starts the production Node/Express server (`node server.ts`) |
| `npm run lint` | Runs TypeScript type-checking (`tsc --noEmit`) |
| `npm run clean` | Removes `dist/` and compiled artifacts |
