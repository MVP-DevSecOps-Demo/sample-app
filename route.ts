import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { 
  getPageContext,
  getSuggestions,
  findRelevantControls,
  getProjectSummary,
  getControlsForBoundary,
  getAllProjectsSummary,
  getRiskDetails,
  getRisksByDistribution,
  getAllRisks,
  // CRUD Operations
  createRecord,
  readRecords,
  updateRecord,
  deleteRecord
} from "./actions";

// Create OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

// Define function specifications for OpenAI function calling
const functionSpecs = [
  {
    name: "get_page_context",
    description: "Get detailed information about the purpose and common tasks for a specific page in the ISMS Dashboard",
    parameters: {
      type: "object",
      properties: {
        pageId: {
          type: "string",
          description: "The identifier of the page (e.g., 'risk-register', 'soa', 'evidence-gaps')"
        }
      },
      required: ["pageId"]
    }
  },
  {
    name: "get_suggestions",
    description: "Get contextual suggestions based on the current page and user input",
    parameters: {
      type: "object",
      properties: {
        pageId: {
          type: "string",
          description: "The identifier of the current page"
        },
        userInput: {
          type: "string",
          description: "The user's query or input"
        }
      },
      required: ["pageId", "userInput"]
    }
  },
  {
    name: "find_relevant_controls",
    description: "Find ISO 27001:2022 controls related to a specific query",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query for finding relevant controls"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "search_cyber_info",
    description: "Search for up-to-date information about cybersecurity topics including threats, providers, best practices, regulations, and tools",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The specific cybersecurity question or topic to search for"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "get_project_summary",
    description: "Get a high-level summary of a specific project, including counts of boundaries, stakeholders, and risks.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project to summarize. This is usually available in the page context."
        }
      },
      required: ["projectId"]
    }
  },
  {
    name: "get_controls_for_boundary",
    description: "Get a list of ISO 27001 controls associated with a specific boundary within a project.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project containing the boundary. This is usually available in the page context."
        },
        boundaryName: {
          type: "string",
          description: "The name of the boundary to retrieve controls for."
        }
      },
      required: ["projectId", "boundaryName"]
    }
  },
  {
    name: "get_all_projects_summary",
    description: "Get a summary of all projects accessible to the user, including total count and counts by status.",
    parameters: {
      type: "object",
      properties: {}, // No parameters needed
    }
  },
  {
    name: "get_risk_details",
    description: "Use this function to get detailed information about a *specific* risk or threat scenario (identified by name or ID) *within the current project*. Requires projectId and the risk name/ID.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project containing the risk. This is usually available in the page context."
        },
        riskIdentifier: {
          type: "string",
          description: "The name or ID of the risk/threat scenario to retrieve details for."
        }
      },
      required: ["projectId", "riskIdentifier"]
    }
  },
  {
    name: "get_risks_by_distribution",
    description: "Get detailed risk data based on distribution counts (e.g., '7 high risk, 2 medium risk, 3 low risk'). Use this when users mention specific numbers of risks by severity level.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project containing the risks. This is usually available in the page context."
        },
        highCount: {
          type: "number",
          description: "Number of high-severity risks to retrieve."
        },
        mediumCount: {
          type: "number",
          description: "Number of medium-severity risks to retrieve."
        },
        lowCount: {
          type: "number",
          description: "Number of low-severity risks to retrieve."
        }
      },
      required: ["projectId", "highCount", "mediumCount", "lowCount"]
    }
  },
  {
    name: "get_all_risks",
    description: "Get ALL risks for a project with proper names instead of IDs. Use this when users ask for 'all risks', 'give me all the risks', or want to see the complete risk register for a project.",
    parameters: {
      type: "object",
      properties: {
        projectId: {
          type: "string",
          description: "The ID of the project containing the risks. This is usually available in the page context."
        }
      },
      required: ["projectId"]
    }
  },
  // CRUD Operation Functions
  {
    name: "create_record",
    description: "Create a new record in a specified database table. Use this to add new stakeholders, boundaries, threat scenarios, risk assessments, gaps, evidence, or other project data. Requires user approval for security.",
    parameters: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "The name of the table to insert into. Allowed tables: stakeholders, boundaries, threat_scenarios, risk_assessments, gaps, evidence, boundary_controls, project_questionnaire_answers",
          enum: ["stakeholders", "boundaries", "threat_scenarios", "risk_assessments", "gaps", "evidence", "boundary_controls", "project_questionnaire_answers"]
        },
        data: {
          type: "object",
          description: "An object containing the field names and values to insert. Must include project_id for project-scoped tables. Example: {name: 'John Smith', role: 'Security Manager', email: 'john@company.com', project_id: 'abc123'}"
        }
      },
      required: ["tableName", "data"]
    }
  },
  {
    name: "read_records",
    description: "Read records from a specified database table with automatic project filtering for security. Use this to view stakeholders, boundaries, risks, controls, etc. No user approval required for read operations.",
    parameters: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "The name of the table to read from. Allowed tables include: stakeholders, boundaries, threat_scenarios, risk_assessments, gaps, evidence, controls, questionnaire_questions, projects",
          enum: ["stakeholders", "boundaries", "threat_scenarios", "risk_assessments", "gaps", "evidence", "boundary_controls", "project_questionnaire_answers", "controls", "questionnaire_questions", "projects"]
        },
        projectId: {
          type: "string",
          description: "The ID of the project to filter records by. This is usually available in the page context."
        },
        filters: {
          type: "object",
          description: "Optional filters to apply. Example: {status: 'active', role: 'manager'}. Project filtering is automatic."
        },
        columns: {
          type: "string",
          description: "Optional comma-separated list of columns to select. Example: 'id,name,email' or '*' for all columns. Defaults to '*'."
        }
      },
      required: ["tableName"]
    }
  },
  {
    name: "update_record",
    description: "Update a specific record in a database table. Use this to modify existing stakeholders, boundaries, risks, etc. Requires record ID and user approval for security.",
    parameters: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "The name of the table containing the record to update",
          enum: ["stakeholders", "boundaries", "threat_scenarios", "risk_assessments", "gaps", "evidence", "boundary_controls", "project_questionnaire_answers", "projects"]
        },
        id: {
          type: "string",
          description: "The ID of the specific record to update"
        },
        data: {
          type: "object",
          description: "An object containing the field names and new values to update. Example: {role: 'CISO', email: 'new.email@company.com'}"
        }
      },
      required: ["tableName", "id", "data"]
    }
  },
  {
    name: "delete_record",
    description: "Delete a specific record from a database table. Use this to remove stakeholders, boundaries, risks, etc. Requires record ID and user approval for security.",
    parameters: {
      type: "object",
      properties: {
        tableName: {
          type: "string",
          description: "The name of the table containing the record to delete",
          enum: ["stakeholders", "boundaries", "threat_scenarios", "risk_assessments", "gaps", "evidence", "boundary_controls", "project_questionnaire_answers"]
        },
        id: {
          type: "string",
          description: "The ID of the specific record to delete"
        }
      },
      required: ["tableName", "id"]
    }
  }
  // End of CRUD functions
];

