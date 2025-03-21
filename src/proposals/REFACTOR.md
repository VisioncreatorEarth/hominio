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
   - Re-registered during stage changes

### Detail: Tool Definition in Stage Changes

The current system uses a complex flow for tool definitions during stage changes:

1. **Stage Change Initiation**:
   - In `toolImplementation.ts`, the `switchAgent` function is called when an agent change is requested
   - This function constructs a response object that triggers a stage change in Ultravox

2. **Stage Change Response Format**:
   ```typescript
   // Format returned by the switchAgent tool
   const stageChangeData = {
     systemPrompt: string,  // New system prompt for the agent
     voice: string,         // Voice ID for the new agent
     toolResultText: string // Text to display during transition
   };
   
   // Wrapped in a tool result format for Ultravox
   const toolResult = {
     responseType: "new-stage",
     result: JSON.stringify(stageChangeData)
   };
   ```

3. **Missing selectedTools in Stage Changes**:
   - **Critical issue**: The current implementation does not directly specify `selectedTools` in the stage change data
   - According to Ultravox documentation, `selectedTools` can be directly specified in stage changes
   - Instead, our system relies on an indirect registration process

4. **Stage Change Event Reception**:
   - Ultravox receives this response and triggers a 'stage_change' event
   - Both `callFunctions.ts` and `CallInterface.svelte` listen for this event

5. **Extracting Agent from System Prompt**:
   - The new agent name is extracted from the system prompt using regex:
   ```typescript
   const agentMatch = systemPrompt.match(/You are now ([A-Za-z]+),/i);
   ```

6. **Tool Reconfiguration**:
   - After detecting the new agent, `callFunctions.ts` re-registers all client tools
   - This happens in a setTimeout callback to ensure stage change is complete:
   ```typescript
   setTimeout(() => {
     if (typeof window !== 'undefined' && window.__hominio_tools) {
       console.log('🌟 Re-registering client tools after stage change');
       const toolImpls = window.__hominio_tools;
       
       for (const [toolName, impl] of Object.entries(toolImpls)) {
         uvSession?.registerToolImplementation(toolName, impl);
       }
     }
   }, 500);
   ```

7. **Critical Issues in Current Approach**:
   - Tools are not explicitly passed during stage changes (missing `selectedTools` property)
   - Instead, the system prompt change implicitly indicates which agent is active
   - The agent's tools must be manually looked up in `agentTools` object
   - No direct correlation between the stage change event and available tools
   - Relies on global `window.__hominio_tools` for tool implementations
   - Uses setTimeout for registration, introducing potential race conditions

### Current Stage Change Flow

1. **Stage Change Event**: Detected in both `CallInterface.svelte` and `callFunctions.ts`
2. **Agent Extraction**: Agent name extracted from system prompt
3. **Store Update**: Current agent updated in `currentAgent` store
4. **Tool Registration**: Tools re-registered after agent change
5. **UI Update**: Interface updated to show current agent

### Data Interfaces

```typescript
// Tool Configuration
{
  temporaryTool: {
    modelToolName: string;
    description: string;
    dynamicParameters: [
      {
        name: string;
        location: string;
        schema: {
          type: string;
          description: string;
        };
        required: boolean;
      }
    ];
    client: {};
  }
}

// Agent Configuration
type AgentConfig = {
  personality: string;
  voiceId: string;
};

// Ultravox Stage Change Event
{
  detail?: {
    stageId?: string;
    voiceId?: string;
    systemPrompt?: string;
  }
}

// When an agent switches, the tool results in this format
type ToolResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  responseType?: string;       // "new-stage" for stage changes
  systemPrompt?: string;       // New agent's system prompt
  voice?: string;              // New agent's voice ID
  toolResultText?: string;     // Text shown during transition
  result?: string;             // JSON string of stage change data
};
```

### Current Issues

1. **Scattered Definitions**: Tool configurations and implementations spread across files
2. **Tight Coupling**: Agent and tool configurations are tightly coupled
3. **Duplicate Definitions**: Tools defined in system prompt and code
4. **Registration Complexity**: Tool registration happens in multiple places
5. **Type Safety**: Limited type safety between tool definitions and implementations
6. **Implicit Tool Assignment**: Tools are tied to agents through separate objects, not directly
7. **Global State Dependency**: Relies on global window object for tool registration
8. **Underutilized Ultravox Features**: Not using Ultravox's ability to specify tools directly in stage changes

## Proposed Refactoring

### New Directory Structure

```
src/
├── lib/
│   ├── ultravox/
│   │   ├── agents/
│   │   │   ├── index.ts            # Exports all agents
│   │   │   ├── types.ts            # Shared agent types
│   │   │   ├── hominio.ts          # Hominio agent config
│   │   │   ├── mark.ts             # Mark agent config
│   │   │   ├── oliver.ts           # Oliver agent config
│   │   │   └── rajesh.ts           # Rajesh agent config
│   │   ├── tools/
│   │   │   ├── index.ts            # Exports all tools
│   │   │   ├── types.ts            # Shared tool types
│   │   │   ├── core/               # Core tools available to all agents
│   │   │   │   ├── switchAgent/
│   │   │   │   │   ├── config.ts   # Tool configuration
│   │   │   │   │   └── index.ts    # Tool implementation
│   │   │   │   └── hangUp/
│   │   │   │       ├── config.ts
│   │   │   │       └── index.ts
│   │   │   ├── todo/               # Todo-related tools
│   │   │   │   ├── createTodo/
│   │   │   │   │   ├── config.ts
│   │   │   │   │   └── index.ts
│   │   │   │   ├── toggleTodo/
│   │   │   │   │   ├── config.ts
│   │   │   │   │   └── index.ts
│   │   │   │   └── ...
│   │   │   └── list/               # List-related tools
│   │   │       ├── createList/
│   │   │       │   ├── config.ts
│   │   │       │   └── index.ts
│   │   │       └── ...
│   │   ├── callManager.ts          # Refactored callFunctions.ts
│   │   └── stageManager.ts         # Manages stage changes
│   └── components/
│       └── CallInterface.svelte    # UI component
```

