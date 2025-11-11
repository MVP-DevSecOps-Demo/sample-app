import { createBrowserClient } from '@supabase/ssr';
import { prepareControlAssociations } from './control-lookup-service';

export interface DocumentRecord {
  id: string;
  project_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  document_category: 'Policy' | 'Procedure' | 'Implementation' | 'TestEvidence' | 'Evidence' | 'Other';
  phase: 'document-review' | 'implementation-review' | 'test-of-design' | 'other';
  title: string;
  description: string | null;
  uploaded_by: string;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
  control_references?: string[];
}

export interface DocumentUpload {
  projectId: string;
  file: File;
  documentCategory: 'Policy' | 'Procedure' | 'Implementation' | 'TestEvidence' | 'Evidence' | 'Other';
  phase: 'document-review' | 'implementation-review' | 'test-of-design' | 'other';
  applicableControlReferences?: string[];
  description?: string;
  organizationId?: string;
}

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function uploadDocument({
  projectId,
  file,
  documentCategory,
  phase,
  applicableControlReferences = [],
  description = '',
  organizationId
}: DocumentUpload): Promise<DocumentRecord> {
  try {
    // First, upload the file to Supabase Storage
    const fileExtension = file.name.split('.').pop();
    const fileName = `${phase}_${documentCategory.toLowerCase()}_${Date.now()}.${fileExtension}`;
    const filePath = `documents/${projectId}/${fileName}`;

    const { error: storageError } = await supabase.storage
      .from('evidence-files')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (storageError) {
      throw new Error(`File upload failed: ${storageError.message}`);
    }

    // Get the current user
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('Authentication error:', authError);
      throw new Error(`Authentication failed: ${authError.message}`);
    }
    if (!authData.user) {
      throw new Error('User not authenticated');
    }

    // Save document metadata to documents table
    const documentData = {
      project_id: projectId,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type,
      file_size: file.size,
      document_category: documentCategory,
      phase: phase,
      title: file.name,
      description: description || `${documentCategory} document uploaded via ${phase}`,
      uploaded_by: authData.user.id,
      organization_id: organizationId
    };

    const { data, error } = await supabase
      .from('documents')
      .insert(documentData)
      .select()
      .single();

    if (error) {
      // If database insert fails, clean up the uploaded file
      await supabase.storage
        .from('evidence-files')
        .remove([filePath]);
      throw new Error(`Database insert failed: ${error.message}`);
    }

    // Insert control associations with framework detection and control IDs
    if (applicableControlReferences.length > 0) {
      try {
        // Prepare control associations with control IDs and framework information
        const controlAssociations = await prepareControlAssociations(
          data.id, 
          applicableControlReferences
        );

        if (controlAssociations.length > 0) {
          const { error: controlError } = await supabase
            .from('document_controls')
            .insert(controlAssociations);

          if (controlError) {
            console.error('Failed to insert control associations:', {
              error: controlError.message || controlError,
              code: controlError.code,
              details: controlError.details,
              hint: controlError.hint,
              documentId: data.id,
              associationsCount: controlAssociations.length,
              controlAssociations: controlAssociations
            });
            // Don't fail the entire upload, just log the error
          } else {
            console.log(`Successfully inserted ${controlAssociations.length} control associations for document ${data.id}`);
          }
        } else {
          console.warn('No valid control associations could be prepared from provided references');
        }
      } catch (error) {
        console.error('Error preparing control associations:', error);
        // Continue with document upload even if control associations fail
      }
    }

    return {
      ...data,
      control_references: applicableControlReferences
    } as DocumentRecord;

  } catch (error) {
    console.error('Document upload error:', error);
    throw error;
  }
}

