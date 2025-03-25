import { agentConfigs, createAgentStageChangeData, type AgentName, type ToolResponse, currentAgent, currentFilter } from './agents';

// Define types for Ultravox session
interface UltravoxSessionInterface {
    registerTool: (name: string, callback: (params: unknown) => Promise<ToolResponse>) => void;
    registerToolImplementation?: (name: string, callback: (params: unknown) => string) => void;
}

// Function to register all Hominio tools with Ultravox
export function registerHominionTools(session: UltravoxSessionInterface): void {
    if (!session) {
        console.error('No Ultravox session provided to registerHominionTools');
        return;
    }

    console.log('Registering Hominio tools with Ultravox session');

    // Register the filterTodos tool
    session.registerTool('filterTodos', async (params: unknown) => {
        try {
            // Use the tag parameter, defaulting to 'all'
            const { tag = 'all' } = (params as { tag?: string }) || {};
            console.log(`Filtering todos by tag: ${tag}`);

            // Update the current filter in the store
            currentFilter.set(tag);

            // Return success response
            return { success: true, message: `Filtered todos by tag: ${tag}` };
        } catch (error) {
            console.error('Error filtering todos:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error filtering todos'
            };
        }
    });

    // Register the switchAgent tool
    session.registerTool('switchAgent', async (params: unknown) => {
        try {
            const { agentName = 'Hominio' } = (params as { agentName?: string }) || {};
            console.log(`🧩 TOOL CALLED: switchAgent with params:`, params);

            // Normalize agent name
            let normalizedName: AgentName = 'Hominio';
            if (agentName === 'Oliver') {
                normalizedName = 'Oliver';
            }

            // Update the current agent in the store
            currentAgent.set(normalizedName);
            console.log(`🧩 Updated currentAgent store to: ${normalizedName}`);

            // Force update any global references
            if (typeof window !== 'undefined') {
                (window as Window & typeof globalThis & { currentAgentName: string }).currentAgentName = normalizedName;
            }

            // Use the centralized function to create stage change data
            const stageChangeData = createAgentStageChangeData(normalizedName);

            const toolResult = {
                responseType: 'new-stage',
                result: JSON.stringify(stageChangeData)
            };

            return toolResult;
        } catch (error) {
            console.error('❌ ERROR switching agent:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error switching agent'
            };
        }
    });

    // TODO: Implement other tools (createTodo, toggleTodo, etc.)
    // These should connect to your Loro storage implementation

    console.log('Hominio tools registered successfully');
}

export async function switchAgent(params: { agentName?: string }): Promise<Response> {
    console.log('🔄 SERVER: switchAgent called with params:', params);

    try {
        // Normalize agent name
        let normalizedName = (params.agentName || 'Hominio') as AgentName;

        // Make sure we have a valid enum value
        if (!(normalizedName in agentConfigs)) {
            normalizedName = 'Hominio';
        }

        // Update the current agent in the store
        currentAgent.set(normalizedName);

        // Use the centralized function to create stage change data
        const stageChangeData = createAgentStageChangeData(normalizedName);

        return new Response(JSON.stringify(stageChangeData), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('❌ SERVER ERROR in switchAgent:', error);
        return new Response(
            JSON.stringify({
                success: false,
                message: 'Failed to switch agent',
                error: error instanceof Error ? error.message : 'Unknown error'
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
} 