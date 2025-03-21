# Ultravox Tool & Agent Architecture Refactoring

## Current Architecture Analysis

### Overview

The application uses Ultravox for voice interactions with multiple agent personalities (Hominio, Mark, Oliver, Rajesh), each with specialized tools. The current implementation spans several files with tool definitions, configurations, and implementations mixed across them.

### Key Components

#### 1. Call Setup & Management
- **callFunctions.ts**: Core functionality for Ultravox API interaction
  - Manages call lifecycle (start/end)
  - Defines shared tools for all agents
  - Contains agent-specific tool configurations in `agentTools` object

#### 2. Tool Implementation
- **toolImplementation.ts**: Implements tool functions
  - Manages agent state via Svelte stores
  - Contains agent configuration (personality, voice)
  - Handles agent switching functionality

#### 3. UI Components
- **CallInterface.svelte**: Displays call status and transcripts
  - Detects stage changes from Ultravox
  - Updates displayed agent based on stage changes

#### 4. System Configuration
- **+layout.svelte**: Contains system prompt with all tool definitions
  - Initializes call system
  - Manages call state

### Current Tool Registration Flow

1. **Initial Tools**: Base tools are configured in `callFunctions.ts` in the `tools` array
2. **Agent-Specific Tools**: Defined in `agentTools` object in `callFunctions.ts`
3. **Tool Registration**: Tools are registered with Ultravox in several places:
   - Base tools sent to Ultravox when creating a call
   - Client-side tool implementations registered via `window.__hominio_tools`

## Improvements Already Implemented

We've already made significant improvements to the architecture:

1. **Direct Tool Specification in Stage Changes**:
   - Updated both client and server-side implementations of `switchAgent` to include `selectedTools` in stage change data
   - Tools are now explicitly specified rather than implicitly inferred

   ```typescript
   const stageChangeData = {
     systemPrompt: systemPrompt,
     voice: agent.voiceId,
     toolResultText: `I'm now switching you to ${normalizedName}...`,
     selectedTools: [
       { toolName: "hangUp" },
       { temporaryTool: { modelToolName: 'switchAgent', ... } },
       ...agentSpecificTools
     ]
   };
   ```

2. **Removed Redundant Tool Registration**:
   - Eliminated the setTimeout re-registration in `callFunctions.ts`
   - Removed the periodic registration interval in `+page.svelte`
   - Removed agent change subscription that triggered re-registration

3. **Simplified Stage Change Handling**:
   - Stage change listener now only updates UI state
   - Ultravox handles tool availability based on what we specify in stage changes
   - Cleaner log messages explain the new approach

These changes have eliminated several key issues:
- No more race conditions from setTimeout
- No dependency on global window object for re-registration
- No complex extraction of agent name to determine which tools to register

### Current Stage Change Flow

1. **Stage Change Event**: Detected in both `CallInterface.svelte` and `callFunctions.ts`
2. **Agent Extraction**: Agent name extracted from system prompt
3. **Store Update**: Current agent updated in `currentAgent` store
4. **UI Update**: Interface updated to show current agent

## Remaining Tasks

While we've improved the tool registration and stage change flow, several architectural improvements remain to be implemented:

1. **Modular Tool Structure**: Tools are still defined in a monolithic `agentTools` object rather than separate modules
2. **Agent Configuration**: Agent definitions are scattered across the code rather than centralized
3. **Type Safety**: Type definitions could be improved for better consistency
4. **Code Organization**: Some functionality is still duplicated across files

## Proposed Final Refactoring

### New Directory Structure

```
src/
├── lib/
│   ├── VIBES/                   # App experiences/manifests 
│   │   ├── Todos/               # Todo app experience
│   │   │   └── manifest.json    # Manifest defining tools and agents for Todos vibe
│   │   └── other-vibes/         # Future app experiences
│   │
│   ├── TOOLS/                   # All available tools
│   │   ├── core/                # Core tools available in all vibes
│   │   │   ├── hangUp/
│   │   │   │   ├── config.json  # Tool configuration in JSON
│   │   │   │   └── function.ts  # Tool implementation
│   │   │   └── switchAgent/
│   │   │       ├── config.json
│   │   │       └── function.ts
│   │   └── todos/               # Todo-specific tools
│   │       ├── createTodo/
│   │       │   ├── config.json
│   │       │   └── function.ts
│   │       ├── toggleTodo/
│   │       │   ├── config.json
│   │       │   └── function.ts
│   │       └── ...
│   │
│   ├── AGENTS/                  # All available agents
│   │   ├── Hominio/             # Core orchestrator agent
│   │   │   └── config.json      # Agent configuration in JSON
│   │   ├── Oliver/              # Todo specialist
│   │   │   └── config.json
│   │   └── Rajesh/              # Tech support
│   │       └── config.json
│   │
│   ├── ultravox/
│   │   ├── vibeLoader.ts        # Loads vibes from manifests
│   │   ├── toolRegistry.ts      # Manages tool registration
│   │   ├── agentManager.ts      # Manages agent switching
│   │   └── callManager.ts       # Manages call lifecycle
│   │
│   └── components/
│       └── CallInterface.svelte # UI component
```

### Key Concepts

#### 1. Vibes (App Manifests)

Each "vibe" is a specific app experience with its own set of agents and tools:

```json
// VIBES/Todos/manifest.json
{
  "id": "todos",
  "name": "Todo Assistant",
  "description": "Interactive assistant for managing todo lists",
  "defaultAgent": "Hominio",
  "agents": [
    "Hominio",
    "Oliver",
    "Rajesh"
  ],
  "coreTools": [
    "hangUp",
    "switchAgent"
  ],
  "appTools": [
    "createTodo",
    "toggleTodo",
    "updateTodo",
    "removeTodo",
    "filterTodos",
    "createList",
    "switchList"
  ]
}
```

#### 2. Tools

Each tool has a JSON config and TypeScript implementation:

```json
// TOOLS/todos/createTodo/config.json
{
  "id": "createTodo",
  "name": "Create Todo",
  "description": "Create a new todo item. Use this tool when a todo needs to be created.",
  "modelToolName": "createTodo",
  "parameters": [
    {
      "name": "todoText",
      "location": "PARAMETER_LOCATION_BODY",
      "schema": {
        "type": "string",
        "description": "The text content of the todo task to create"
      },
      "required": true
    },
    {
      "name": "tags",
      "location": "PARAMETER_LOCATION_BODY",
      "schema": {
        "type": "string",
        "description": "Optional comma-separated list of tags"
      },
      "required": false
    }
  ]
}
```

```typescript
// TOOLS/todos/createTodo/function.ts
import type { ToolImplementation } from '../../ultravox/types';

