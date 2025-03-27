import type { ToolParameters } from '$lib/ultravox/types';

// Central registry that imports the individual tool implementations
import { createTodoImplementation } from '$lib/tools/createTodo/function';
import { toggleTodoImplementation } from '$lib/tools/toggleTodo/function';
import { removeTodoImplementation } from '$lib/tools/removeTodo/function';
import { updateTodoImplementation } from '$lib/tools/updateTodo/function';
import { filterTodosImplementation } from '$lib/tools/filterTodos/function';
import { switchAgentImplementation } from '$lib/tools/switchAgent/function';
import { hangUpImplementation } from '$lib/tools/hangUp/function';
import { switchVibeImplementation } from '$lib/tools/switchVibe/function';

// Central registry of all available tool implementations
// This simply routes calls to the individual implementations
export const toolRegistry = {
    createTodo: (params: ToolParameters) => createTodoImplementation(params),
    toggleTodo: (params: ToolParameters) => toggleTodoImplementation(params),
    removeTodo: (params: ToolParameters) => removeTodoImplementation(params),
    updateTodo: (params: ToolParameters) => updateTodoImplementation(params),
    filterTodos: (params: ToolParameters) => filterTodosImplementation(params),
    switchAgent: (params: ToolParameters) => switchAgentImplementation(params),
    hangUp: (params: ToolParameters) => hangUpImplementation(params),
    switchVibe: (params: ToolParameters) => switchVibeImplementation(params)
}; 