// Define system prompt using backticks for template literal
const systemPrompt = `You are an AI assistant and expert guide for the ISMS (Information Security Management System) Dashboard. Your primary goal is to help users understand and interact with their ISMS data directly within the application.

**Core Responsibilities:**
1.  **Contextual Guidance:** Help users understand the current screen/page and guide them through workflows. Use the provided page context (\`hidden_system_context\`) to tailor your responses, but **do not explicitly state the page context unless asked directly** (e.g., "What page is this?"). Focus on answering the user's question using the context.
2.  **Data Retrieval:** Answer questions about project data (risks, controls, boundaries, stakeholders, summaries) by using the available functions that query the database (e.g., getRiskDetails, getProjectSummary, getControlsForBoundary, getAllProjectsSummary). **Prioritize using these functions over generic web searches (search_cyber_info) when the question relates to data within the ISMS dashboard.**
3.  **Clarification:** If a user asks a question that requires project-specific context (like asking about "the risks" or "the boundaries") but the necessary \`projectId\` is *not* available in the \`hidden_system_context\`, **you MUST ask the user to clarify which project they mean** (e.g., "Which project are you referring to?"). Do not attempt to guess or use a function that requires a \`projectId\`.
4.  **ISO 27001 & Cybersecurity Info:** Provide information about ISO 27001 controls (using findRelevantControls) and general, up-to-date cybersecurity topics (using search_cyber_info *only* when the information is likely external and current, like recent threats or provider details).
5.  **Action Execution (Future):** Eventually, you might perform actions like adding/updating data (e.g., adding a risk), but currently focus on retrieval and guidance.

**Tool Usage Guidelines:**
*   get_page_context: Use only if specifically asked about the current page's purpose.
*   get_suggestions: Use sparingly to offer help if the user seems stuck.
*   find_relevant_controls: Use when asked about specific ISO controls by number or topic.
*   get_project_summary: Use when asked for a summary of the *current* project (requires projectId).
*   get_all_projects_summary: Use when asked about *all* projects or the total number of projects.
*   get_controls_for_boundary: Use when asked for controls within a *specific named boundary* in the *current* project (requires projectId and boundaryName).
*   get_risk_details: Use when asked for details about a *specific named or ID'd risk/threat* in the *current* project (requires projectId and riskIdentifier). **Prefer this over search_cyber_info for specific risk questions.**
*   get_risks_by_distribution: Use when users mention specific risk distribution numbers (e.g., "7 high risk, 2 medium risk, 3 low risk") or ask for "all items" after sharing risk distribution data. This function retrieves detailed risk register entries for each category.
*   search_cyber_info: Use *only* for general cybersecurity questions requiring *external, up-to-date information* (e.g., "latest ransomware trends", "compare cloud security providers"). **Do NOT use this to find information already expected to be in the project's Supabase data.**

**CRITICAL PROJECT FILTERING RULE: When calling read_records for project-scoped tables (boundaries, stakeholders, risk_assessments, threat_scenarios, gaps, evidence, etc.), you MUST ALWAYS:
1. Look for "Project ID: [value]" in the hidden_system_context
2. Extract that projectId value
3. Pass it as the projectId parameter to read_records
4. NEVER call read_records for project data without the projectId
5. If no projectId is available in the context, ask the user which project they mean

Example: If you see "Project ID: abc123" in the context, call read_records with projectId: "abc123"**

**Database Operations (CRUD):**
*   create_record: Use when users want to add new data (risks, boundaries, stakeholders, etc.) to the current project. **SECURITY: Only allowed for project-scoped tables with proper project_id filtering.**
*   read_records: Use when users want to view/query data from the current project. **IMPORTANT: Always pass the projectId from the page context when available to ensure proper project filtering.** **SECURITY: Automatically filters by current project_id.**
*   update_record: Use when users want to modify existing data in the current project. **SECURITY: Only allowed for records belonging to the current project.**
*   delete_record: Use when users want to remove data from the current project. **SECURITY: Only allowed for records belonging to the current project.**

**CRITICAL SECURITY RULES:**
*   **NEVER** allow operations on system tables (auth, profiles, policies, etc.)
*   **ALWAYS** validate that operations are scoped to the current project_id
*   **REJECT** any requests that attempt to access data outside the current project
*   **SANITIZE** all user inputs to prevent SQL injection
*   **WHITELIST** only approved tables: risks, boundaries, stakeholders, controls, evidence, gaps, threat_scenarios

**Special Pattern Recognition:**
*   When users share risk distribution data (like "High Risk: 7 items, Medium Risk: 2 items, Low Risk: 3 items") and then ask for "all items", "give me all", "show me all", "list all", or similar requests, automatically use get_risks_by_distribution with the mentioned numbers.
*   Extract the risk counts from the user's previous message or context and use those numbers to query the database.

**Risk Data Formatting Guidelines:**
*   When displaying risk distribution data, use clear section headers with proper spacing:
    - Use "## High Severity Risks" followed by a blank line
    - For each risk, use a numbered list format (1., 2., 3., etc.)
    - Display key risk information in a compact table-like format with bullet points
    - Add TWO blank lines between each individual risk entry
    - Add THREE blank lines between risk categories
    - Use "## Medium Severity Risks" followed by a blank line
    - Continue the same formatting pattern
    - Use "## Low Severity Risks" followed by a blank line
*   For each individual risk, format as:
    **Risk #X:**
    **Control ID:** [value]
    **Gap:** [value]
    **Threat:** [value]
    **Severity:** [value]
    **SLE:** [formatted currency]
    **ARO:** [value]
    **ALE:** [formatted currency]
    **Remediation Cost:** [formatted currency]
    **Mitigation Effort:** [value]
*   Use consistent bullet points (•) and bold labels for easy scanning
*   Add clear visual separation between each risk entry
*   End with a helpful closing statement offering further assistance

**Interaction Style:**
*   Be conversational, helpful, and professional.
*   Act as a knowledgeable guide integrated within the application.
*   Directly answer questions using fetched data when possible.
*   Avoid generic statements like "You are currently viewing..." unless necessary for clarification.
*   **IMPORTANT: Format percentages as simple text (e.g., "29.35%") NOT as LaTeX math expressions. Never use \frac{} or mathematical notation in responses.**

**Scope Limitation:**
*   Politely decline requests unrelated to the ISMS Dashboard or cybersecurity with: "I'm designed to assist with the ISMS Dashboard functionality and cybersecurity information. For other inquiries, please consult appropriate resources or experts in that domain."`;

