# Chatsie: Enterprise-Grade Web Conferencing & Collaboration Platform

Chatsie is a highly optimized, production-ready, real-time video conferencing application designed to replicate and improve upon the feature set of platforms like Google Meet and Zoom. Utilizing a state-of-the-art WebRTC Selective Forwarding Unit (SFU) architecture powered by LiveKit, Chatsie supports ultra-low latency audio/video streaming, interactive real-time whiteboards/chats, live transcription, dynamic windowed Picture-in-Picture (PiP), and secure room access policies.

---

## Table of Contents

- [1. System Architecture](#1-system-architecture)
  - [1.1. High-Level Topology](#11-high-level-topology)
  - [1.2. Media Flow Pipeline (WebRTC SFU)](#12-media-flow-pipeline-webrtc-sfu)
  - [1.3. Real-Time Signaling (Socket.io)](#13-real-time-signaling-socketio)
- [2. Comprehensive Feature Set](#2-comprehensive-feature-set)
  - [2.1. Dynamic Media Controls](#21-dynamic-media-controls)
  - [2.2. Smart Screen Sharing (Anti-Mirroring)](#22-smart-screen-sharing-anti-mirroring)
  - [2.3. Document Picture-in-Picture (PiP)](#23-document-picture-in-picture-pip)
  - [2.4. Push-to-Talk (PTT) Mechanism](#24-push-to-talk-ptt-mechanism)
  - [2.5. Intelligent Muted Typing Suggestion](#25-intelligent-muted-typing-suggestion)
  - [2.6. Real-Time Speech Recognition & Transcription](#26-real-time-speech-recognition--transcription)
  - [2.7. Secure Lobby, Waiting Room & Passcodes](#27-secure-lobby-waiting-room--passcodes)
- [3. Codebase Directory Map](#3-codebase-directory-map)
- [4. Database Schema (Supabase)](#4-database-schema-supabase)
- [5. Environment Configuration](#5-environment-configuration)
  - [5.1. Backend Environment Variables (`backend/.env`)](#51-backend-environment-variables-backendenv)
  - [5.2. Frontend Environment Variables (`frontend/.env`)](#52-frontend-environment-variables-frontendenv)
- [6. Installation & Local Development Setup](#6-installation--local-development-setup)
  - [6.1. Backend Service Initialization](#61-backend-service-initialization)
  - [6.2. Frontend Application Initialization](#62-frontend-application-initialization)
- [7. Production Build & Deployment](#7-production-build--deployment)
  - [7.1. Railway Deployment Config](#71-railway-deployment-config)
  - [7.2. Frontend Production Bundling](#72-frontend-production-bundling)
- [8. API Specification](#8-api-specification)
  - [8.1. Token & Authentication Endpoints](#81-token--authentication-endpoints)
  - [8.2. Meeting Lifecycle Endpoints](#82-meeting-lifecycle-endpoints)
- [9. Real-Time Signaling & Web Socket Events](#9-real-time-signaling--web-socket-events)
- [10. Keyboard Shortcuts Guide](#10-keyboard-shortcuts-guide)
- [11. Troubleshooting & Support](#11-troubleshooting--support)

---

## 1. System Architecture

Chatsie uses a hybrid architecture combining centralized control servers, distributed databases, authentication providers, and a scalable WebRTC media server network. 

```
                                      +-------------------------+
                                      |    Clerk Identity       |
                                      |     (Auth Service)      |
                                      +------------+------------+
                                                   | JWT
                                                   v
+------------------+  WebSockets / HTTP   +--------+------------+      LiveKit Protocol      +-------------------+
|  React Client    |<-------------------->|    Express API /    |<-------------------------->|  LiveKit SFU      |
|  (Vite SPA)      |                      |  Socket.IO Server   |                            |  (Media Routing)  |
+--------+---------+                      +--------+------------+                            +---------+---------+
         |                                         |                                                   |
         | Direct SDK                              | PostgreSQL Client                                 | WebRTC Media
         +-----------------------------------------+---------------------------------------------------+
                                                   |
                                                   v
                                      +------------+------------+
                                      |   Supabase Database     |
                                      |    (State Sync)         |
                                      +-------------------------+
```

### 1.1. High-Level Topology
- **Frontend SPA**: React 19 single-page application built on Vite and TypeScript. It handles client-side routing, WebRTC media rendering via the LiveKit React component library, user state management with Zustand, and responsive CSS styling.
- **Backend API & Signaling Gateway**: Node.js/Express server written in TypeScript. It integrates Socket.IO for real-time peer-to-peer signaling (e.g. emoji reactions, hand-raising, waiting room approvals) and manages LiveKit access token generation.
- **Selective Forwarding Unit (SFU)**: A self-hosted or cloud-based LiveKit server instance. Unlike mesh-networks (which overload client connections) or Multipoint Control Units (which compile streams server-side and consume heavy compute), LiveKit's SFU forwards media packets downstream, optimizing client bandwidth.
- **Identity Provider**: Clerk handles authentication, session tracking, social logins, and secure token issuance.
- **Data Persistence**: Supabase (PostgreSQL) maintains application records including active meetings, room histories, authorization codes, and participant logging.

### 1.2. Media Flow Pipeline (WebRTC SFU)
1. **Connection Establishment**: Client connects to the API and requests a JWT. The API verifies identity via Clerk and requests room configuration from Supabase.
2. **Access Token Generation**: The backend uses the `livekit-server-sdk` to generate a cryptographically signed access token embedding the participant's identity, room configuration, and specific media grants (e.g. `subscribe`, `publish`).
3. **WebRTC Peer Connection**: The client initializes a `Room` object from the `livekit-client` library, passing the token and the SFU server URL. A secure WebSocket connection is established to exchange ICE candidates and SDP offers/answers.
4. **Downstream Selection**: The SFU tracks active publishers and subscribers, dynamically adjusting resolutions and bitrates based on network conditions using simulcast tracks.

### 1.3. Real-Time Signaling (Socket.io)
While LiveKit handles the high-bandwidth audio/video tracks, Chatsie uses a parallel Socket.IO connection to orchestrate lightweight, transactional interactions:
- **Lobby Admission Queue**: Non-authenticated or host-controlled guests register in a waiting status. The server pushes real-time socket notifications to the host for approval or denial.
- **Transient Signaling**: React emojis, hand-raising notifications, and typing activity are transmitted over WebSockets to limit overhead on the LiveKit data channel.

---

## 2. Comprehensive Feature Set

### 2.1. Dynamic Media Controls
Users are equipped with high-fidelity buttons to toggle audio output, input, and video capture. Chatsie queries the user's system for available microphones, speakers, and cameras, allowing real-time switching of active devices during live calls via an intuitive configuration modal.

### 2.2. Smart Screen Sharing (Anti-Mirroring)
In standard video calling software, sharing a screen displaying the meeting window causes an infinite recursive tunnel ("mirror effect"). Chatsie intercepts the local participant's screenshare track on the presenter's client and blocks it from rendering locally in their main video grid. Instead, a custom Google Meet-style presenter card is rendered containing a decorative background pulse, helper information, and a distinct "Stop Presenting" button. Other remote participants continue to receive the real screenshare track downstream as expected.

### 2.3. Document Picture-in-Picture (PiP)
Using the modern Chromium `DocumentPictureInPicture` API, users can pop the video call into an always-on-top, floatable desktop window when navigating away from the meeting tab.
* **Component Portal**: A React portal captures the `<PipCallView>` component and mounts it into the detached window.
* **Synchronized State Toggles**: Controls inside the PiP window (microphone mute and camera disable) use a hybrid local state/Zustand implementation to provide instant graphical response while asynchronously applying media track updates to the active WebRTC stream.
* **Auto-Return**: The application registers visibility listeners that automatically close the PiP window and restore the normal layout when the user returns focus to the primary meeting tab.

### 2.4. Push-to-Talk (PTT) Mechanism
To minimize background noise in large meetings, users can opt-in to Push-to-Talk. When enabled:
- The microphone is kept muted by default.
- Holding down the `Spacebar` key dynamically unmutes the microphone track.
- Releasing the `Spacebar` automatically mutes the track.
- Keyboard repeat events are automatically ignored, and default browser behaviors (such as scrolling the page when space is pressed) are suppressed.

### 2.5. Intelligent Muted Typing Suggestion
If a participant is muted and begins typing extensively (detected via key presses in any text fields or textareas other than password inputs), a temporary suggestion banner appears near the controls. The user is prompted with an "Unmute" Call to Action to unmute their microphone and join the conversation. The toast auto-dismisses after 3 seconds.

### 2.6. Real-Time Speech Recognition & Transcription
Integrating the browser's Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`), Chatsie provides local audio processing:
- Tracks the active participant's spoken sentences when their microphone is unmuted.
- Converts speech to text locally and sends signaling payloads to all participants.
- Renders live, overlayed captions on top of the grid view for accessibility.
- Compiles a complete, chronological transcription panel history accessible inside the call.

### 2.7. Secure Lobby, Waiting Room & Passcodes
Meetings can be configured with optional passcodes. Additionally, the platform supports waiting room controls:
- **Host Permissions**: The host has exclusive permission to view the waiting queue.
- **Guest Experience**: Guests wait on a clean "Waiting for Host Approval" screen with loading animations.
- **Database Locks**: Room entry states are tracked in Supabase database entries, preventing guests from bypassing socket logic via page refreshes.

---

## 3. Codebase Directory Map

The directory structure is organized into decoupled client, API, and database modules:

```
chatsie-root/
├── package.json                   # Root orchestrator for server execution
├── backend/                       # Node.js/TypeScript Express backend
│   ├── server.ts                  # Main Express API, Clerk middleware, Socket.IO handlers
│   ├── package.json               # Backend dependencies & script definitions
│   ├── tsconfig.json              # TypeScript compilation configuration
│   └── dist/                      # Compiled JS distribution (auto-generated)
├── frontend/                      # React SPA (Vite/TypeScript)
│   ├── package.json               # Frontend dependencies & Vite setup
│   ├── vite.config.ts             # Bundler configs and dev server proxy settings
│   ├── index.html                 # App entry markup
│   ├── src/
│   │   ├── main.tsx               # Client bootstrap entrypoint
│   │   ├── App.tsx                # Client Routing and Providers (Clerk)
│   │   ├── index.css              # Global styles (Tailwind CSS v4 config)
│   │   ├── components/            # Reusable UI & Meeting structures
│   │   │   ├── ui/                # Core atoms (buttons, modals, input elements)
│   │   │   └── meeting/           # Meeting specific components
│   │   │       ├── MeetingRoom.tsx     # Active Call controller, PiP Portal, Lobby states
│   │   │       ├── MeetingControls.tsx # Mute, Video, Share, Panel buttons
│   │   │       ├── VideoGrid.tsx       # ParticipantTile and Presenter Card engine
│   │   │       ├── ChatPanel.tsx       # Socket-based room chat panel
│   │   │       ├── ParticipantPanel.tsx# Connected users manager
│   │   │       ├── TranscriptionPanel.tsx # Saved speech transcripts panel
│   │   │       ├── DeviceSelector.tsx  # Settings & PTT configuration
│   │   │       └── ReactionOverlay.tsx # Emoji particle rendering engine
│   │   ├── stores/                # Zustand client state modules
│   │   │   ├── meetingStore.ts    # Panel visibility, Chat logs, Metadata
│   │   │   └── webrtcStore.ts     # Device selection, local mute status
│   │   └── hooks/                 # Custom React hooks
│   │       └── useSpeechRecognition.ts # Web Speech transcription implementation
└── docs/                          # Static production folder (Railway hosting fallback)
```

---

## 4. Database Schema (Supabase)

To coordinate state and handle security policies, the backend queries a PostgreSQL database. Below is the relational structure:

### 4.1. `meetings` Table
Holds structural records for all generated meeting rooms.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | Unique room identifier |
| `code` | `varchar(50)` | `UNIQUE`, `NOT NULL` | String code used in URLs (e.g. `abc-defg-hij`) |
| `title` | `varchar(255)` | `NOT NULL` | The name/title of the meeting |
| `passcode` | `varchar(100)` | `NULLABLE` | Hashed password if room is private |
| `host_id` | `varchar(255)` | `NOT NULL` | Clerk user ID of the meeting creator |
| `is_active` | `boolean` | `DEFAULT true` | If false, the meeting room is closed |
| `created_at` | `timestamp` | `DEFAULT now()` | Creation record |

### 4.2. `meeting_participants` Table
Registers live state metadata for users attempting to access or currently active in rooms.
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `uuid` | `PRIMARY KEY`, `DEFAULT gen_random_uuid()` | Record ID |
| `meeting_id` | `uuid` | `REFERENCES meetings(id) ON DELETE CASCADE` | Link to meeting |
| `user_id` | `varchar(255)` | `NOT NULL` | Clerk user ID |
| `username` | `varchar(255)` | `NOT NULL` | Display name of participant |
| `role` | `varchar(50)` | `DEFAULT 'guest'` | Role classification (`host` or `guest`) |
| `status` | `varchar(50)` | `DEFAULT 'approved'` | Access state (`waiting`, `approved`, `denied`) |
| `joined_at` | `timestamp` | `DEFAULT now()` | Access request timestamp |

---

## 5. Environment Configuration

### 5.1. Backend Environment Variables (`backend/.env`)
Create a `.env` file in the `backend/` directory with the following variables:
```env
PORT=5001
NODE_ENV=development

# Clerk Authentication Keys (Obtain from dashboard.clerk.com)
CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Supabase Configurations (Obtain from database settings)
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ey...

# LiveKit SFU Credentials (Obtain from LiveKit Cloud / self-hosted dashboard)
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxx
LIVEKIT_API_SECRET=SECxxxxxxxxx
```

### 5.2. Frontend Environment Variables (`frontend/.env`)
Create a `.env` file in the `frontend/` directory with the following variables:
```env
# Clerk Publishable Key (Must match backend key for JWT alignment)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...

# Backend API Endpoint (HTTP/WS base)
VITE_BACKEND_URL=http://localhost:5001
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
```

---

## 6. Installation & Local Development Setup

### 6.1. Backend Service Initialization
Navigate to the `backend` directory, install packages, and execute the server in development mode (hot-reloaded via `ts-node-dev`):
```bash
cd backend
npm install
npm run dev
```
The console should confirm database checks, Clerk initialization, and print:
`[INFO] Server running on port 5001`

### 6.2. Frontend Application Initialization
In a separate terminal shell, navigate to the `frontend` directory, install modules, and run the development compiler:
```bash
cd frontend
npm install
npm run dev
```
Vite will compile the code and serve the local application at:
`http://localhost:5173/Chatsie/`

---

## 7. Production Build & Deployment

### 7.1. Railway Deployment Config
Chatsie includes a root-level `package.json` scripting interface targeted specifically for automated deployments on services like Railway.

When a deployment is triggered:
1. Railway executes `npm run build` at the root, which runs:
   `cd backend && npm install && npm run build`
2. Railway begins the server process by executing `npm run start` at the root, which executes the compiled Express code:
   `node --dns-result-order=ipv4first dist/server.js`

Ensure your environment variables are configured directly inside the Railway dashboard project environment settings.

### 7.2. Frontend Production Bundling
To build the optimized static production bundle for the client, run the build command inside the frontend folder:
```bash
cd frontend
npm run build
```
This generates compiled, minified code in the parent `docs/` directory, optimized with code-splitting, CSS compression, and target environment compatibility. These assets can be hosted on GitHub Pages, Netlify, or served as static files directly through your Express server.

---

## 8. API Specification

### 8.1. Token & Authentication Endpoints

#### POST `/api/meetings/token`
Generates a cryptographically signed WebRTC token for LiveKit connection auth.
- **Headers**:
  - `Authorization: Bearer <Clerk_Session_JWT>` (Required)
  - `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "room": "abc-defg-hij",
    "username": "John Doe"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "token": "ey12345abcdef...",
    "role": "guest"
  }
  ```

### 8.2. Meeting Lifecycle Endpoints

#### POST `/api/meetings/create`
Initializes a new meeting room in the database.
- **Headers**:
  - `Authorization: Bearer <Clerk_Session_JWT>` (Optional, defaults to guest host if anonymous)
  - `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "title": "Weekly Sync",
    "passcode": "123456" 
  }
  ```
- **Response (`201 Created`)**:
  ```json
  {
    "meetingId": "1234-abcd-5678",
    "code": "xyz-qwer-poi",
    "title": "Weekly Sync",
    "hostId": "user_2s..."
  }
  ```

#### POST `/api/meetings/validate`
Validates a meeting passcode before allowing a user to join.
- **Headers**:
  - `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "code": "xyz-qwer-poi",
    "passcode": "123456"
  }
  ```
- **Response (`200 OK`)**:
  ```json
  {
    "valid": true,
    "meeting": {
      "id": "1234-abcd-5678",
      "title": "Weekly Sync"
    }
  }
  ```

---

## 9. Real-Time Signaling & Web Socket Events

Chatsie uses a dedicated namespace on Socket.IO to carry out quick signaling transitions without interfering with the LiveKit media stream.

| Socket Event | Direction | Payload Structure | Description |
|---|---|---|---|
| `join-room` | Client -> Server | `{ roomCode, userId, username }` | Connects client socket to the target room channel. |
| `request-admission` | Client -> Server | `{ roomCode, userId, username }` | Dispatched by guest when they register in the lobby. |
| `admission-requested`| Server -> Host Client| `{ userId, username }` | Triggers a modal popup on host client to approve/deny. |
| `respond-admission` | Host -> Server | `{ roomCode, guestUserId, approve }`| Host decisions (approves or denies entry). |
| `admission-response` | Server -> Guest Client| `{ approve }` | Informs guest if they are admitted or rejected. |
| `reaction` | Client -> Server | `{ roomCode, type }` | Broadcasts an emoji character (e.g. `🔥`, `👏`) to peers. |
| `hand-raise` | Client -> Server | `{ roomCode, raised }` | Syncs state indicator for hands raised. |
| `caption` | Client -> Server | `{ roomCode, text, isFinal }` | Distributes real-time transcription data. |

---

## 10. Keyboard Shortcuts Guide

To allow keyboard-based navigation during active conferences, Chatsie supports native hotkeys.

*   `M`: Toggle microphone (Mute / Unmute).
*   `V`: Toggle video camera (Start / Stop).
*   `S`: Toggle screen sharing (Present / Stop).
*   `C`: Toggle right-side chat message panel.
*   `P`: Toggle participants list panel.
*   `H`: Raise or lower hand.
*   `Spacebar` (Hold): Push-to-Talk (Unmutes only while held down, when enabled in Settings).

---

## 11. Troubleshooting & Support

### 11.1. Microphone or Camera Not Connecting
- **Browser Permissions**: Ensure the browser has permission to access media devices. Click the padlock icon in the URL address bar and verify that Camera and Microphone are set to "Allow".
- **Hardware Selection**: Open the "Device Settings" config modal (via the gear icon in the bottom controls) and verify that the correct input device is selected from the dropdown menus.

### 11.2. Document Picture-in-Picture API Unsupported
- **Browser Compatibility**: The `DocumentPictureInPicture` API is currently supported on Chromium-based browsers (Chrome, Edge, Opera) v111+. If you are using Firefox or Safari, the PiP button will automatically hide itself to avoid errors.

### 11.3. Screen Mirroring Loop
- If you are presenting your screen and looking at the presentation card, rest assured that other participants are seeing your screen shares normally. The presenter card is displayed locally to prevent the infinite mirror loop.

---

## 12. Contribution & Licensing

Chatsie is an open-source codebase. Contributions are welcome!
1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/NewAwesomeFeature`).
3. Commit your changes (`git commit -m 'Add some NewAwesomeFeature'`).
4. Push to the branch (`git push origin feature/NewAwesomeFeature`).
5. Open a Pull Request.

Developed with ❤️ by the Chatsie Engineering Team.
