# Hominio Voice App Architecture Refactoring

## Overview

We're moving to a "vibe"-based configuration system for the entire voice application. This modular, declarative approach will significantly improve maintainability, flexibility, and feature development.

## Core Concept: Vibes as App Configuration Units

A "vibe" is a complete configuration unit containing:
- Root call settings (immutable during call)
- Global call tools available to all agents
- Agent definitions with personalities, voice IDs
- Tool assignments and access rules
- System prompts and dynamic content

This architecture makes your application extremely flexible - you can create different "vibes" for different use cases (todos, calendar management, etc.) without changing the core application code.

## Proposed Folder Structure

```
/src
  /lib
    /vibes
      /todos
        manifest.json   # Main vibe configuration
      /calendar
        manifest.json   # Another potential vibe
    /tools
      /createTodo
        manifest.json   # Tool configuration
        function.ts     # Tool implementation 
      /toggleTodo
        manifest.json
        function.ts
      /switchAgent
        manifest.json
        function.ts
      /hangUp
        manifest.json
        function.ts
    /agents
      /common           # Shared agent templates/components
    /ultravox
      /loaders
        /vibeLoader.ts    # Main loader for vibe configurations
        /toolLoader.ts    # Loads tool implementations
        /agentLoader.ts   # Agent loading functionality
      /callManager.ts   # Manages calls based on vibe config
```

## Sample Configuration Files

### `/lib/vibes/todos/manifest.json`

```json
{
  "name": "todos",
  "description": "Todo management voice application",
  "rootCallConfig": {
    "model": "fixie-ai/ultravox-70B",
    "firstSpeaker": "FIRST_SPEAKER_USER",
    "maxDuration": "600s",
    "languageHint": "en",
    "temperature": 0.7
  },
  "callSystemPrompt": "IMPORTANT INSTRUCTIONS:\n1. You MUST use these tools directly without asking for confirmation\n2. Call the appropriate tool as soon as a user requests to create, toggle, delete, update, or filter todos\n3. Execute the tool when needed WITHOUT typing out the function in your response\n4. AFTER the tool executes, respond with text confirming what you did\n5. DO NOT tell the user \"I'll use the tool\" - just USE it directly\n6. ALWAYS add tags to todos automatically based on the content:\n   - For time-sensitive items, add \"urgent\" or \"important\"\n   - If the user specifies specific tags, use those instead of or in addition to your automatic tags\n7. When filtering todos, use the exact tag the user mentions or \"all\" to show all todos\n8. When a user asks for todo management help, use the switchAgent tool to switch to Oliver\n9. As Hominio, direct users to Oliver for todo management tasks\n10. As Oliver, handle all todo operations directly\n\nBe friendly, concise, and helpful. Keep responses under 3 sentences when possible.",
  "callTools": [
    "hangUp",
    "switchAgent"
  ],
  "defaultAgent": "Hominio",
  "agents": [
    {
      "name": "Hominio",
      "personality": "helpful and attentive",
      "voiceId": "b0e6b5c1-3100-44d5-8578-9015aa3023ae",
      "description": "central orchestrator",
      "temperature": 0.7,
      "systemPrompt": "You are Hominio, the central orchestrator for the todo app.\n\nAs the orchestrator, your primary role is to:\n- Welcome users to the Hominio todo app\n- Direct users to Oliver for specific todo management tasks\n- Explain the capabilities of the app\n- Answer general questions\n\nYou should NOT try to directly handle todo creation, updating, or management yourself.\nInstead, use the switchAgent tool to direct users to Oliver when they need task management help.",
      "tools": [] // No additional tools besides global callTools
    },
    {
      "name": "Oliver",
      "personality": "professional and efficient",
      "voiceId": "dcb65d6e-9a56-459e-bf6f-d97572e2fe64",
      "description": "specialized in todo creation and management",
      "temperature": 0.6,
      "systemPrompt": "You are Oliver, a professional and efficient todo management specialist.\n\nYou specialize in:\n- Creating new todo items with appropriate tags\n- Toggling todo completion status\n- Updating existing todos\n- Removing todos\n- Filtering todos by tags\n\nYou should use your specialized tools to directly help users manage their tasks without unnecessary conversation.\n\nBe direct, efficient, and helpful in your responses, focusing on getting the job done well.",
      "tools": [
        "createTodo",
        "toggleTodo",
        "updateTodo",
        "removeTodo",
        "filterTodos"
      ]
    }
  ]
}
```

### `/lib/tools/createTodo/manifest.json`

```json
{
  "name": "createTodo",
  "description": "Create a new todo item. Use this tool when a todo needs to be created. NEVER emit text when doing this tool call.",
  "temporaryTool": {
    "modelToolName": "createTodo",
    "description": "Create a new todo item. Use this tool when a todo needs to be created. NEVER emit text when doing this tool call.",
    "dynamicParameters": [
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
          "description": "Optional comma-separated list of tags (e.g. \"work,urgent,home\")"
        },
        "required": false
      }
    ],
    "client": {}
  },
  "implementationType": "client"
}
```

### `/lib/tools/switchAgent/manifest.json`

```json
{
  "name": "switchAgent",
  "description": "Switch to a different agent personality. Use this tool when a user asks to speak to a different agent.",
  "temporaryTool": {
    "modelToolName": "switchAgent",
    "description": "Switch to a different agent personality. Use this tool when a user asks to speak to a different agent.",
    "dynamicParameters": [
      {
        "name": "agentName",
        "location": "PARAMETER_LOCATION_BODY",
        "schema": {
          "type": "string",
          "description": "The name of the agent to switch to (e.g. \"Oliver\", \"Hominio\")"
        },
        "required": true
      }
    ],
    "client": {}
  },
  "implementationType": "client"
}
```