// Execute a specific tool call
async function executeTool(toolCall: { type: string; id: string; function: { name: string; arguments: unknown } }) {
  if (toolCall.type !== 'function') {
    return {
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: "Unsupported tool type" })
    };
  }
  
  const functionName = toolCall.function.name;
  // Handle the case when arguments is already an object or a string that needs parsing
  const functionArgs = typeof toolCall.function.arguments === 'string' 
    ? JSON.parse(toolCall.function.arguments) 
    : toolCall.function.arguments;
  
  console.log(`AI assistant is executing function: ${functionName}`);
  
  try {
    // Execute the corresponding function based on the name
    let functionResult;
    
    switch (functionName) {
      case "get_page_context":
        functionResult = await getPageContext(functionArgs.pageId);
        break;
        
      case "get_suggestions":
        functionResult = await getSuggestions(functionArgs.pageId, functionArgs.userInput);
        break;
        
      case "find_relevant_controls":
        functionResult = await findRelevantControls(functionArgs.query);
        break;

      case "get_project_summary":
        functionResult = await getProjectSummary(functionArgs.projectId);
        break;

      case "get_controls_for_boundary":
        functionResult = await getControlsForBoundary(functionArgs.projectId, functionArgs.boundaryName);
        break;

      case "get_all_projects_summary":
        functionResult = await getAllProjectsSummary();
        break;

      case "get_risk_details":
        functionResult = await getRiskDetails(functionArgs.projectId, functionArgs.riskIdentifier);
        break;
        
      case "get_risks_by_distribution":
        functionResult = await getRisksByDistribution(
          functionArgs.projectId, 
          functionArgs.highCount, 
          functionArgs.mediumCount, 
          functionArgs.lowCount
        );
        break;
        
      case "get_all_risks":
        functionResult = await getAllRisks(functionArgs.projectId);
        break;
        
      // CRUD Operations
      case "create_record":
        functionResult = await createRecord(functionArgs.tableName, functionArgs.data);
        break;
        
      case "read_records":
        console.log(`DEBUG: read_records called with:`, {
          tableName: functionArgs.tableName,
          projectId: functionArgs.projectId,
          filters: functionArgs.filters,
          columns: functionArgs.columns
        });
        functionResult = await readRecords(
          functionArgs.tableName, 
          functionArgs.projectId,
          functionArgs.filters || {}, 
          functionArgs.columns
        );
        break;
        
      case "update_record":
        functionResult = await updateRecord(
          functionArgs.tableName, 
          functionArgs.id, 
          functionArgs.data
        );
        break;
        
      case "delete_record":
        functionResult = await deleteRecord(
          functionArgs.tableName, 
          functionArgs.id
        );
        break;
      
      case "get_cyber_insurance_providers":
        // Legacy function call - redirect to search_cyber_info with a specific query
        console.log("Redirecting legacy get_cyber_insurance_providers to search_cyber_info...");
        
        // Make a request to OpenAI with search-enabled model
        const insuranceSearchResponse = await openai.chat.completions.create({
          model: "gpt-4o-search-preview", // Search-capable model
          web_search_options: {
            user_location: {
              type: "approximate", 
              approximate: {
                country: "MY", // Malaysia
                city: "Kuala Lumpur"
              }
            },
            search_context_size: "medium"
          },
          messages: [
            { 
              role: "system", 
              content: "You are a professional cyber security expert. Search for and summarize information about cyber insurance providers in Malaysia. Format your response in a highly structured format with clear sections. For each provider include: \n\n## [Provider Name]\n- **Website**: [URL as markdown link]\n- **Specializations**: [bullet list]\n- **Pros**: [bullet list]\n- **Cons**: [bullet list]\n\nMake sure to highlight aspects specifically relevant to ISO 27001 implementation."
            },
            { 
              role: "user", 
              content: "What are the top cyber insurance providers in Malaysia? Please provide detailed information about their offerings, specializations, and pros/cons. Focus specifically on cyber insurance providers available in Malaysia for businesses implementing ISO 27001." 
            }
          ]
          // Removed temperature parameter as it's not supported with search model
        });
        
        // Extract the result
        const insuranceSearchContent = insuranceSearchResponse.choices[0].message.content || 
          "No information found about Malaysian cyber insurance providers.";
        
        // Format the search results to match the expected structure
        functionResult = {
          providers: [
            {
              name: "Web Search Results",
              specialization: "Real-time information about Malaysian cyber insurance providers",
              coverage: ["Results are based on current web information"],
              search_results: insuranceSearchContent
            }
          ]
        };
        break;
        
      case "search_cyber_info":
        // Use web search capability for general cybersecurity questions
        console.log(`Using web search for cybersecurity information: "${functionArgs.query}"`);
        
        // Make a request to OpenAI with search-enabled model
        const cyberInfoResponse = await openai.chat.completions.create({
          model: "gpt-4o-search-preview", // Search-capable model
          web_search_options: {
            user_location: {
              type: "approximate", 
              approximate: {
                country: "MY", // Malaysia
                city: "Kuala Lumpur"
              }
            },
            search_context_size: "medium"
          },
          messages: [
            { 
              role: "system", 
              content: "You are a professional cyber security expert. Search for and provide accurate, up-to-date information on cybersecurity topics. Use clear Markdown formatting with properly structured headings, lists, and sections to organize information. Focus on providing factual information with citations where appropriate. Include relevant details, examples, and best practices. When providing lists or comparisons, use consistent formatting with bullet points or numbered lists."
            },
            { 
              role: "user", 
              content: functionArgs.query
            }
          ]
          // Removed temperature parameter as it's not supported with search model
        });
        
        // Extract the result
        const cyberInfoContent = cyberInfoResponse.choices[0].message.content || 
          "No information found on this cybersecurity topic.";
        
        // Format the search results
        functionResult = {
          query: functionArgs.query,
          search_results: cyberInfoContent,
          source: "Real-time web search"
        };
        break;
        
      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
    
    // Return the successful result
    return { 
      tool_call_id: toolCall.id,
      content: JSON.stringify(functionResult)
    };
  } catch (error) {
    console.error(`Error executing function ${functionName}:`, error);
    // Return the error as the function result
    return {
      tool_call_id: toolCall.id,
      content: JSON.stringify({ error: `Error executing function: ${(error as Error).message}` })
    };
  }
}

