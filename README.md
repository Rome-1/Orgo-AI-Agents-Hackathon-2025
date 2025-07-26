# Inde - Organic Independence

My goal is to empower everyone to be autonomous and independent.

## Vision

I want to go above and beyond browser use—we want to use the whole computer. Inde represents guided, intelligent computer use for anyone, anywhere, with any background.

## Key Features

### For Everyone
- **Independence**: Tech fluency without tech skills
- **Autonomy**: No hand-holding, no bottlenecks, just confidence
- **Universal Access**: Any role, any experience level, any speed

### For Developers
- **Streaming Results**: Real-time streaming from Orgo straight to Next.js
- **Fine-grained Control**: Step-through AI actions with precision
- **Massive Speed**: Groq integration for >10x inference runtime improvement (hopefully)

## Technical Stack

- **Frontend**: Next.js with Tailwind CSS
- **AI Integration**: Orgo AI for desktop automation
- **Providers**: Anthropic (Claude) and Groq support
- **Real-time**: Server-Sent Events for live streaming
- **UI**: Neo-brutalist design with consistent aesthetics

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see `.env.example`)
4. Run the development server: `npm run dev`

## Environment Variables

```bash
ORGO_API_KEY=your_orgo_api_key
ORGO_PROJECT_ID=your_project_id
ANTHROPIC_API_KEY=your_anthropic_key
GROQ_API_KEY=your_groq_key
```

## Features

### Demo Interface
- **Launch**: Initialize Orgo computer instance
- **Play**: Continuous AI execution with custom speed control
- **Forward**: Step-by-step execution with conversation history
- **Reset**: Clear state and restart
- **Provider Selection**: Choose between Claude and Groq

### Real-time Streaming
- Live screenshot updates during execution
- Event stream display
- Progress tracking and status updates

### Advanced Controls
- Speed slider for execution timing
- Provider selection (Anthropic/Groq)
- Conversation history persistence
- Manual screenshot refresh

## Architecture

The application uses a modular architecture with:
- **API Routes**: Separate endpoints for different actions
- **State Management**: In-memory conversation tracking
- **Event Streaming**: Server-Sent Events for real-time updates
- **Provider Abstraction**: Unified interface for different AI providers

## Contributing

This is a hackathon project focused on demonstrating the potential of AI-powered computer assistance. The goal is to show how AI can make complex computer tasks accessible to everyone.

## License

MIT License - see LICENSE file for details.