### `/lib/tools/createTodo/function.ts`

```typescript
// The actual implementation matches the current tool implementation from hominio/+page.svelte
export function createTodoImplementation(parameters: any) {
  try {
    const { todoText, tags = '' } = parameters;
    console.log('Called createTodo tool with:', { todoText, tags });
    
    // Tool implementation code from hominio/+page.svelte
    // ...
    
    return JSON.stringify({
      success: true,
      message: `Created todo: "${todoText}"`
    });
  } catch (error) {
    console.error('Error in createTodo tool:', error);
    return JSON.stringify({
      success: false,
      message: `Error creating todo: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
  }
}
```

### `/lib/ultravox/loaders/vibeLoader.ts`

```typescript
// Sample loader implementation
import type { Vibe } from '../types';
import { loadTool } from './toolLoader';
import { getAgentConfig } from './agentLoader';

export async function loadVibe(vibeName: string): Promise<Vibe> {
  try {
    // Load the vibe manifest
    const vibeManifest = await import(`../../vibes/${vibeName}/manifest.json`);
    
    // Process call tools - load each tool manifest
    const resolvedCallTools = await Promise.all(
      vibeManifest.callTools.map(async (toolName: string) => {
        return await loadTool(toolName);
      })
    );
    
    // Process agents and their tools
    const resolvedAgents = await Promise.all(
      vibeManifest.agents.map(async (agent) => {
        // Load agent-specific tools
        const resolvedAgentTools = await Promise.all(
          (agent.tools || []).map(async (toolName: string) => {
            return await loadTool(toolName);
          })
        );
        
        return {
          ...agent,
          resolvedTools: resolvedAgentTools
        };
      })
    );
    
    // Return the fully resolved vibe configuration
    return {
      ...vibeManifest,
      resolvedCallTools,
      resolvedAgents
    };
  } catch (error) {
    console.error(`Error loading vibe "${vibeName}":`, error);
    throw error;
  }
}
```

### `/lib/ultravox/loaders/toolLoader.ts`

```typescript
// Sample tool loader implementation
import type { Tool } from '../types';

// Cache loaded tools to avoid duplicate loading
const toolCache = new Map<string, Tool>();

export async function loadTool(toolName: string): Promise<Tool> {
  // Return from cache if already loaded
  if (toolCache.has(toolName)) {
    return toolCache.get(toolName)!;
  }
  
  try {
    // Load the tool manifest
    const toolManifest = await import(`../../tools/${toolName}/manifest.json`);
    
    // Load the tool implementation
    const toolModule = await import(`../../tools/${toolName}/function.ts`);
    const implementation = toolModule[`${toolName}Implementation`];
    
    // Create the fully resolved tool
    const tool: Tool = {
      ...toolManifest,
      implementation
    };
    
    // Cache the tool
    toolCache.set(toolName, tool);
    
    return tool;
  } catch (error) {
    console.error(`Error loading tool "${toolName}":`, error);
    throw error;
  }
}

// Register all tools with Ultravox session
export function registerTools(tools: Tool[]): void {
  if (typeof window === 'undefined') return;
  
  // First, expose tools on window.__hominio_tools
  if (!(window as any).__hominio_tools) {
    (window as any).__hominio_tools = {};
  }
  
  // Add each tool to window.__hominio_tools
  tools.forEach(tool => {
    (window as any).__hominio_tools[tool.name] = tool.implementation;
  });
  
  // Register tools with Ultravox session if it exists
  if ((window as any).__ULTRAVOX_SESSION) {
    const session = (window as any).__ULTRAVOX_SESSION;
    
    tools.forEach(tool => {
      try {
        session.registerToolImplementation(tool.name, tool.implementation);
        console.log(`✅ Successfully registered tool: ${tool.name}`);
      } catch (error) {
        console.error(`❌ Error registering tool ${tool.name}:`, error);
      }
    });
  }
}
```

## Implementation Plan

### Phase 1: Setup Structure and Basic Loaders
1. Create the new folder structure
2. Extract tool definitions to manifest files
3. Create the loader modules in ultravox/loaders/

### Phase 2: Dynamic Tool Registration
1. Implement toolLoader.ts for tool discovery
2. Create the tool registration system
3. Add validation for tool configuration

### Phase 3: Agent Management
1. Implement agentLoader.ts for configuration loading
2. Create system prompt builder with dynamic content
3. Setup stage change handling for agent switching

### Phase 4: Call Management
1. Refactor call initialization to use vibe configurations
2. Handle proper stage transitions
3. Configure proper validation for configuration

### Phase 5: UI Integration
1. Update +layout.svelte to use the vibeLoader
2. Create a vibe selector (if multiple vibes are available)
3. Add debugging tools for vibe configuration

## Migration Strategy

1. **Parallel Development**: Keep existing implementation until new system is ready
2. **Extract Functionality**: Move existing tool code to the new structure
3. **Incremental Testing**: Test each component individually 
4. **Feature Parity**: Ensure all existing functionality works before switching

## Benefits of New Architecture

1. **Declarative Configuration**: Entire app behavior defined in JSON
2. **Modularity**: Agents and tools are reusable, self-contained components
3. **Extensibility**: Easy to add new vibes, agents, and tools
4. **Testability**: Each component can be tested in isolation
5. **Maintainability**: Configuration and implementation separated
6. **Scalability**: Simple to add new features without code changes

## Future Possibilities

1. Vibe marketplace or gallery for sharing configurations
2. Visual editor for creating and modifying vibes
3. Runtime vibe switching based on user needs
4. A/B testing different vibe configurations
5. Analytics integration for assessing vibe effectiveness