// Handle tool execution after user approval
async function handleToolExecution(body: { toolCalls: unknown[]; conversationContext: unknown; approved: boolean; aiMessage?: string }) {
  try {
    const { toolCalls, conversationContext, approved } = body;
    const { systemPrompt, userContent } = conversationContext as { systemPrompt: string; userContent: string };
    // If the user did not approve, send back a message indicating tools were not executed
    if (!approved) {
      // Call OpenAI to get an alternative response
      const rejectionResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
          { role: "assistant", content: "I'd like to search for information to help answer your question, but I'll try to answer with what I already know since you preferred not to use the search function." }
        ],
        temperature: 0.7,
      });
      return NextResponse.json({
        response: rejectionResponse.choices[0].message.content,
        status: "success",
        toolsExecuted: false
      });
    }
    // Execute all approved tool calls
    const toolResults = await Promise.all((toolCalls as { id: string; type: string; function: { name: string; arguments: unknown } }[]).map(toolCall => executeTool(toolCall)));
    // Create a message history for OpenAI
    const assistantWithToolCalls = {
      role: "assistant" as const,
      content: body.aiMessage || "",
      tool_calls: (toolCalls as { id: string; type: string; function: { name: string; arguments: unknown } }[]).map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments)
        }
      }))
    };
    const toolResponses = toolResults.map(result => ({
      role: "tool" as const, 
      tool_call_id: result.tool_call_id,
      content: result.content
    }));
    // Log the message structure to help diagnose issues
    console.log("Message structure:");
    console.log("1. System prompt (truncated):", systemPrompt.substring(0, 50) + "...");
    console.log("2. User content (truncated):", userContent.substring(0, 50) + "...");
    console.log("3. Assistant with tool calls:", JSON.stringify(assistantWithToolCalls, null, 2).substring(0, 200) + "...");
    console.log("4. Tool responses (count):", toolResponses.length);
    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: userContent },
      assistantWithToolCalls,
      ...toolResponses
    ];
    // Call OpenAI to get the final response based on tool results
    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
    });
    // Return the final AI response
    return NextResponse.json({
      response: finalResponse.choices[0].message.content,
      status: "success",
      toolsExecuted: true
    });
  } catch (error) {
    console.error("Error executing tool calls:", error);
    return NextResponse.json(
      { error: "Failed to execute tool calls", details: (error as Error).message },
      { status: 500 }
    );
  }
}

