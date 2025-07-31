# Inde - Organic Independence

My goal is to empower everyone to be autonomous and independent.

## Vision

I want to go above and beyond browser use—we want to use the whole computer. Inde represents guided, intelligent computer use for anyone, anywhere, with any background to do anything on a computer.

## Key Features

### For Everyone
- **Independence**: Tech fluency without tech skills
- **Autonomy**: No hand-holding, no bottlenecks, just confidence
- **Universal Access**: Any role, any experience level, any speed

Applications include:

- Basic computer skills demos for non-tech savvy people
- Product setup for hardware/OS specific configurations
- Product demos
- Employe onboarding
- So much more

### For Developers
- **Streaming Results**: Real-time streaming from Orgo straight to Next.js
- **Fine-grained Control**: Step-through AI actions with precision
- **Massive Speed**: Groq and Cerebras integrations for >100% inference runtime improvement (hopefully)

## Technical Stack

- **Frontend**: Next.js with Tailwind CSS
- **AI Integration**: Orgo AI for desktop automation
- **Providers**: Anthropic (Claude), Groq (WIP), and Cerebras support
- **Real-time**: Server-Sent Events for live streaming

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
CEREBRAS_API_KEY=your_cerebras_key
```

## Features

### Demo Interface
- **Launch**: Initialize Orgo computer instance
- **Play**: Continuous AI execution with custom speed control
- **Forward**: Step-by-step execution with conversation history
- **Reset**: Clear state and restart
- **Provider Selection**: Choose between Claude, Groq, and Cerebras

### Real-time Streaming
- Live screenshot updates during execution
- Event stream display
- Progress tracking and status updates

### Advanced Controls
- Speed slider for execution timing
- Provider selection (Anthropic/Groq/Cerebras)
- Manual screenshot refresh

## Architecture

The application uses a modular architecture with:
- **API Routes**: Separate endpoints for different actions
- **Event Streaming**: Server-Sent Events streamed for real-time updates
- **Provider Abstraction**: Unified interface for different AI providers
- **Speed Benchmarking Across Models and Actions**: Built-in metrics and profiling tools track execution speed, action breakdowns, and model call performance across different providers and settings.

## Speed Profile Results

Task: Various opening and closing of programs and typing hello world into the terminal.

Anthropic (running claude-sonnet-4-20250514): Average: 0.24 **a**ctions/second (I observe this actions/second holds across a range of tasks)

Groq (running llama-4-maverick-17b-128e-instruct): Average: 0.11 actions/second (range of 0.06 to 0.17 extremely ambitious, but inaccurate clicking on the right parts of the screen, likes providing many commands in a sequence, rather than the step-screenshot-next-step  paradigm.)

Cerebras (running llama-4-maverick-17b-128e-instruct): Average: 0.135 actions/second (range of 0.11 to 0.16 across multiple runs of the same task, but far more reliable than Groq, reliability comparable to Anthropic)

**Takeaways**: due to native computer use support, Anthropic is the most reliable, but Cerebras is a close second and the best compromise between speed and performance. Both Groq and Cerebras are massive speed improvements compared to Anthropic.

## Contributing

This is a hackathon project focused on demonstrating the potential of AI-powered computer assistance. The goal is to show how AI can make complex computer tasks accessible to everyone.

## License

MIT License - see LICENSE file for details.