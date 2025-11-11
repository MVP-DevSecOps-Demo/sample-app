import { createClient } from "@/utils/supabase/server";
import { getProjectById, getProjects } from "@/services/project-service"; // Added getProjects
import { getBoundaries } from "@/services/boundary-service";
import { getStakeholders } from "@/services/stakeholder-service";
import { getRiskRegisterForProject, getFullRiskRegisterData, getEditableRiskAssessments } from "@/services/risk-register-service"; // Added getFullRiskRegisterData and getEditableRiskAssessments
import { getBoundaryControlsWithDetails } from "@/services/boundary-control-service"; // Use the one with details

/**
 * Get all risks for a project with proper names instead of IDs
 * @param projectId The ID of the project
 * @returns All detailed risk data for the project
 */
export async function getAllRisks(projectId: string) {
  try {
    console.log(`DEBUG getAllRisks: Starting for project ${projectId}`);
    
    // Use server-side client to query the database directly
    const supabase = await createClient();
    
    // Step 1: Get all risk assessments for the project
    console.log(`DEBUG getAllRisks: Fetching risk assessments...`);
    const { data: riskAssessments, error } = await supabase
      .from('risk_assessments')
      .select('*')
      .eq('project_id', projectId)
      .order('sle', { ascending: false }); // Order by SLE descending to get highest impact first

    if (error) {
      console.error(`DEBUG getAllRisks: Error fetching risk assessments:`, error);
      throw new Error(`Failed to fetch risk assessments: ${error.message}`);
    }

    const editableRiskAssessments = riskAssessments || [];
    console.log(`DEBUG getAllRisks: Found ${editableRiskAssessments.length} risk assessments`);

    // Step 2: Get all related data separately
    console.log(`DEBUG getAllRisks: Fetching related data...`);
    const [controlsData, gapsData, threatsData] = await Promise.all([
      supabase.from('controls').select('id, reference, description'),
      supabase.from('gaps').select('id, title, control_id').eq('project_id', projectId),
      supabase.from('threat_scenarios').select('id, name, description, threat_actor_type').eq('project_id', projectId)
    ]);

    console.log(`DEBUG getAllRisks: Controls: ${controlsData.data?.length || 0}, Gaps: ${gapsData.data?.length || 0}, Threats: ${threatsData.data?.length || 0}`);

    // Step 3: Build lookup maps
    const controlsMap = new Map();
    const gapsMap = new Map();
    const threatsMap = new Map();

    if (controlsData.data) {
      controlsData.data.forEach(control => {
        controlsMap.set(control.id, control);
      });
    }

    if (gapsData.data) {
      gapsData.data.forEach(gap => {
        gapsMap.set(gap.id, gap);
      });
    }

    if (threatsData.data) {
      threatsData.data.forEach(threat => {
        threatsMap.set(threat.id, threat);
      });
    }

    // Step 4: Categorize risks by risk score (using risk_rating as severity indicator)
    const highRisks = editableRiskAssessments.filter(risk => risk.risk_rating === 'High' || risk.risk_rating === 'high');
    const mediumRisks = editableRiskAssessments.filter(risk => risk.risk_rating === 'Medium' || risk.risk_rating === 'medium');
    const lowRisks = editableRiskAssessments.filter(risk => risk.risk_rating === 'Low' || risk.risk_rating === 'low');

    console.log(`DEBUG getAllRisks: Risk distribution - High: ${highRisks.length}, Medium: ${mediumRisks.length}, Low: ${lowRisks.length}`);

    // Step 5: Format the results with detailed risk register entry format
    const formatRisk = (risk: typeof editableRiskAssessments[0]) => {
      // Calculate ALE
      const calculateAle = (sle: number | null, aro: number | null): number | null => {
        if (sle === null || aro === null) return null;
        return sle * aro;
      };
      
      // Format currency
      const formatCurrency = (value: number | null): string => {
        if (value === null || value === undefined) return 'N/A';
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(value);
      };
      
      // Get threat information from available risk fields
      const threatName = risk.threat_event || 'Unknown Threat';
      const threatDescription = risk.vulnerability_control_gap || '';
      const threatActor = 'Unknown';

      // Set default gap information since gap_id doesn't exist in database
      const gapTitle = 'No specific gap identified';
      const controlReference = 'N/A';

      const ale = calculateAle(null, null); // SLE and ARO fields don't exist in database
      
      return {
        // Basic risk information
        id: risk.id || risk.asset, // Use id field or asset as fallback
        threatName: threatName,
        description: threatDescription,
        threatActor: threatActor,
        
        // Financial metrics
        sle: null, // SLE field doesn't exist in database
        aro: null, // ARO field doesn't exist in database
        ale: ale,
        
        // Risk assessment
        severity: risk.risk_rating, // Use risk_rating as severity
        
        // Additional details for comprehensive risk register entry
        controlId: controlReference,
        gap: gapTitle,
        remediationCost: null, // remediation_costs field doesn't exist
        mitigationEffort: null, // mitigation_effort field doesn't exist
        remediationDetails: risk.treatment_plan || 'N/A', // Use FAIR treatment plan field
        
        // Formatted display text for easy copying (same format as table drag/drop)
        formattedEntry: `Risk Register Entry:
Control ID: ${controlReference}
Gap: ${gapTitle}
Threat Scenario: ${threatName}
Severity: ${risk.risk_rating || 'N/A'}
SLE: ${formatCurrency(null)}
ARO: ${'N/A'}
ALE: ${formatCurrency(ale)}
Remediation Cost: ${formatCurrency(null)}
Mitigation Effort: ${'N/A'}
Remediation Details: ${risk.treatment_plan || 'N/A'}`
      };
    };

    // Step 6: Format all risks
    const formattedHighRisks = highRisks.map(formatRisk);
    const formattedMediumRisks = mediumRisks.map(formatRisk);
    const formattedLowRisks = lowRisks.map(formatRisk);

    console.log(`DEBUG getAllRisks: Successfully formatted all risks`);

    return {
      projectId,
      actualDistribution: {
        high: highRisks.length,
        medium: mediumRisks.length,
        low: lowRisks.length,
        total: editableRiskAssessments.length
      },
      risks: {
        high: formattedHighRisks,
        medium: formattedMediumRisks,
        low: formattedLowRisks
      },
      summary: {
        totalReturned: formattedHighRisks.length + formattedMediumRisks.length + formattedLowRisks.length
      }
    };

  } catch (error) {
    console.error("Error getting all risks:", error);
    return {
      error: `Could not retrieve all risks: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get risks by distribution counts (e.g., "7 high risk, 2 medium risk, 3 low risk")
 * @param projectId The ID of the project
 * @param highCount Number of high risks to retrieve
 * @param mediumCount Number of medium risks to retrieve
 * @param lowCount Number of low risks to retrieve
 * @returns Detailed risk data matching the distribution
 */
export async function getRisksByDistribution(projectId: string, highCount: number, mediumCount: number, lowCount: number) {
  try {
    // Use server-side client to query the database directly
    const supabase = await createClient();
    
    // Step 1: Get all risk assessments for the project
    const { data: riskAssessments, error } = await supabase
      .from('risk_assessments')
      .select('*')
      .eq('project_id', projectId)
      .order('sle', { ascending: false }); // Order by SLE descending to get highest impact first

    if (error) {
      throw new Error(`Failed to fetch risk assessments: ${error.message}`);
    }

    const editableRiskAssessments = riskAssessments || [];

    // Step 2: Get all related data separately
    const [controlsData, gapsData, threatsData] = await Promise.all([
      supabase.from('controls').select('id, reference, description'),
      supabase.from('gaps').select('id, title, control_id').eq('project_id', projectId),
      supabase.from('threat_scenarios').select('id, name, description, threat_actor_type').eq('project_id', projectId)
    ]);

    // Step 3: Build lookup maps
    const controlsMap = new Map();
    const gapsMap = new Map();
    const threatsMap = new Map();

    if (controlsData.data) {
      controlsData.data.forEach(control => {
        controlsMap.set(control.id, control);
      });
    }

    if (gapsData.data) {
      gapsData.data.forEach(gap => {
        gapsMap.set(gap.id, gap);
      });
    }

    if (threatsData.data) {
      threatsData.data.forEach(threat => {
        threatsMap.set(threat.id, threat);
      });
    }

    // Step 4: Categorize risks by severity
    const highRisks = editableRiskAssessments.filter(risk => risk.risk_rating === 'High' || risk.risk_rating === 'high');
    const mediumRisks = editableRiskAssessments.filter(risk => risk.risk_rating === 'Medium' || risk.risk_rating === 'medium');
    const lowRisks = editableRiskAssessments.filter(risk => risk.risk_rating === 'Low' || risk.risk_rating === 'low');

    // Step 5: Get the requested number of risks from each category
    const selectedHighRisks = highRisks.slice(0, highCount);
    const selectedMediumRisks = mediumRisks.slice(0, mediumCount);
    const selectedLowRisks = lowRisks.slice(0, lowCount);

    // Step 6: Format the results with detailed risk register entry format
    const formatRisk = (risk: typeof editableRiskAssessments[0]) => {
      // Calculate ALE
      const calculateAle = (sle: number | null, aro: number | null): number | null => {
        if (sle === null || aro === null) return null;
        return sle * aro;
      };
      
      // Format currency
      const formatCurrency = (value: number | null): string => {
        if (value === null || value === undefined) return 'N/A';
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        }).format(value);
      };
      
      // Get threat information from available risk fields
      const threatName = risk.threat_event || 'Unknown Threat';
      const threatDescription = risk.vulnerability_control_gap || '';
      const threatActor = 'Unknown';

      // Set default gap information since gap_id doesn't exist in database
      const gapTitle = 'No specific gap identified';
      const controlReference = 'N/A';

      const ale = calculateAle(null, null); // SLE and ARO fields don't exist in database
      
      return {
        // Basic risk information
        id: risk.id || risk.asset, // Use id field or asset as fallback
        threatName: threatName,
        description: threatDescription,
        threatActor: threatActor,
        
        // Financial metrics
        sle: null, // SLE field doesn't exist in database
        aro: null, // ARO field doesn't exist in database
        ale: ale,
        
        // Risk assessment
        severity: risk.risk_rating, // Use risk_rating as severity
        
        // Additional details for comprehensive risk register entry
        controlId: controlReference,
        gap: gapTitle,
        remediationCost: null, // remediation_costs field doesn't exist
        mitigationEffort: null, // mitigation_effort field doesn't exist
        remediationDetails: risk.treatment_plan || 'N/A', // Use FAIR treatment plan field
        
        // Formatted display text for easy copying (same format as table drag/drop)
        formattedEntry: `Risk Register Entry:
Control ID: ${controlReference}
Gap: ${gapTitle}
Threat Scenario: ${threatName}
Severity: ${risk.risk_rating || 'N/A'}
SLE: ${formatCurrency(null)}
ARO: ${'N/A'}
ALE: ${formatCurrency(ale)}
Remediation Cost: ${formatCurrency(null)}
Mitigation Effort: ${'N/A'}
Remediation Details: ${risk.treatment_plan || 'N/A'}`
      };
    };

    // Step 7: Format all risks (removed async/await since formatRisk is now synchronous)
    const formattedHighRisks = selectedHighRisks.map(formatRisk);
    const formattedMediumRisks = selectedMediumRisks.map(formatRisk);
    const formattedLowRisks = selectedLowRisks.map(formatRisk);

    return {
      projectId,
      requestedDistribution: {
        high: highCount,
        medium: mediumCount,
        low: lowCount
      },
      actualDistribution: {
        high: highRisks.length,
        medium: mediumRisks.length,
        low: lowRisks.length,
        total: editableRiskAssessments.length
      },
      risks: {
        high: formattedHighRisks,
        medium: formattedMediumRisks,
        low: formattedLowRisks
      },
      summary: {
        totalRequested: highCount + mediumCount + lowCount,
        totalReturned: formattedHighRisks.length + formattedMediumRisks.length + formattedLowRisks.length
      }
    };

  } catch (error) {
    console.error("Error getting risks by distribution:", error);
    return {
      error: `Could not retrieve risks by distribution: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Backend Action Framework for AI Assistant
 * 
 * This file defines secure functions that the AI assistant can invoke
 * to provide more contextual information and perform actions on behalf of users.
 */

// Page context information for different parts of the application
const pageContextInfo = {
  // Dashboard pages
  "dashboard-main": {
    title: "Dashboard Overview",
    purpose: "Provides a high-level view of all ISMS projects and their statuses.",
    commonTasks: [
      "View project statistics",
      "Navigate to specific projects",
      "Check overall compliance status"
    ],
    tips: [
      "Use the sidebar for quick navigation between different areas of the dashboard",
      "The project cards show summary information - click on a project to see details"
    ]
  },
  
  // Projects pages
  "projects-list": {
    title: "Projects List",
    purpose: "View and manage all ISMS projects in one place.",
    commonTasks: [
      "Create a new project",
      "Filter projects by status or other criteria",
      "Access existing projects"
    ],
    tips: [
      "Use the filter options at the top to find specific projects",
      "Click the 'New Project' button to create a new ISMS project"
    ]
  },
  
  "project-details": {
    title: "Project Details",
    purpose: "Central hub for accessing all aspects of a specific ISMS project.",
    commonTasks: [
      "Review project details",
      "Navigate to different project sections (Risk Register, SOA, etc.)",
      "Check project progress"
    ],
    tips: [
      "Use the tabs to navigate between different project sections",
      "The progress summary shows how far along the project is in its implementation"
    ]
  },
  
  // Risk Management
  "risk-register": {
    title: "Risk Register",
    purpose: "Identify, assess, and manage information security risks for the project.",
    commonTasks: [
      "Add new risks",
      "Update risk assessments",
      "View risk distribution by severity",
      "Link risks to controls"
    ],
    tips: [
      "Remember to include both threat scenarios and vulnerabilities when adding risks",
      "Use the risk matrix to prioritize which risks to address first",
      "Link risks to specific ISO controls in the SOA section"
    ],
    insuranceProviders: [
      {
        name: "CyberInsure Pro",
        specialization: "Comprehensive cyber insurance for medium-large organizations",
        website: "https://www.cyberinsure-pro.com"
      },
      {
        name: "SecureGuard Insurance",
        specialization: "Tailored insurance for ISO 27001 compliant businesses",
        website: "https://www.secureguard-insurance.com"
      },
      {
        name: "RiskShield Partners",
        specialization: "Specialized in cyber incident response coverage",
        website: "https://www.riskshield-partners.com"
      }
    ]
  },
  
  // Statement of Applicability
  "soa": {
    title: "Statement of Applicability",
    purpose: "Define which ISO 27001:2022 controls apply to the project and their implementation status.",
    commonTasks: [
      "Mark controls as applicable/not applicable",
      "Document rationale for exclusions",
      "Update implementation status of controls",
      "Link controls to boundaries"
    ],
    tips: [
      "Not all controls will apply to every project - be sure to document why certain controls are excluded",
      "Controls should be tied to specific boundaries where they are implemented",
      "Regularly review the SOA as the project evolves"
    ]
  },
  
  // Evidence Gaps
  "evidence-gaps": {
    title: "Evidence Gaps",
    purpose: "Identify and track gaps in evidence needed for compliance with ISO 27001:2022 controls.",
    commonTasks: [
      "Record evidence of control implementation",
      "Identify gaps in evidence",
      "Assign tasks to collect missing evidence",
      "Track evidence collection progress"
    ],
    tips: [
      "Evidence should be specific and demonstrable",
      "For each control, document both the evidence you have and what's still needed",
      "Set deadlines for gathering missing evidence"
    ]
  },
  
  // Boundaries
  "boundaries": {
    title: "Project Scope",
    purpose: "Define the scope boundaries of the ISMS implementation for the project.",
    commonTasks: [
      "Add new boundaries (processes, systems, locations, etc.)",
      "Document what's in and out of scope",
      "Link boundaries to specific controls"
    ],
    tips: [
      "Clear boundary definition is crucial for a successful ISMS implementation",
      "Consider logical, physical, and organizational boundaries",
      "Document both what's included and excluded from scope"
    ]
  },
  
  // Stakeholders
  "stakeholders": {
    title: "Stakeholders",
    purpose: "Manage stakeholders involved in the ISMS implementation.",
    commonTasks: [
      "Add new stakeholders",
      "Assign roles and responsibilities",
      "Document stakeholder contact information"
    ],
    tips: [
      "Make sure all key stakeholders are identified early in the project",
      "Define clear roles and responsibilities for each stakeholder",
      "Regular communication with stakeholders is essential for success"
    ]
  },
  
  // Questionnaire
  "questionnaire": {
    title: "Questionnaire",
    purpose: "Collect and analyze information about the organization's information security posture.",
    commonTasks: [
      "Complete questionnaire sections",
      "Review responses",
      "Use responses to inform risk assessment and control selection"
    ],
    tips: [
      "Be honest in questionnaire responses for an accurate assessment",
      "Use the questionnaire results to identify areas needing attention",
      "Revisit the questionnaire periodically to track progress"
    ]
  },
  
  // Reports
  "reports": {
    title: "Reports",
    purpose: "Generate and view reports on the ISMS implementation status and effectiveness.",
    commonTasks: [
      "View risk distribution reports",
      "Check compliance status reports",
      "Generate executive summaries"
    ],
    tips: [
      "Reports can be useful for management presentations and audits",
      "Look for trends and patterns in the data to inform improvements",
      "Save or export reports for documentation purposes"
    ]
  },
  
  // User Management
  "user-management": {
    title: "User Management",
    purpose: "Administer users and their access permissions to the ISMS dashboard.",
    commonTasks: [
      "Add new users",
      "Assign user roles",
      "Modify user permissions",
      "Deactivate users"
    ],
    tips: [
      "Follow the principle of least privilege when assigning roles",
      "Regularly review user accounts and permissions",
      "Make sure to deactivate accounts for users who leave the organization"
    ]
  },
  
  // Profile Settings
  "profile-settings": {
    title: "Profile Settings",
    purpose: "Manage your personal user profile settings.",
    commonTasks: [
      "Update profile information",
      "Set notification preferences",
      "Configure dashboard display options"
    ],
    tips: [
      "Keep your contact information up to date",
      "Enable notifications for important events related to your responsibilities",
      "Customize the dashboard to show information most relevant to your role"
    ]
  },
  
  // Change Password
  "change-password": {
    title: "Change Password",
    purpose: "Update your account password for security.",
    commonTasks: [
      "Change your password"
    ],
    tips: [
      "Use a strong, unique password",
      "Change your password regularly for enhanced security",
      "Don't reuse passwords from other systems or websites"
    ]
  }
};

/**
 * Get detailed information about a page's purpose and common tasks
 * @param pageId The identifier of the page
 * @returns Contextual information about the page
 */
export async function getPageContext(pageId: string) {
  try {
    const pageInfo = pageContextInfo[pageId as keyof typeof pageContextInfo];
    
    if (!pageInfo) {
      return {
        title: "ISMS Dashboard",
        purpose: "Manage ISO 27001:2022 implementation and compliance.",
        commonTasks: ["Navigate to different sections using the sidebar"],
        tips: ["Ask the assistant if you have questions about any specific area"]
      };
    }
    
    return pageInfo;
  } catch (error) {
    console.error("Error getting page context:", error);
    return {
      title: "ISMS Dashboard",
      purpose: "Manage ISO 27001:2022 implementation and compliance.",
      error: "Could not load specific page context."
    };
  }
}

/**
 * Get a summary of all projects accessible to the user.
 * @returns An object containing the total number of projects and counts for each status.
 */
export async function getAllProjectsSummary() {
  try {
    // We need a function in project-service that fetches all projects without processing status yet
    // Assuming getProjects fetches all projects for the user
    const allProjects = await getProjects(); // This likely needs adjustment if getProjects uses browser client

    const summary = {
      total: allProjects.length,
      inProgress: 0,
      completed: 0,
      onHold: 0,
      // notStarted: 0, // Assuming 'Not Started' is not a distinct status anymore
    };

    allProjects.forEach(project => {
      // Use the status string from ProjectWithStatus
      switch (project.status) {
        case 'In Progress':
          summary.inProgress++;
          break;
        case 'Completed':
          summary.completed++;
          break;
        case 'On Hold':
          summary.onHold++;
          break;
        // case 'Not Started': // If needed
        //   summary.notStarted++;
        //   break;
      }
    });

    return summary;

  } catch (error) {
    console.error("Error getting all projects summary:", error);
    return {
      error: `Could not retrieve all projects summary: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get details for a specific risk within a project.
 * @param projectId The ID of the project
 * @param riskIdentifier The name or potentially ID of the risk/threat scenario
 * @returns Details of the risk or an error message.
 */
export async function getRiskDetails(projectId: string, riskIdentifier: string) {
  try {
    // Use the function that fetches detailed risk register data
    const fullRiskRegister = await getFullRiskRegisterData(projectId);

    // Find the risk by name (case-insensitive) or ID
    const targetRisk = fullRiskRegister.find(risk =>
      risk.threat_scenario_id === riskIdentifier ||
      risk.threat_name.toLowerCase() === riskIdentifier.toLowerCase()
    );

    if (!targetRisk) {
      return { error: `Risk "${riskIdentifier}" not found in project ${projectId}.` };
    }

    // Return relevant details (adjust as needed)
    return {
      threatName: targetRisk.threat_name,
      description: targetRisk.threat_description,
      threatActor: targetRisk.threat_actor_type,
      highestSLE: targetRisk.sle,
      highestARO: targetRisk.aro,
      calculatedALE: targetRisk.ale,
      aroFrequency: targetRisk.aro_frequency_text,
      highestRiskValue: targetRisk.highest_risk_value, // e.g., 8 for High
      gapCount: targetRisk.gap_count,
      assessmentCount: targetRisk.risk_assessment_count,
      evidenceCount: targetRisk.evidence_count,
      // Optionally include associated gap titles or assessment severities if needed
      // associatedGaps: targetRisk.gaps.map(g => g.title),
      // assessmentSeverities: targetRisk.riskAssessments.map(ra => ra.severity),
    };

  } catch (error) {
    console.error("Error getting risk details:", error);
    return {
      error: `Could not retrieve details for risk "${riskIdentifier}": ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get contextual suggestions based on the current page and user input
 * @param pageId The identifier of the current page
 * @param userInput The user's query or input
 * @returns Suggestions relevant to the page and user input
 */
export async function getSuggestions(pageId: string, userInput: string) {
  try {
    // Common ISMS terms and definitions
    const termsAndDefinitions = {
      "ISO 27001": "An international standard for information security management that provides a framework for establishing, implementing, maintaining, and continually improving an information security management system (ISMS).",
      "ISMS": "Information Security Management System - a systematic approach to managing sensitive company information",
      "Risk Assessment": "The process of identifying, analyzing and evaluating risks related to information security",
      "Statement of Applicability": "A document that identifies which controls from ISO 27001 are relevant to your organization",
      "Control": "A measure that modifies risk, including policies, procedures, guidelines, practices or organizational structures",
      "Asset": "Anything that has value to the organization, including information, software, hardware, services, people, and intangibles",
      "Threat": "A potential cause of an unwanted incident, which may result in harm to a system or organization",
      "Vulnerability": "A weakness of an asset or control that can be exploited by one or more threats",
      "Risk Treatment": "Process to modify risk which can involve avoiding, accepting, transferring or mitigating risk",
      "Risk Owner": "Person or entity with the accountability and authority to manage a risk",
      "Residual Risk": "Risk remaining after risk treatment",
      "Gap Analysis": "Assessment of the difference between current and target state to identify what needs to be done",
      "Audit": "Systematic, independent and documented process for obtaining evidence and evaluating it objectively"
    };
    
    // Check if user is asking about ISMS terms
    const lowerInput = userInput.toLowerCase();
    const matchedTerms = Object.keys(termsAndDefinitions).filter(term => 
      lowerInput.includes(term.toLowerCase())
    );
    
    if (matchedTerms.length > 0) {
      const definitions = matchedTerms.map(term => ({
        term,
        definition: termsAndDefinitions[term as keyof typeof termsAndDefinitions]
      }));
      
      return {
        type: "definitions",
        items: definitions
      };
    }
    
    // Check if user is asking about insurance providers (specific to risk register)
    if (pageId === "risk-register" && 
       (lowerInput.includes("insurance") || 
        lowerInput.includes("cyber insurance") || 
        lowerInput.includes("provider"))) {
      return {
        type: "insurance_providers",
        items: pageContextInfo["risk-register"]?.insuranceProviders || []
      };
    }
    
    // Default suggestions based on page
    const pageInfo = pageContextInfo[pageId as keyof typeof pageContextInfo];
    if (!pageInfo) {
      return {
        type: "general_help",
        items: [
          "What would you like to know about the ISMS Dashboard?",
          "I can help explain any section of the dashboard",
          "Ask me about ISO 27001:2022 controls and best practices"
        ]
      };
    }
    
    return {
      type: "page_help",
      page: pageInfo.title,
      items: pageInfo.tips,
      tasks: pageInfo.commonTasks
    };
  } catch (error) {
    console.error("Error getting suggestions:", error);
    return {
      type: "error",
      message: "Could not generate suggestions at this time."
    };
  }
}

/**
 * Get a list of ISO 27001:2022 controls related to a specific query
 * @param query The search query for finding relevant controls
 * @returns List of ISO controls matching the query
 */
export async function findRelevantControls(query: string) {
  try {
    // Create Supabase client using the server-side client
    const supabase = await createClient();
    
    // Search for controls that match the query
    const { data, error } = await supabase
      .from('controls')
      .select('id, number, title, description')
      .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
      .limit(10);
    
    if (error) throw error;
    
    return {
      query,
      controls: data || []
    };
  } catch (error) {
    console.error("Error finding relevant controls:", error);
    return {
      query,
      controls: [],
      error: "Could not retrieve control information."
    };
  }
}

// NOTE: The getCyberInsuranceProviders function has been replaced by a more general search_cyber_info function
// that is implemented directly in route.ts using OpenAI's web search capability


/**
 * Get a summary of a project's key components.
 * @param projectId The ID of the project
 * @returns A summary object with counts of boundaries, stakeholders, and risks.
 */
export async function getProjectSummary(projectId: string) {
  try {
    // Fetch data in parallel
    const [
      projectData,
      boundariesData,
      stakeholdersData,
      riskRegisterData
    ] = await Promise.all([
      getProjectById(projectId), // Pass server client
      getBoundaries(projectId), // Assumes this uses its own client or we pass one
      getStakeholders(projectId), // Assumes this uses its own client or we pass one
      getRiskRegisterForProject(projectId) // Assumes this uses its own client or we pass one
    ]);

    if (!projectData) {
      return { error: `Project with ID ${projectId} not found.` };
    }

    // Calculate risk summary
    const riskCounts = { high: 0, medium: 0, low: 0, total: riskRegisterData.length };
    riskRegisterData.forEach(risk => {
      // Assuming highest_risk_value maps: 8=high, 5=medium, 2=low
      if (risk.highest_risk_value && risk.highest_risk_value >= 7) riskCounts.high++;
      else if (risk.highest_risk_value && risk.highest_risk_value >= 4) riskCounts.medium++;
      else if (risk.highest_risk_value) riskCounts.low++;
    });

    return {
      projectName: projectData.name,
      status: projectData.status,
      boundaryCount: boundariesData.length,
      stakeholderCount: stakeholdersData.length,
      riskCount: riskCounts.total,
      riskSummary: riskCounts,
    };

  } catch (error) {
    console.error("Error getting project summary:", error);
    return {
      error: `Could not retrieve project summary: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get controls associated with a specific boundary within a project.
 * @param projectId The ID of the project
 * @param boundaryName The name of the boundary
 * @returns List of controls associated with the boundary.
 */
export async function getControlsForBoundary(projectId: string, boundaryName: string) {
  try {
    // 1. Find the boundary ID by name within the project
    const boundaries = await getBoundaries(projectId);
    const targetBoundary = boundaries.find(b => b.name.toLowerCase() === boundaryName.toLowerCase());

    if (!targetBoundary) {
      return { error: `Boundary named "${boundaryName}" not found in this project.` };
    }

    // 2. Fetch controls linked to this boundary ID
    const boundaryControls = await getBoundaryControlsWithDetails(targetBoundary.id);

    // 3. Format the result
    const controlsList = boundaryControls
      .map(bc => bc.controls ? { // Check if controls object exists
          reference: bc.controls.reference,
          title: bc.controls.description?.substring(0, 100) + '...' // Shorten description
        } : null)
      .filter(Boolean); // Remove nulls if controls object was missing

    return {
      boundaryName: targetBoundary.name,
      controls: controlsList,
      count: controlsList.length
    };

  } catch (error) {
    console.error("Error getting controls for boundary:", error);
    return {
      error: `Could not retrieve controls for boundary "${boundaryName}": ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

// Security: Define allowed tables and their project-scoped columns
interface TableConfig {
  projectColumn: string | null;
  allowedOperations: string[];
  requiresBoundaryCheck?: boolean;
  specialHandling?: string;
}

const ALLOWED_TABLES: Record<string, TableConfig> = {
  // Project-scoped tables (require project_id)
  "boundaries": { projectColumn: "project_id", allowedOperations: ["create", "read", "update", "delete"] },
  "risk_assessments": { projectColumn: "project_id", allowedOperations: ["create", "read", "update", "delete"] },
  "threat_scenarios": { projectColumn: "project_id", allowedOperations: ["create", "read", "update", "delete"] },
  "stakeholders": { projectColumn: "project_id", allowedOperations: ["create", "read", "update", "delete"] },
  "gaps": { projectColumn: "project_id", allowedOperations: ["create", "read", "update", "delete"] },
  "evidence": { projectColumn: "project_id", allowedOperations: ["create", "read", "update", "delete"] },
  "boundary_controls": { projectColumn: "boundary_id", allowedOperations: ["create", "read", "update", "delete"], requiresBoundaryCheck: true },
  "project_questionnaire_answers": { projectColumn: "project_id", allowedOperations: ["create", "read", "update", "delete"] },
  
  // Read-only reference tables
  "controls": { projectColumn: null, allowedOperations: ["read"] },
  "questionnaire_questions": { projectColumn: null, allowedOperations: ["read"] },
  
  // Special cases - projects table (user can only access their own projects)
  "projects": { projectColumn: "id", allowedOperations: ["read", "update"], specialHandling: "user_projects_only" }
};

type AllowedTableName = keyof typeof ALLOWED_TABLES;

// Security: Validate table access and operation
function validateTableAccess(tableName: string, operation: string): { isValid: boolean; error?: string; tableConfig?: TableConfig } {
  if (!(tableName in ALLOWED_TABLES)) {
    return { isValid: false, error: `Table "${tableName}" is not allowed. Only project-related tables are accessible.` };
  }
  
  const tableConfig = ALLOWED_TABLES[tableName as AllowedTableName];
  if (!tableConfig.allowedOperations.includes(operation as never)) {
    return { isValid: false, error: `Operation "${operation}" is not allowed on table "${tableName}".` };
  }
  
  return { isValid: true, tableConfig };
}

// Security: Get current user's accessible project IDs
async function getUserProjectIds(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    console.log(`DEBUG getUserProjectIds: User object:`, {
      id: user?.id,
      email: user?.email,
      user_metadata: user?.user_metadata
    });
    
    if (!user) {
      console.log(`DEBUG getUserProjectIds: User not authenticated`);
      throw new Error("User not authenticated");
    }
    
    // Get user's profile to find their organization_id
    console.log(`DEBUG: Getting user profile to find organization_id...`);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', user.id)
      .single();
    
    console.log(`DEBUG: User profile result:`, {
      profile,
      error: profileError?.message
    });
    
    // Try approach 1: By user's organization_id from profile
    if (profile?.organization_id) {
      console.log(`DEBUG: Trying approach "profile organization_id"...`);
      const { data: projects1, error: error1 } = await (supabase as any)
        .from('projects')
        .select('id, name, organization_id, user_id')
        .eq('organization_id', profile.organization_id);
      
      console.log(`DEBUG: Approach "profile organization_id" result:`, {
        projects: projects1?.length || 0,
        error: error1?.message,
        projectData: projects1
      });
      
      if (projects1 && projects1.length > 0) {
        const projectIds = projects1.map((p: any) => p.id);
        console.log(`DEBUG getUserProjectIds: SUCCESS with "profile organization_id", returning project IDs:`, projectIds);
        return projectIds;
      }
    }
    
    // Try approach 2: By user_id (projects created by this user)
    console.log(`DEBUG: Trying approach "user_id"...`);
    const { data: projects2, error: error2 } = await (supabase as any)
      .from('projects')
      .select('id, name, organization_id, user_id')
      .eq('user_id', user.id);
    
    console.log(`DEBUG: Approach "user_id" result:`, {
      projects: projects2?.length || 0,
      error: error2?.message,
      projectData: projects2
    });
    
    if (projects2 && projects2.length > 0) {
      const projectIds = projects2.map((p: any) => p.id);
      console.log(`DEBUG getUserProjectIds: SUCCESS with "user_id", returning project IDs:`, projectIds);
      return projectIds;
    }
    
    // Try approach 3: By organization_id from user_metadata
    if (user.user_metadata?.organization_id) {
      console.log(`DEBUG: Trying approach "user_metadata organization_id"...`);
      const { data: projects3, error: error3 } = await (supabase as any)
        .from('projects')
        .select('id, name, organization_id, user_id')
        .eq('organization_id', user.user_metadata.organization_id);
      
      console.log(`DEBUG: Approach "user_metadata organization_id" result:`, {
        projects: projects3?.length || 0,
        error: error3?.message,
        projectData: projects3
      });
      
      if (projects3 && projects3.length > 0) {
        const projectIds = projects3.map((p: any) => p.id);
        console.log(`DEBUG getUserProjectIds: SUCCESS with "user_metadata organization_id", returning project IDs:`, projectIds);
        return projectIds;
      }
    }
    
    // If no projects found, let's see what's in the database
    console.log(`DEBUG: No projects found with any approach. Checking all projects in database...`);
    const { data: allProjects, error: allError } = await supabase
      .from('projects')
      .select('id, name, organization_id, user_id')
      .limit(5);
    
    console.log(`DEBUG: Sample projects in database:`, {
      count: allProjects?.length || 0,
      projects: allProjects,
      error: allError?.message
    });
    
    console.log(`DEBUG: No accessible projects found for user`);
    return [];
    
  } catch (error) {
    console.error("Error getting user project IDs:", error);
    return [];
  }
}

// Security: Validate project access for boundary_controls
async function validateBoundaryAccess(boundaryId: string, userProjectIds: string[]): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: boundary, error } = await supabase
      .from('boundaries')
      .select('project_id')
      .eq('id', boundaryId)
      .single();
    
    if (error || !boundary) {
      return false;
    }
    
    return userProjectIds.includes(boundary.project_id);
  } catch (error) {
    console.error("Error validating boundary access:", error);
    return false;
  }
}

// CRUD Operations

/**
 * Create a new record in a specified table with security controls.
 * @param tableName The name of the table to insert into.
 * @param data The data object containing column values.
 * @returns The created record or an error message.
 */
export async function createRecord(tableName: string, data: Record<string, unknown>) {
  try {
    // Security validation
    const validation = validateTableAccess(tableName, "create");
    if (!validation.isValid) {
      return { error: validation.error };
    }

    const supabase = await createClient();
    
    // Get user's accessible project IDs for security validation
    const userProjectIds = await getUserProjectIds();
    if (userProjectIds.length === 0) {
      return { error: "No accessible projects found for user" };
    }

    // Validate project access if table requires it
    const tableConfig = validation.tableConfig!;
    if (tableConfig.projectColumn) {
      if (tableConfig.requiresBoundaryCheck) {
        // Special handling for boundary_controls table
        const boundaryId = data[tableConfig.projectColumn] as string;
        if (!boundaryId) {
          return { error: `${tableConfig.projectColumn} is required for table ${tableName}` };
        }
        
        const hasAccess = await validateBoundaryAccess(boundaryId, userProjectIds);
        if (!hasAccess) {
          return { error: "Access denied: boundary not accessible to user" };
        }
      } else {
        // Standard project validation
        const projectId = data[tableConfig.projectColumn] as string;
        if (!projectId) {
          return { error: `${tableConfig.projectColumn} is required for table ${tableName}` };
        }
        
        if (!userProjectIds.includes(projectId)) {
          return { error: "Access denied: project not accessible to user" };
        }
      }
    }

    // Special handling for projects table
    if (tableConfig.specialHandling === "user_projects_only") {
      return { error: "Creating new projects is not allowed through this interface" };
    }

    // Perform the insert operation using type assertion for dynamic table names
    const { data: result, error } = await (supabase as any)
      .from(tableName)
      .insert(data)
      .select()
      .single();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return {
      success: true,
      data: result,
      message: `Record created successfully in ${tableName}`
    };

  } catch (error) {
    console.error(`Error creating record in ${tableName}:`, error);
    return {
      error: `Failed to create record: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Read records from a specified table with security controls.
 * @param tableName The name of the table to read from.
 * @param filters Optional filters to apply to the query.
 * @param columns Optional columns to select (defaults to all).
 * @returns The records or an error message.
 */
export async function readRecords(
  tableName: string, 
  projectId?: string,
  filters?: Record<string, unknown>, 
  columns?: string
) {
  try {
    console.log(`DEBUG readRecords called with:`, {
      tableName,
      projectId,
      filters,
      columns
    });
    
    // Security validation
    const validation = validateTableAccess(tableName, "read");
    if (!validation.isValid) {
      console.log(`DEBUG: Table access validation failed:`, validation.error);
      return { error: validation.error };
    }

    const supabase = await createClient();
    const tableConfig = validation.tableConfig!;
    
    // Get user's accessible project IDs for security validation
    const userProjectIds = await getUserProjectIds();
    console.log(`DEBUG: User accessible project IDs:`, userProjectIds);
    
    if (userProjectIds.length === 0 && tableConfig.projectColumn) {
      console.log(`DEBUG: No accessible projects found for user`);
      return { error: "No accessible projects found for user" };
    }

    // Start building the query
    let query = (supabase as any).from(tableName);
    
    // Select specific columns or all
    if (columns) {
      query = query.select(columns);
    } else {
      query = query.select('*');
    }

    // Apply security filters based on table configuration
    if (tableConfig.projectColumn && tableConfig.specialHandling !== "user_projects_only") {
      if (tableConfig.requiresBoundaryCheck) {
        // For boundary_controls, we need to join with boundaries to check project access
        // This is more complex, so we'll filter after the query for now
        // In production, consider using a database view or RLS policy
      } else {
        // If projectId is provided, filter by that specific project (if user has access)
        if (projectId) {
          console.log(`DEBUG: Checking if projectId ${projectId} is in userProjectIds:`, userProjectIds);
          if (userProjectIds.includes(projectId)) {
            console.log(`DEBUG: Access granted, filtering by projectId: ${projectId}`);
            query = query.eq(tableConfig.projectColumn, projectId);
          } else {
            console.log(`DEBUG: Access denied - projectId ${projectId} not in accessible projects`);
            return { error: "Access denied: project not accessible to user" };
          }
        } else {
          console.log(`DEBUG: No projectId provided, filtering by all accessible projects:`, userProjectIds);
          // Filter by user's accessible project IDs
          query = query.in(tableConfig.projectColumn, userProjectIds);
        }
      }
    } else if (tableConfig.specialHandling === "user_projects_only") {
      // For projects table, only show user's projects
      if (projectId) {
        if (userProjectIds.includes(projectId)) {
          query = query.eq('id', projectId);
        } else {
          return { error: "Access denied: project not accessible to user" };
        }
      } else {
        query = query.in('id', userProjectIds);
      }
    }

    // Apply additional filters
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          query = query.eq(key, value);
        }
      });
    }

    const { data: result, error } = await query;

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Post-query filtering for boundary_controls if needed
    let filteredResult = result;
    if (tableConfig.requiresBoundaryCheck && result) {
      // Filter boundary_controls based on boundary access
      const accessibleBoundaryControls = [];
      for (const record of result) {
        const boundaryId = record[tableConfig.projectColumn!];
        if (await validateBoundaryAccess(boundaryId, userProjectIds)) {
          accessibleBoundaryControls.push(record);
        }
      }
      filteredResult = accessibleBoundaryControls;
    }

    return {
      success: true,
      data: filteredResult || [],
      count: filteredResult?.length || 0,
      message: `Records retrieved successfully from ${tableName}`
    };

  } catch (error) {
    console.error(`Error reading records from ${tableName}:`, error);
    return {
      error: `Failed to read records: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Update a record in a specified table with security controls.
 * @param tableName The name of the table to update.
 * @param id The ID of the record to update.
 * @param data The data object containing updated column values.
 * @returns The updated record or an error message.
 */
export async function updateRecord(
  tableName: string, 
  id: string, 
  data: Record<string, unknown>
) {
  try {
    // Security validation
    const validation = validateTableAccess(tableName, "update");
    if (!validation.isValid) {
      return { error: validation.error };
    }

    const supabase = await createClient();
    const tableConfig = validation.tableConfig!;
    
    // Get user's accessible project IDs for security validation
    const userProjectIds = await getUserProjectIds();
    if (userProjectIds.length === 0) {
      return { error: "No accessible projects found for user" };
    }

    // First, verify the record exists and user has access to it
    let accessQuery = (supabase as any).from(tableName).select('*').eq('id', id);
    
    // Apply security filters
    if (tableConfig.projectColumn && tableConfig.specialHandling !== "user_projects_only") {
      if (!tableConfig.requiresBoundaryCheck) {
        accessQuery = accessQuery.in(tableConfig.projectColumn, userProjectIds);
      }
    } else if (tableConfig.specialHandling === "user_projects_only") {
      accessQuery = accessQuery.in('id', userProjectIds);
    }

    const { data: existingRecord, error: fetchError } = await accessQuery.single();

    if (fetchError || !existingRecord) {
      return { error: "Record not found or access denied" };
    }

    // Additional boundary check if required
    if (tableConfig.requiresBoundaryCheck) {
      const boundaryId = existingRecord[tableConfig.projectColumn!];
      const hasAccess = await validateBoundaryAccess(boundaryId, userProjectIds);
      if (!hasAccess) {
        return { error: "Access denied: boundary not accessible to user" };
      }
    }

    // Validate project access for updated data if it contains project references
    if (tableConfig.projectColumn && data[tableConfig.projectColumn]) {
      if (tableConfig.requiresBoundaryCheck) {
        const newBoundaryId = data[tableConfig.projectColumn] as string;
        const hasAccess = await validateBoundaryAccess(newBoundaryId, userProjectIds);
        if (!hasAccess) {
          return { error: "Access denied: new boundary not accessible to user" };
        }
      } else {
        const newProjectId = data[tableConfig.projectColumn] as string;
        if (!userProjectIds.includes(newProjectId)) {
          return { error: "Access denied: new project not accessible to user" };
        }
      }
    }

    // Perform the update operation
    const { data: result, error } = await (supabase as any)
      .from(tableName)
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return {
      success: true,
      data: result,
      message: `Record updated successfully in ${tableName}`
    };

  } catch (error) {
    console.error(`Error updating record in ${tableName}:`, error);
    return {
      error: `Failed to update record: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Delete a record from a specified table with security controls.
 * @param tableName The name of the table to delete from.
 * @param id The ID of the record to delete.
 * @returns Success confirmation or an error message.
 */
export async function deleteRecord(tableName: string, id: string) {
  try {
    // Security validation
    const validation = validateTableAccess(tableName, "delete");
    if (!validation.isValid) {
      return { error: validation.error };
    }

    const supabase = await createClient();
    const tableConfig = validation.tableConfig!;
    
    // Get user's accessible project IDs for security validation
    const userProjectIds = await getUserProjectIds();
    if (userProjectIds.length === 0) {
      return { error: "No accessible projects found for user" };
    }

    // First, verify the record exists and user has access to it
    let accessQuery = (supabase as any).from(tableName).select('*').eq('id', id);
    
    // Apply security filters
    if (tableConfig.projectColumn && tableConfig.specialHandling !== "user_projects_only") {
      if (!tableConfig.requiresBoundaryCheck) {
        accessQuery = accessQuery.in(tableConfig.projectColumn, userProjectIds);
      }
    } else if (tableConfig.specialHandling === "user_projects_only") {
      accessQuery = accessQuery.in('id', userProjectIds);
    }

    const { data: existingRecord, error: fetchError } = await accessQuery.single();

    if (fetchError || !existingRecord) {
      return { error: "Record not found or access denied" };
    }

    // Additional boundary check if required
    if (tableConfig.requiresBoundaryCheck) {
      const boundaryId = existingRecord[tableConfig.projectColumn!];
      const hasAccess = await validateBoundaryAccess(boundaryId, userProjectIds);
      if (!hasAccess) {
        return { error: "Access denied: boundary not accessible to user" };
      }
    }

    // Perform the delete operation
    const { error } = await (supabase as any)
      .from(tableName)
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return {
      success: true,
      message: `Record deleted successfully from ${tableName}`,
      deletedId: id
    };

  } catch (error) {
    console.error(`Error deleting record from ${tableName}:`, error);
    return {
      error: `Failed to delete record: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}