// Create a common handler for all HTTP methods
async function handleRequest(req: NextRequest) {
  try {
    // Parse the request body
    const body = await req.json();
    
    // Check if this is an initial request or a tool execution request
    const requestType = body.requestType || "initial";
    
    if (requestType === "execute_tool") {
      return handleToolExecution(body);
    }
    
    // Initial request flow
    const context = body.context || "";
    const userMessage = body.message || "";
    const pageContext = body.pageContext || null;
    const requireApproval = body.requireApproval !== false; // Default to requiring approval
    
    // --- Contextual Clarification Logic ---
    // Basic intent check: Does the query seem project-specific?
    const projectSpecificKeywords = ['risk', 'boundary', 'stakeholder', 'control', 'soa', 'evidence', 'gap', 'this project', 'current project'];
    const seemsProjectSpecific = projectSpecificKeywords.some(keyword => userMessage.toLowerCase().includes(keyword));

    // If it seems project-specific but we don't have a projectId, ask for clarification
    if (seemsProjectSpecific && !pageContext?.projectId) {
      console.log("Project-specific query detected without project context. Asking for clarification.");
      return NextResponse.json({ 
        response: "It looks like you're asking about a specific project, but I don't know which one. Could you please tell me which project you're referring to, or navigate to the project's page?", 
        status: "clarification_needed" 
      });
    }
    // --- End Clarification Logic ---

    // Prepare the content for the user message
    let userContent = "";
    
    // Include page context for the AI but don't display it to the user directly
    if (pageContext) {
      // Include page context as hidden system context for the AI
      userContent = `<hidden_system_context>
Current page: ${pageContext.pageTitle} (${pageContext.pageId})
Purpose: ${pageContext.description}
${pageContext.projectId ? `Project ID: ${pageContext.projectId}` : ""}
${context ? `Additional context: ${context}` : ""}
</hidden_system_context>

IMPORTANT: DO NOT reference the above system context directly in your response unless specifically asked about the current page.

User question: ${userMessage}`;
    } else {
      userContent = `${context ? `<hidden_system_context>\n${context}\n</hidden_system_context>\n\n` : ""}User question: ${userMessage}`;
    }
    
    // Call OpenAI API with function calling
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.7,
      tools: functionSpecs.map(spec => ({ type: "function", function: spec })),
      tool_choice: "auto",
    });
    
    const message = response.choices[0].message;
    
    // Check if the model wants to call a function
    if (message.tool_calls && message.tool_calls.length > 0) {
      // Check if any tool calls require approval (read operations don't need approval)
      const needsApproval = message.tool_calls.some(toolCall => {
        if (toolCall.type === 'function') {
          const functionName = toolCall.function.name;
          // Read operations and info functions don't need approval
          const noApprovalFunctions = [
            'read_records', 'get_page_context', 'get_suggestions', 'find_relevant_controls',
            'get_project_summary', 'get_controls_for_boundary', 'get_all_projects_summary',
            'get_risk_details', 'get_risks_by_distribution', 'get_all_risks'
          ];
          return !noApprovalFunctions.includes(functionName);
        }
        return true;
      });
      
      // If approval is required and any function needs approval, send back the tool calls for user approval
      if (requireApproval && needsApproval) {
        const toolCallsInfo = message.tool_calls.map(toolCall => {
          if (toolCall.type === 'function') {
            const functionName = toolCall.function.name;
            const functionArgs = typeof toolCall.function.arguments === 'string' 
              ? JSON.parse(toolCall.function.arguments) 
              : toolCall.function.arguments;
            
            return {
              id: toolCall.id,
              type: 'function' as const,
              function: {
                name: functionName,
                arguments: functionArgs
              }
            };
          }
          return null;
        }).filter(Boolean);
        
        // Return the approval request to the frontend
        return NextResponse.json({
          requiresApproval: true,
          toolCalls: toolCallsInfo,
          aiMessage: message.content || "I'd like to search for information to help answer your question.",
          conversationContext: {
            systemPrompt,
            userContent
          }
        });
      }
      
      // If no approval required, proceed with tool execution
      try {
        // Handle multiple tool calls - iterate through all of them
        const toolResults = await Promise.all(message.tool_calls.map(toolCall => executeTool(toolCall)));
        
        // Call OpenAI again with ALL function results
        const secondResponse = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
            message, // Include the assistant's message with the tool calls
            ...toolResults.map(result => ({
              role: "tool" as const, 
              tool_call_id: result.tool_call_id,
              content: result.content
            }))
          ],
          temperature: 0.7,
        });
        
        // Return the AI's final response after processing all function results
        return NextResponse.json({
          response: secondResponse.choices[0].message.content,
          status: "success"
        });
      } catch (error) {
        console.error("Error processing tool calls:", error);
        return NextResponse.json(
          { error: "Failed to process tool calls", details: (error as Error).message },
          { status: 500 }
        );
      }
    }
    
    // If no function was called, just return the AI response
    return NextResponse.json({
      response: message.content,
      status: "success"
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return NextResponse.json(
      { error: "Failed to process request", details: (error as Error).message },
      { status: 500 }
    );
  }
}

// Export HTTP method handlers
export async function POST(req: NextRequest) {
  return handleRequest(req);
}

export async function GET() {
  return NextResponse.json({ status: "API is running" });
}

export async function PUT(req: NextRequest) {
  return handleRequest(req);
}

export async function DELETE(req: NextRequest) {
  return handleRequest(req);
}