### Key Concepts

#### 1. Tool Module

Each tool is a self-contained module with configuration and implementation:

```typescript
// tools/todo/createTodo/config.ts
export const createTodoConfig = {
  temporaryTool: {
    modelToolName: 'createTodo',
    description: 'Create a new todo item. Use this tool when a todo needs to be created.',
    dynamicParameters: [
      {
        name: 'todoText',
        location: 'PARAMETER_LOCATION_BODY',
        schema: {
          type: 'string',
          description: 'The text content of the todo task to create'
        },
        required: true
      },
      {
        name: 'tags',
        location: 'PARAMETER_LOCATION_BODY',
        schema: {
          type: 'string',
          description: 'Optional comma-separated list of tags'
        },
        required: false
      }
    ],
    client: {}
  }
};

// tools/todo/createTodo/index.ts
import type { ToolImplementation } from '../types';
import { createTodoConfig } from './config';

export const createTodoImplementation: ToolImplementation = async (params) => {
  try {
    // Implementation logic
    return { success: true, message: 'Todo created' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
};

export const createTodo = {
  config: createTodoConfig,
  implementation: createTodoImplementation
};
```

#### 2. Agent Configuration

Agents are defined with their personality, voice, and allowed tools:

```typescript
// agents/oliver.ts
import { createTodo, toggleTodo, updateTodo } from '../tools';

export const oliverAgent = {
  name: 'Oliver',
  personality: 'professional and efficient',
  voiceId: 'dcb65d6e-9a56-459e-bf6f-d97572e2fe64',
  systemPromptTemplate: `You are now Oliver, a friendly assistant for the Hominio todo app. 
Your personality is more professional and efficient. 
You are specialized in todo creation and management.

Your specialized tools are: createTodo, toggleTodo, updateTodo.
You should always use the switchAgent tool to redirect users to the appropriate specialist when they need help outside your expertise.

Continue helping the user with their todo management tasks using your available tools.

Remember: You are Oliver now. Respond in a professional and efficient manner consistent with your character.`,
  tools: [createTodo, toggleTodo, updateTodo]
};
```

#### 3. Improved Stage Change Process

Direct specification of tools in stage changes:

```typescript
// ultravox/tools/core/switchAgent/index.ts
import { agents } from '../../../agents';
import type { SwitchAgentParams } from './types';

export async function switchAgentImplementation(params: SwitchAgentParams) {
  try {
    const agentName = params.agentName || 'Hominio';
    const agent = agents.find(a => a.name === agentName) || agents[0];
    
    // Collect tool configs for the stage change
    const toolConfigs = agent.tools.map(tool => tool.config);
    
    // Create stage change data with selectedTools directly specified
    const stageChangeData = {
      systemPrompt: agent.systemPromptTemplate,
      voice: agent.voiceId,
      toolResultText: `I'm now switching you to ${agent.name}...`,
      selectedTools: toolConfigs // Directly specify tools for the new stage
    };
    
    // Return properly formatted stage change response
    return {
      responseType: 'new-stage',
      result: JSON.stringify(stageChangeData)
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
```

#### 4. Client Tool Registration

Register implementation functions only, not configurations:

```typescript
// ultravox/toolRegistry.ts
export function registerClientToolImplementations(session, tools) {
  if (!session) {
    console.error('No Ultravox session provided');
    return;
  }

  for (const tool of tools) {
    // Only register the client-side implementation function
    session.registerToolImplementation(
      tool.config.temporaryTool.modelToolName, 
      tool.implementation
    );
    console.log(`Registered client implementation for: ${tool.config.temporaryTool.modelToolName}`);
  }
}
```

### Benefits of Refactoring

1. **Modularity**: Each tool is a self-contained module
2. **Colocation**: Configuration and implementation stay together
3. **Maintainability**: Easier to add/modify tools
4. **Type Safety**: Better typing between configurations and implementations
5. **Direct Tool Specification**: Tools explicitly specified in stage changes
6. **No Global State**: Elimination of window.__hominio_tools dependency
7. **No Race Conditions**: Removal of setTimeout for tool registration
8. **Consistency**: Standardized approach to tool definition
9. **Better Ultravox Integration**: Proper use of Ultravox stage change capabilities

### Migration Strategy

1. Create the new directory structure
2. Move tool configurations one by one, testing each
3. Refactor agent definitions to reference tools
4. Update the switchAgent tool to directly include selectedTools in stage changes
5. Simplify client tool registration process
6. Update system prompt generation to use agent configurations
7. Remove the complex setTimeout re-registration logic
8. Test stage changes to ensure tools are properly available after transitions 