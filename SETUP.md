# Orgo AI Agent Setup

This project integrates Orgo AI with Claude for desktop automation, built into the existing demo interface. Users can control Claude's desktop automation with step-by-step and continuous execution modes.

## Setup Instructions

### 1. Environment Variables

Copy `env.example` to `.env.local` and fill in your API keys:

```bash
cp env.example .env.local
```

Required environment variables:
- `ORGO_API_KEY`: Your Orgo API key
- `ORGO_PROJECT_ID`: Your Orgo project ID (shared across all users)
- `ANTHROPIC_API_KEY`: Your Anthropic API key

### 2. Install Dependencies

```bash
npm install
# or
pnpm install
```

### 3. Run the Development Server

```bash
npm run dev
# or
pnpm dev
```

## Features

### Demo Interface

The main interface is located in the "Experience Inde" section and includes:

- **Instruction Input**: Enter commands for Claude to execute
- **Speed Control**: Adjust the delay between actions (1-100, converted to 100-2000ms)
- **Execution Modes**:
  - **Play (▶)**: Run continuously until completion with configurable delays
  - **Forward (>>)**: Run one step at a time for step-by-step control
  - **Pause (⏸)**: Stop current execution
  - **Reset (↻)**: Reset the shared desktop state
- **Real-time Event Stream**: Watch Claude's actions as they happen
- **Live Screenshots**: See the desktop state update in real-time

### API Endpoints

- `GET /api/demo/launch`: Initialize Orgo computer and get initial screenshot
- `POST /api/demo/play`: Start continuous execution with streaming
- `POST /api/demo/forward`: Execute one step with streaming
- `POST /api/demo/reset`: Reset the shared computer instance

## Usage

1. **Launch Inde**: Click "Launch Inde" to initialize the computer and get the first screenshot
2. **Enter Instruction**: Type what you want Claude to do (e.g., "Open a web browser")
3. **Choose Execution Mode**:
   - **Play**: Click ▶ to run continuously with the current speed setting
   - **Forward**: Click >> to execute one step at a time
4. **Monitor Progress**: Watch the event stream and live screenshots
5. **Control Execution**: Use ⏸ to pause or ↻ to reset

## Architecture

- **Shared Computer**: All users share the same Orgo `project_id` for simplicity
- **Server-Side Execution**: Orgo operations run on the server with streaming events
- **Client-Side Control**: Browser controls execution flow and displays events
- **Real-time Updates**: Screenshots and events stream from server to client
- **In-Memory State**: Conversations are cached in memory (suitable for development)

## Example Instructions

- "Open a web browser and go to google.com"
- "Take a screenshot of the current desktop"
- "Open the terminal and run 'ls'"
- "Find and click on the settings icon"
- "Type 'Hello World' in the text editor"

## Event Types

The system streams different types of events:
- `text`: Claude's text responses
- `tool_use`: Actions being performed (clicks, typing, etc.)
- `thinking`: Claude's reasoning process
- `complete`: Task completion notification
- `step_complete`: Single step completion
- `error`: Error messages

## Notes

- The implementation uses Orgo's built-in `prompt()` method for simplicity
- All users share the same desktop instance, so be mindful of state
- The event stream shows Claude's thinking, actions, and results in real-time
- Reset the computer if the desktop gets into an unusable state
- Speed control inversely affects delay (higher speed = lower delay) 