export async function getDocuments(
  projectId: string,
  documentCategory?: 'Policy' | 'Procedure' | 'Implementation' | 'TestEvidence' | 'Evidence' | 'Other',
  phase?: 'document-review' | 'implementation-review' | 'test-of-design' | 'other'
): Promise<DocumentRecord[]> {
  try {
    let query = supabase
      .from('documents')
      .select(`
        *,
        document_controls (
          control_reference,
          control_id,
          framework
        )
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    // Filter by document category if specified
    if (documentCategory) {
      query = query.eq('document_category', documentCategory);
    }

    // Filter by phase if specified
    if (phase) {
      query = query.eq('phase', phase);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch documents: ${error.message}`);
    }

    // Transform the data and fetch control details separately based on framework
    const documentsWithControls = await Promise.all(
      (data || []).map(async (doc) => {
        // Fetch control details for each document control association
        const enhancedDocumentControls = await Promise.all(
          (doc.document_controls || []).map(async (dc: any) => {
            let controlDetails = null;

            try {
              if (dc.framework === 'ISO' || !dc.framework) {
                // Fetch from controls table (ISO controls)
                const { data: isoControl } = await supabase
                  .from('controls')
                  .select('id, reference, description, domain, created_at')
                  .eq('id', dc.control_id)
                  .single();
                
                controlDetails = isoControl;
              } else if (dc.framework === 'NIST') {
                // Fetch from nist_controls table (NIST controls)
                const { data: nistControl } = await supabase
                  .from('nist_controls')
                  .select('id, category, sub_category, description, domain, created_at')
                  .eq('id', dc.control_id)
                  .single();
                
                if (nistControl) {
                  // Normalize NIST control to match Control interface
                  controlDetails = {
                    id: nistControl.id,
                    reference: nistControl.sub_category || nistControl.category,
                    description: nistControl.description,
                    domain: nistControl.domain || '',
                    created_at: nistControl.created_at
                  };
                }
              }
            } catch (controlError) {
              console.error(`Error fetching control details for control_id ${dc.control_id}:`, controlError);
            }

            return {
              document_id: doc.id,
              control_reference: dc.control_reference,
              control_id: dc.control_id,
              framework: dc.framework,
              controls: controlDetails
            };
          })
        );

        return {
          ...doc,
          // Maintain backward compatibility with control_references
          control_references: doc.document_controls?.map((dc: any) => dc.control_reference) || [],
          // Enhanced control associations with framework information
          document_controls: enhancedDocumentControls
        };
      })
    );

    return documentsWithControls;

  } catch (error) {
    console.error('Get documents error:', error);
    throw error;
  }
}

export async function deleteDocument(documentId: string): Promise<boolean> {
  try {
    // First, get the document to find the file path
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('file_path')
      .eq('id', documentId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch document: ${fetchError.message}`);
    }

    // Delete the file from storage if it exists
    if (document?.file_path) {
      const { error: storageError } = await supabase.storage
        .from('evidence-files')
        .remove([document.file_path]);

      if (storageError) {
        console.warn('Failed to delete file from storage:', storageError.message);
        // Continue with database deletion even if file deletion fails
      }
    }

    // Delete the document record (this will cascade delete control associations)
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) {
      throw new Error(`Failed to delete document record: ${deleteError.message}`);
    }

    return true;

  } catch (error) {
    console.error('Delete document error:', error);
    throw error;
  }
}

export async function getDocumentDownloadUrl(filePath: string): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from('evidence-files')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (error) {
      throw new Error(`Failed to generate download URL: ${error.message}`);
    }

    return data.signedUrl;

  } catch (error) {
    console.error('Get download URL error:', error);
    throw error;
  }
}

export async function getDocumentBinaryData(filePath: string): Promise<ArrayBuffer> {
  try {
    const { data, error } = await supabase.storage
      .from('evidence-files')
      .download(filePath);

    if (error) {
      throw new Error(`Failed to download document: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data received from document download');
    }

    // Convert Blob to ArrayBuffer for binary processing
    const arrayBuffer = await data.arrayBuffer();
    return arrayBuffer;

  } catch (error) {
    console.error('Get document binary data error:', error);
    throw error;
  }
}

export async function updateDocumentStatus(
  documentId: string,
  _status: 'Approved' | 'Under Review' | 'Draft' | 'Rejected'
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('evidence')
      .update({ 
        updated_at: new Date().toISOString()
      })
      .eq('id', documentId);

    if (error) {
      throw new Error(`Failed to update document status: ${error.message}`);
    }

    return true;

  } catch (error) {
    console.error('Update document status error:', error);
    throw error;
  }
}

// Utility function to validate file upload
export function validateDocumentFile(file: File): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Valid document types for policy/procedure documents
  const validTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/rtf'
  ];
  
  if (!validTypes.includes(file.type)) {
    errors.push('Please select a valid document file (PDF, DOC, DOCX, TXT, RTF)');
  }
  
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    errors.push('File size must be less than 10MB');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}