export const createTodoImplementation: ToolImplementation = async (params: any) => {
  try {
    const { todoText, tags } = params;
    
    // Implementation logic for creating a todo
    console.log(`Creating todo: ${todoText} with tags: ${tags}`);
    
    // Return success response
    return { 
      success: true, 
      message: `Created todo: "${todoText}"` 
    };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
};
```

#### 3. Agents

Agents are defined with configurations in JSON:

```json
// AGENTS/Oliver/config.json
{
  "id": "Oliver",
  "name": "Oliver",
  "personality": "professional and efficient",
  "voiceId": "dcb65d6e-9a56-459e-bf6f-d97572e2fe64",
  "description": "Oliver is specialized in todo creation and management",
  "tools": [
    "createTodo",
    "toggleTodo",
    "updateTodo"
  ],
  "systemPromptTemplate": "You are now Oliver, a friendly assistant for the Hominio todo app. Your personality is more professional and efficient. You are specialized in todo creation and management.\n\nYour specialized tools are: createTodo, toggleTodo, updateTodo.\nYou should always use the switchAgent tool to redirect users to the appropriate specialist when they need help outside your expertise.\n\nContinue helping the user with their todo management tasks using your available tools.\n\nRemember: You are Oliver now. Respond in a professional and efficient manner consistent with your character."
}
```

### Vibe Loading System

The vibe loader dynamically assembles agents and tools:

```typescript
// ultravox/vibeLoader.ts
export async function loadVibe(vibeName: string) {
  try {
    // 1. Load the vibe manifest
    const vibeManifest = await import(`../VIBES/${vibeName}/manifest.json`);
    
    // 2. Load all required agents
    const agents = await Promise.all(
      vibeManifest.agents.map(async (agentId: string) => {
        return await import(`../AGENTS/${agentId}/config.json`);
      })
    );
    
    // 3. Load all required tools
    const allToolIds = [...vibeManifest.coreTools, ...vibeManifest.appTools];
    const tools = await Promise.all(
      allToolIds.map(async (toolId: string) => {
        // Determine if it's a core tool or app tool
        const toolPath = vibeManifest.coreTools.includes(toolId) 
          ? `../TOOLS/core/${toolId}` 
          : `../TOOLS/todos/${toolId}`;
          
        // Load config and function
        const config = await import(`${toolPath}/config.json`);
        const { implementation } = await import(`${toolPath}/function.ts`);
        
        return {
          config,
          implementation
        };
      })
    );
    
    // 4. Return the assembled vibe
    return {
      manifest: vibeManifest,
      agents,
      tools,
      defaultAgent: agents.find(a => a.id === vibeManifest.defaultAgent)
    };
  } catch (error) {
    console.error(`Failed to load vibe ${vibeName}:`, error);
    throw error;
  }
}
```

### Tool Registration

Register implementations during call initialization:

```typescript
// ultravox/toolRegistry.ts
export function registerToolImplementations(session: any, tools: any[]) {
  if (!session) {
    console.error('No Ultravox session provided');
    return;
  }

  console.log(`Registering ${tools.length} tool implementations`);
  
  for (const tool of tools) {
    try {
      // Register the client-side implementation function
      session.registerToolImplementation(
        tool.config.id, 
        tool.implementation
      );
      console.log(`✅ Registered implementation for: ${tool.config.id}`);
    } catch (error) {
      console.error(`❌ Failed to register tool ${tool.config.id}:`, error);
    }
  }
}
```

### Agent Switching

Agent switching with direct tool specification:

```typescript
// ultravox/agentManager.ts
export function switchToAgent(agentId: string, allAgents: any[], allTools: any[]) {
  const agent = allAgents.find(a => a.id === agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found`);
  }
  
  // 1. Find all tool configs needed by this agent
  const agentTools = allTools.filter(t => 
    agent.tools.includes(t.config.id)
  );
  
  // 2. Add core tools (always available)
  const coreTools = allTools.filter(t => 
    t.config.id === 'switchAgent' || t.config.id === 'hangUp'
  );
  
  // 3. Format tools for stage change
  const formattedTools = [...coreTools, ...agentTools].map(tool => {
    if (tool.config.id === 'hangUp') {
      return { toolName: "hangUp" };
    } else {
      return {
        temporaryTool: {
          modelToolName: tool.config.id,
          description: tool.config.description,
          dynamicParameters: tool.config.parameters,
          client: {}
        }
      };
    }
  });
  
  // 4. Create stage change data
  const stageChangeData = {
    systemPrompt: agent.systemPromptTemplate,
    voice: agent.voiceId,
    toolResultText: `I'm now switching you to ${agent.name}...`,
    selectedTools: formattedTools
  };
  
  return {
    responseType: 'new-stage',
    result: JSON.stringify(stageChangeData)
  };
}
```

### Call Creation and Management

Simplified call creation with vibe initialization:

```typescript
// ultravox/callManager.ts
export async function startCall(vibeName: string, callbacks: any) {
  try {
    // 1. Load the vibe (agents and tools)
    const vibe = await loadVibe(vibeName);
    
    // 2. Configure initial call settings
    const callConfig = {
      systemPrompt: vibe.defaultAgent.systemPromptTemplate,
      model: 'fixie-ai/ultravox-70B',
      voice: vibe.defaultAgent.voiceId,
      languageHint: 'en',
      temperature: 0.7,
      selectedTools: formatToolsForUltravox(vibe.tools, vibe.defaultAgent.tools)
    };
    
    // 3. Create API call to get join URL
    const callData = await createCall(callConfig);
    
    // 4. Join the call
    await joinCall(callData.joinUrl, vibe, callbacks);
    
    return true;
  } catch (error) {
    console.error('Failed to start call:', error);
    callbacks.onStatusChange('error');
    return false;
  }
}
```

### Implementation Plan

1. **Create Foundational Structure**:
   - Set up the VIBES, TOOLS, and AGENTS directory structure
   - Define JSON schemas for manifests, tools, and agents

2. **Migrate Existing Tools**:
   - Extract tool configs into JSON files
   - Move implementations to separate function files
   - Start with core tools (hangUp, switchAgent)

3. **Migrate Agent Configurations**:
   - Define agent configs in JSON format
   - Clean up agent-tool relationships

4. **Create Vibe Manifest**:
   - Define the Todos vibe manifest
   - Test loading capabilities

5. **Implement New Managers**:
   - Build vibeLoader.ts for loading vibes
   - Create toolRegistry.ts for tool registration
   - Develop agentManager.ts for agent switching
   - Refactor callManager.ts to use the new structure

6. **Update UI Components**:
   - Ensure UI adapts to the new architecture
   - Update any direct references to agents or tools

### Benefits of This Architecture

1. **Database-Friendly**: JSON configurations enable easy storage/retrieval from databases
2. **Modularity**: Clear separation between vibes, tools, and agents
3. **Flexibility**: Easy to add new vibes, tools, or agents without code changes
4. **Maintainability**: Self-contained modules with clear responsibilities
5. **Scalability**: Vibe-based approach allows for multiple distinct app experiences
6. **Testability**: Isolated components with clear interfaces
7. **Future-Proof**: Structure supports dynamic loading of configurations from servers 